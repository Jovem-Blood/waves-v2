import { fileURLToPath } from 'node:url'

import type { TrackMetadata } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RecommendationUnavailableError } from '../../server/services/recommendation.errors'
import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { AutoplayRepository } from '../../server/repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../../server/repositories/autoplay-suggestion.repository'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { AutoplayOrchestrator } from '../../server/services/autoplay-orchestrator.service'
import { AutoplayService } from '../../server/services/autoplay.service'
import { PlayerStateService } from '../../server/services/player-state.service'
import { QueueService } from '../../server/services/queue.service'
import type { WavesLogger } from '../../server/utils/logger'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const timestamp = '2026-06-18T17:00:00.000Z'
const now = () => new Date(timestamp)
const firstTrack: TrackMetadata = {
  id: 'spotify:first',
  provider: 'spotify',
  providerTrackId: 'first',
  title: 'First',
  artists: ['Artist'],
  durationMs: 120_000,
}
const recommendation: TrackMetadata = {
  ...firstTrack,
  id: 'spotify:recommended',
  providerTrackId: 'recommended',
  title: 'Recommended',
}

let connection: DatabaseConnection

function createHarness(getRecommendations = vi.fn().mockResolvedValue([recommendation])) {
  const queueRepository = new QueueRepository(connection.db)
  const unitOfWork = new DatabaseUnitOfWork(connection.db, now)
  let nextId = 0
  const queueService = new QueueService(queueRepository, unitOfWork, now, () => `queue-${++nextId}`)
  const playerService = new PlayerStateService(
    new PlayerStateRepository(connection.db, now),
    unitOfWork,
    now,
  )
  const suggestionRepository = new AutoplaySuggestionRepository(connection.db)
  const autoplayService = new AutoplayService(
    new AutoplayRepository(connection.db, now),
    suggestionRepository,
    now,
  )
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as WavesLogger
  const orchestrator = new AutoplayOrchestrator(
    autoplayService,
    queueService,
    queueRepository,
    suggestionRepository,
    playerService,
    { getRecommendations },
    now,
    logger,
  )
  return { autoplayService, getRecommendations, orchestrator, playerService, queueService }
}

function startTrack(harness: ReturnType<typeof createHarness>) {
  const item = harness.queueService.add({ track: firstTrack })
  harness.playerService.voiceConnected('guild', 'Waves', 'voice', 'Music')
  harness.playerService.claimPlayback()
  return item
}

beforeEach(() => {
  connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
})

afterEach(() => connection.close())

describe('AutoplayOrchestrator', () => {
  it('adds, claims and returns a recommendation after the final track', async () => {
    const harness = createHarness()
    const item = startTrack(harness)
    harness.autoplayService.update({ enabled: true })

    await harness.orchestrator.queueChanged()
    const result = await harness.orchestrator.completePlayback({
      queueItemId: item.id,
      outcome: 'played',
    })

    expect(harness.getRecommendations).toHaveBeenCalledWith(
      [expect.objectContaining({ providerTrackId: 'first' })],
      expect.any(Set),
    )
    expect(result.nextItem).toMatchObject({
      track: recommendation,
      requestedByDisplayName: 'Autoplay',
      status: 'playing',
    })
    expect(result.player.currentQueueItemId).toBe(result.nextItem?.id)
    expect(harness.autoplayService.get().failureCode).toBeNull()
  })

  it('excludes recently played candidates and records empty results', async () => {
    const harness = createHarness(vi.fn().mockResolvedValue([firstTrack]))
    const item = startTrack(harness)
    harness.autoplayService.update({ enabled: true })

    await harness.orchestrator.queueChanged()
    const result = await harness.orchestrator.completePlayback({
      queueItemId: item.id,
      outcome: 'played',
    })

    expect(result.nextItem).toBeUndefined()
    expect(harness.autoplayService.get()).toMatchObject({
      enabled: true,
      failureCode: 'no_candidates',
    })
  })

  it('keeps completion successful when Spotify is unavailable', async () => {
    const harness = createHarness(vi.fn().mockRejectedValue(new RecommendationUnavailableError()))
    const item = startTrack(harness)
    harness.autoplayService.update({ enabled: true })

    const result = await harness.orchestrator.completePlayback({
      queueItemId: item.id,
      outcome: 'played',
    })

    expect(result.player.status).toBe('idle')
    expect(harness.autoplayService.get().failureCode).toBe('recommendation_unavailable')
  })

  it('deduplicates concurrent completion refills', async () => {
    let resolveRecommendations: ((tracks: TrackMetadata[]) => void) | undefined
    const recommendations = new Promise<TrackMetadata[]>((resolve) => {
      resolveRecommendations = resolve
    })
    const provider = vi.fn().mockReturnValue(recommendations)
    const harness = createHarness(provider)
    const item = startTrack(harness)
    harness.autoplayService.update({ enabled: true })

    const generation = harness.orchestrator.queueChanged()
    await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce())
    const first = harness.orchestrator.completePlayback({ queueItemId: item.id, outcome: 'played' })
    const repeated = harness.orchestrator.completePlayback({
      queueItemId: item.id,
      outcome: 'played',
    })
    resolveRecommendations?.([recommendation])

    const [firstResult, repeatedResult] = await Promise.all([first, repeated, generation])
    expect(firstResult.nextItem?.id).toBe(repeatedResult.nextItem?.id)
    expect(harness.queueService.list()).toHaveLength(1)
  })

  it('prefers a human track added during recommendation lookup', async () => {
    let resolveRecommendations: ((tracks: TrackMetadata[]) => void) | undefined
    const provider = vi.fn().mockReturnValue(
      new Promise<TrackMetadata[]>((resolve) => {
        resolveRecommendations = resolve
      }),
    )
    const harness = createHarness(provider)
    const item = startTrack(harness)
    harness.autoplayService.update({ enabled: true })
    const generation = harness.orchestrator.queueChanged()
    await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce())

    const human = harness.queueService.add({
      track: { ...recommendation, id: 'spotify:human', providerTrackId: 'human', title: 'Human' },
      requestedByDisplayName: 'Luis',
    })
    resolveRecommendations?.([recommendation])
    await generation
    const completion = harness.orchestrator.completePlayback({
      queueItemId: item.id,
      outcome: 'played',
    })

    await expect(completion).resolves.toMatchObject({ nextItem: { id: human.id } })
    expect(harness.queueService.list()).toHaveLength(1)
  })
})
