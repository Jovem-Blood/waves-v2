import { fileURLToPath } from 'node:url'

import type { TrackMetadata } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { AutoplayCandidateRepository } from '../../server/repositories/autoplay-candidate.repository'
import { AutoplayRepository } from '../../server/repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../../server/repositories/autoplay-suggestion.repository'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { AutoplayOrchestrator } from '../../server/services/autoplay-orchestrator.service'
import { AutoplayService } from '../../server/services/autoplay.service'
import type { RecommendationCandidate } from '../../server/services/recommendation.types'
import { RecommendationUnavailableError } from '../../server/services/recommendation.errors'
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

function track(index: number, artist = `Artist ${index}`): TrackMetadata {
  return {
    ...firstTrack,
    id: `spotify:recommended-${index}`,
    providerTrackId: `recommended-${index}`,
    title: `Recommended ${index}`,
    artists: [artist],
  }
}

function candidate(
  value: TrackMetadata,
  strategy: RecommendationCandidate['strategy'] = 'similar',
) {
  return {
    provider: 'lastfm' as const,
    identityKey: `${value.title.toLowerCase()}::${value.artists[0]?.toLowerCase() ?? ''}`,
    title: value.title,
    artists: value.artists,
    score: 0.95,
    strategy,
    seedTrackKey: 'spotify:first',
  }
}

let connection: DatabaseConnection

function createHarness(candidateBatches: RecommendationCandidate[][] = []) {
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
  const candidateRepository = new AutoplayCandidateRepository(connection.db)
  const autoplayService = new AutoplayService(
    new AutoplayRepository(connection.db, now),
    suggestionRepository,
    now,
  )
  const tracks = new Map<number, TrackMetadata>()
  for (let index = 1; index <= 60; index += 1) tracks.set(index, track(index))
  const getCandidates = vi.fn()
  candidateBatches.forEach((batch) => getCandidates.mockResolvedValueOnce(batch))
  getCandidates.mockResolvedValue([])
  const resolveCandidate = vi.fn((entry: RecommendationCandidate) =>
    Promise.resolve(
      [...tracks.values()].find(
        (value) =>
          `${value.title.toLowerCase()}::${value.artists[0]?.toLowerCase() ?? ''}` ===
          entry.identityKey,
      ),
    ),
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
    candidateRepository,
    playerService,
    { getCandidates, resolveCandidate },
    now,
    () => 0,
    logger,
  )
  return {
    autoplayService,
    candidateRepository,
    getCandidates,
    orchestrator,
    playerService,
    queueService,
    resolveCandidate,
    suggestionRepository,
  }
}

function startTrack(harness: ReturnType<typeof createHarness>) {
  const item = harness.queueService.add({ track: firstTrack })
  harness.playerService.voiceConnected('guild', 'Waves', 'voice', 'Music')
  harness.playerService.claimPlayback()
  harness.autoplayService.update({ enabled: true })
  return item
}

beforeEach(() => {
  connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
})

afterEach(() => connection.close())

describe('AutoplayOrchestrator', () => {
  it('keeps six visible ghosts and a reservoir capped at thirty candidates', async () => {
    const recommendations = Array.from({ length: 40 }, (_, index) => candidate(track(index + 1)))
    const harness = createHarness([recommendations])
    startTrack(harness)

    await harness.orchestrator.queueChanged()

    expect(harness.suggestionRepository.list()).toHaveLength(6)
    expect(harness.candidateRepository.list()).toHaveLength(24)
    expect(harness.resolveCandidate).toHaveBeenCalledTimes(6)
  })

  it('does not compound ranking adjustments when the queue is unchanged', async () => {
    const recommendations = Array.from({ length: 20 }, (_, index) =>
      candidate(track(index + 1, index === 0 ? 'Artist' : undefined)),
    )
    const harness = createHarness([recommendations])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const scores = harness.candidateRepository.list().map((entry) => entry.score)

    await harness.orchestrator.queueChanged()

    expect(harness.candidateRepository.list().map((entry) => entry.score)).toEqual(scores)
  })

  it('promotes suggestions over consecutive cycles and enriches from each promoted track', async () => {
    const firstBatch = Array.from({ length: 12 }, (_, index) => candidate(track(index + 1)))
    const secondBatch = Array.from({ length: 12 }, (_, index) => candidate(track(index + 20)))
    const thirdBatch = Array.from({ length: 12 }, (_, index) => candidate(track(index + 40)))
    const harness = createHarness([firstBatch, secondBatch, thirdBatch])
    const initial = startTrack(harness)
    await harness.orchestrator.queueChanged()

    const first = await harness.orchestrator.completePlayback({
      queueItemId: initial.id,
      outcome: 'played',
    })
    expect(first.nextItem?.origin).toBe('autoplay')
    expect(harness.suggestionRepository.list()).toHaveLength(6)

    const second = await harness.orchestrator.completePlayback({
      queueItemId: first.nextItem?.id ?? '',
      outcome: 'played',
    })
    expect(second.nextItem?.origin).toBe('autoplay')
    expect(harness.suggestionRepository.list()).toHaveLength(6)
    expect(harness.getCandidates.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('excludes the current track and normalized duplicates', async () => {
    const duplicateCurrent = candidate(firstTrack)
    const duplicate = candidate(track(1))
    const duplicateVariant = { ...duplicate, identityKey: duplicate.identityKey, score: 0.5 }
    const harness = createHarness([
      [
        duplicateCurrent,
        duplicate,
        duplicateVariant,
        ...Array.from({ length: 6 }, (_, index) => candidate(track(index + 2))),
      ],
    ])
    startTrack(harness)

    await harness.orchestrator.queueChanged()

    const ids = harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)
    expect(ids).not.toContain('first')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('promotes another ghost after skipping an autoplay track', async () => {
    const firstBatch = Array.from({ length: 20 }, (_, index) => candidate(track(index + 1)))
    const secondBatch = Array.from({ length: 12 }, (_, index) => candidate(track(index + 30)))
    const harness = createHarness([firstBatch, secondBatch])
    const initial = startTrack(harness)
    await harness.orchestrator.queueChanged()
    const promoted = await harness.orchestrator.completePlayback({
      queueItemId: initial.id,
      outcome: 'played',
    })

    const skipped = await harness.orchestrator.skip()

    expect(skipped.player.status).toBe('playing')
    expect(skipped.queue[0]?.origin).toBe('autoplay')
    expect(skipped.queue[0]?.id).not.toBe(promoted.nextItem?.id)
  })

  it('keeps the human anchor after the human track leaves the active queue', async () => {
    const harness = createHarness([
      Array.from({ length: 20 }, (_, index) => candidate(track(index + 1))),
    ])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const fingerprint = harness.suggestionRepository.list()[0]?.seedFingerprint

    await harness.orchestrator.skip()

    expect(harness.suggestionRepository.list()).toHaveLength(6)
    expect(
      harness.suggestionRepository
        .list()
        .every((suggestion) => suggestion.seedFingerprint === fingerprint),
    ).toBe(true)
  })

  it('rejects one ghost for the session and replaces it immediately', async () => {
    const recommendations = Array.from({ length: 20 }, (_, index) => candidate(track(index + 1)))
    const harness = createHarness([recommendations])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const rejected = harness.suggestionRepository.list()[0]

    await harness.orchestrator.rejectSuggestion(rejected?.track.providerTrackId ?? '')

    const visible = harness.suggestionRepository.list()
    expect(visible).toHaveLength(6)
    expect(visible.map((entry) => entry.track.providerTrackId)).not.toContain(
      rejected?.track.providerTrackId,
    )
  })

  it('clears session candidates and ghosts when voice disconnects', async () => {
    const harness = createHarness([
      Array.from({ length: 20 }, (_, index) => candidate(track(index + 1))),
    ])
    startTrack(harness)
    await harness.orchestrator.queueChanged()

    harness.orchestrator.voiceDisconnected('guild')

    expect(harness.suggestionRepository.list()).toEqual([])
    expect(harness.candidateRepository.list()).toEqual([])
  })

  it('keeps playback completion successful when every provider is unavailable', async () => {
    const harness = createHarness()
    harness.getCandidates.mockRejectedValue(new RecommendationUnavailableError())
    const initial = startTrack(harness)

    const result = await harness.orchestrator.completePlayback({
      queueItemId: initial.id,
      outcome: 'played',
    })

    expect(result.player.status).toBe('idle')
    expect(harness.autoplayService.get().failureCode).toBe('recommendation_unavailable')
  })
})
