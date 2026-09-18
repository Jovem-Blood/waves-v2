import { fileURLToPath } from 'node:url'

import type { TrackMetadata } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { AutoplayCandidateRepository } from '../../server/repositories/autoplay-candidate.repository'
import { AutoplayRepository } from '../../server/repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../../server/repositories/autoplay-suggestion.repository'
import { TrackPlaybackHealthRepository } from '../../server/repositories/track-playback-health.repository'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { AutoplayOrchestrator } from '../../server/services/autoplay/orchestrator.service'
import { AutoplayService } from '../../server/services/autoplay/service'
import { PlayerStateService } from '../../server/services/playback/player-state.service'
import { QueueService } from '../../server/services/queue/service'
import { RecommendationUnavailableError } from '../../server/services/recommendation/errors'
import type { RecommendationCandidate } from '../../server/services/recommendation/types'
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
  seedTrackKey = 'spotify:first',
) {
  return {
    provider: 'lastfm' as const,
    identityKey: `${value.title.toLowerCase()}::${value.artists[0]?.toLowerCase() ?? ''}`,
    title: value.title,
    artists: value.artists,
    score: 0.95,
    strategy,
    seedTrackKey,
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
  const trackHealthRepository = new TrackPlaybackHealthRepository(connection.db)
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
    trackHealthRepository,
    playerService,
    { getCandidates, resolveCandidate },
    now,
    () => 0,
    logger,
  )
  return {
    autoplayService,
    candidateRepository,
    trackHealthRepository,
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

  it('keeps the remaining suggestions when a listener keeps one in the queue', async () => {
    const harness = createHarness([
      Array.from({ length: 20 }, (_, index) => candidate(track(index + 1))),
    ])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const before = harness.suggestionRepository.list()

    harness.queueService.add({ track: before[0]!.track })
    await harness.orchestrator.queueChanged()

    const after = harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)
    expect(after).not.toContain(before[0]!.track.providerTrackId)
    for (const suggestion of before.slice(1)) {
      expect(after).toContain(suggestion.track.providerTrackId)
    }
    expect(after).toHaveLength(6)
  })

  it('preserves established suggestions after a related listener request', async () => {
    const harness = createHarness([
      Array.from({ length: 20 }, (_, index) => candidate(track(index + 1))),
    ])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const before = harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)

    harness.queueService.add({
      track: { ...firstTrack, id: 'spotify:related', providerTrackId: 'related', title: 'Related' },
    })
    await harness.orchestrator.queueChanged()

    expect(harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)).toEqual(
      before,
    )
  })

  it('reserves two drift slots and expands to four after related listener input', async () => {
    const outlier: TrackMetadata = {
      ...firstTrack,
      id: 'spotify:outlier',
      providerTrackId: 'outlier',
      title: 'Outlier',
      artists: ['New Genre Artist'],
    }
    const harness = createHarness([
      Array.from({ length: 20 }, (_, index) => candidate(track(index + 1))),
      Array.from({ length: 12 }, (_, index) =>
        candidate(track(index + 21), 'similar', 'spotify:outlier'),
      ),
      Array.from({ length: 12 }, (_, index) =>
        candidate(track(index + 41), 'similar', 'spotify:outlier-2'),
      ),
    ])
    startTrack(harness)
    await harness.orchestrator.queueChanged()
    const established = harness.suggestionRepository.list().slice(0, 4)

    harness.queueService.add({ track: outlier })
    await harness.orchestrator.queueChanged()
    const afterOutlier = harness.suggestionRepository.list()
    expect(afterOutlier.filter((entry) => entry.seedTrackKey === 'spotify:outlier')).toHaveLength(2)
    for (const suggestion of established) {
      expect(afterOutlier.map((entry) => entry.track.providerTrackId)).toContain(
        suggestion.track.providerTrackId,
      )
    }

    harness.queueService.add({
      track: {
        ...outlier,
        id: 'spotify:outlier-2',
        providerTrackId: 'outlier-2',
        title: 'Second Outlier',
      },
    })
    await harness.orchestrator.queueChanged()
    const afterSecond = harness.suggestionRepository.list()
    expect(
      afterSecond.filter((entry) => entry.seedTrackKey?.startsWith('spotify:outlier')),
    ).toHaveLength(4)
    expect(afterSecond.filter((entry) => entry.seedTrackKey === 'spotify:first')).toHaveLength(2)
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

  it('persists tagged suggestions and excludes tracks with repeated content failures', async () => {
    const tagged = { ...candidate(track(1)), sourceTag: 'dream pop' }
    const harness = createHarness([
      [tagged, ...Array.from({ length: 19 }, (_, index) => candidate(track(index + 2)))],
    ])
    harness.trackHealthRepository.record({
      track: track(2),
      outcome: 'failed',
      errorCode: 'SOURCE_NOT_FOUND',
      occurredAt: timestamp,
    })
    harness.trackHealthRepository.record({
      track: track(2),
      outcome: 'failed',
      errorCode: 'SOURCE_GEO_BLOCKED',
      occurredAt: timestamp,
    })
    startTrack(harness)

    await harness.orchestrator.queueChanged()

    expect(
      harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId),
    ).not.toContain('recommended-2')
    expect(
      harness.suggestionRepository.list().find((entry) => entry.sourceTag === 'dream pop'),
    ).toBeDefined()
  })

  it('tries a recently played seed when the current seed provider fails', async () => {
    const harness = createHarness()
    harness.getCandidates
      .mockRejectedValueOnce(new RecommendationUnavailableError())
      .mockResolvedValueOnce(Array.from({ length: 12 }, (_, index) => candidate(track(index + 1))))
    const first = harness.queueService.add({ track: firstTrack })
    harness.playerService.voiceConnected('guild', 'Waves', 'voice', 'Music')
    harness.playerService.claimPlayback()
    harness.playerService.completePlayback({ queueItemId: first.id, outcome: 'played' })
    harness.queueService.add({
      track: { ...firstTrack, id: 'spotify:second', providerTrackId: 'second', title: 'Second' },
    })
    harness.playerService.claimPlayback()
    harness.autoplayService.update({ enabled: true })

    await harness.orchestrator.queueChanged()

    expect(harness.getCandidates).toHaveBeenCalledTimes(2)
    expect(harness.getCandidates.mock.calls[1]?.[0]).toEqual([firstTrack])
    expect(harness.suggestionRepository.list()).toHaveLength(6)
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

  it('recovers from empty recommendations after the only requested song fails', async () => {
    const harness = createHarness([
      [],
      Array.from({ length: 12 }, (_, index) => candidate(track(index + 1))),
    ])
    const initial = startTrack(harness)

    const completed = await harness.orchestrator.completePlayback({
      queueItemId: initial.id,
      outcome: 'failed',
      errorCode: 'SOURCE_NOT_FOUND',
    })
    expect(completed.nextItem).toBeUndefined()
    expect(harness.autoplayService.get().failureCode).toBe('no_candidates')

    await harness.orchestrator.retryIfNeeded()

    expect(harness.queueService.list()[0]?.origin).toBe('autoplay')
    expect(harness.suggestionRepository.list().length).toBeGreaterThan(0)
    expect(harness.autoplayService.get().failureCode).toBeNull()
  })

  it('restores a pending recovery after recreating the orchestrator', async () => {
    const harness = createHarness()
    const initial = startTrack(harness)
    await harness.orchestrator.completePlayback({ queueItemId: initial.id, outcome: 'played' })
    expect(harness.autoplayService.get().failureCode).toBe('no_candidates')

    const restarted = createHarness([
      Array.from({ length: 12 }, (_, index) => candidate(track(index + 1))),
    ])
    await restarted.orchestrator.retryIfNeeded()

    expect(restarted.queueService.list()[0]?.origin).toBe('autoplay')
  })
})
