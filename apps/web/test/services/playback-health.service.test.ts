import type { QueueItem } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlaybackAttemptRepository } from '../../server/repositories/playback-attempt.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { PlaybackHealthService } from '../../server/services/playback/health.service'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

const first: QueueItem = {
  id: 'queue-first',
  track: {
    id: 'spotify:first',
    provider: 'spotify',
    providerTrackId: 'first',
    title: 'First',
    artists: ['Artist'],
    durationMs: 180_000,
  },
  origin: 'human',
  status: 'playing',
  position: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const second: QueueItem = {
  ...first,
  id: 'queue-second',
  track: { ...first.track, id: 'spotify:second', providerTrackId: 'second', title: 'Second' },
  status: 'queued',
  position: 1,
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
})

describe('PlaybackHealthService', () => {
  it('upgrades an existing database without rebuilding queue or history', () => {
    const connection = createDatabaseConnection({ url: ':memory:' })
    connections.push(connection)
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    for (const entry of journal.entries.filter((entry) => !entry.tag.startsWith('0012_'))) {
      connection.sqlite.exec(readFileSync(`${migrationsFolder}/${entry.tag}.sql`, 'utf8'))
    }
    new QueueRepository(connection.db).insert(first)
    connection.sqlite.exec(readFileSync(`${migrationsFolder}/0012_playback_timings.sql`, 'utf8'))
    expect(new QueueRepository(connection.db).findById(first.id)).toMatchObject({
      id: first.id,
      track: first.track,
    })
    expect(connection.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(
      connection.sqlite
        .prepare("select name from sqlite_master where name = 'playback_attempts_retention_idx'")
        .get(),
    ).toBeDefined()
  })
  function fixture() {
    const connection = createDatabaseConnection({ url: ':memory:' })
    migrate(connection.db, { migrationsFolder })
    connections.push(connection)
    new QueueRepository(connection.db).insert(first)
    const attempts = new PlaybackAttemptRepository(connection.db)
    return {
      connection,
      attempts,
      service: new PlaybackHealthService(attempts, () => new Date('2026-08-21T00:00:00.000Z')),
    }
  }

  it('includes the newest records beyond 10,000 attempts without truncation', () => {
    const { connection, service } = fixture()
    const insert = connection.sqlite.prepare(`INSERT INTO playback_attempts
      (id, playback_attempt_id, attempt_number, queue_item_id, outcome, terminal, track_id, track_provider, provider_track_id, track_title, track_artists_json, started_at, created_at, updated_at, source_provider)
      VALUES (?, ?, 1, ?, ?, 1, 't', 'spotify', 't', 'Track', '[]', ?, ?, ?, 'youtube_music')`)
    connection.sqlite.transaction(() => {
      for (let n = 0; n < 10_050; n++) {
        const date = new Date(Date.parse('2026-08-20T00:00:00.000Z') + n * 1000).toISOString()
        insert.run(
          `row-${n}`,
          `logical-${n}`,
          first.id,
          n === 10_049 ? 'failed' : 'played',
          date,
          date,
          date,
        )
      }
    })()
    const result = service.get()
    expect(result.summary.plays).toBe(10_050)
    expect(result.recentFailures[0]?.playbackAttemptId).toBe('logical-10049')
    expect(result.dataCompleteness?.truncated).toBe(false)
    expect(result.providers[0]).toMatchObject({
      executions: 10_050,
      successes: 10_049,
      failures: 1,
      failureRate: 1 / 10_050,
    })
  })

  it('keeps recovered retries crossing the period boundary in the same execution', () => {
    const { attempts, service } = fixture()
    attempts.start({
      playbackAttemptId: 'crossing',
      attemptNumber: 1,
      queueItem: first,
      startedAt: '2026-08-19T23:59:59.000Z',
    })
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'crossing',
        attempt: 1,
        outcome: 'failed',
        terminal: false,
        errorCode: 'SOURCE_DNS_FAILED',
        sourceProvider: 'youtube_music',
      },
      first,
      '2026-08-19T23:59:59.500Z',
    )
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'crossing',
        attempt: 2,
        outcome: 'played',
        terminal: true,
        sourceProvider: 'youtube_music',
      },
      first,
      '2026-08-20T00:00:01.000Z',
    )
    const result = service.get({ from: '2026-08-19T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z' })
    expect(result.summary).toMatchObject({
      plays: 1,
      successes: 1,
      retries: 1,
      recoveredRetries: 1,
    })
    expect(result.providers[0]?.recoveredRetries).toBe(1)
    expect(service.get({ from: '2026-08-20T00:00:00.000Z' }).summary.plays).toBe(0)
    expect(service.get({ errorCode: 'SOURCE_DNS_FAILED' }).summary.plays).toBe(0)
    expect(
      service.get({ errorCode: 'SOURCE_DNS_FAILED', errorScope: 'encountered' }).summary.plays,
    ).toBe(1)
  })

  it('retains incomplete/recent groups and deletes old telemetry without deleting queue/history', () => {
    const { attempts, connection } = fixture()
    const old = '2026-01-01T00:00:00.000Z'
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'old',
        attempt: 1,
        outcome: 'played',
        terminal: true,
      },
      first,
      old,
    )
    attempts.start({
      playbackAttemptId: 'pending',
      attemptNumber: 1,
      queueItem: first,
      startedAt: old,
    })
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'retry',
        attempt: 1,
        outcome: 'failed',
        terminal: false,
      },
      first,
      old,
    )
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'retry',
        attempt: 2,
        outcome: 'played',
        terminal: true,
      },
      first,
      '2026-08-20T00:00:00.000Z',
    )
    expect(attempts.deleteCompletedBefore('2026-05-01T00:00:00.000Z')).toBe(1)
    expect(attempts.find('old', 1)).toBeUndefined()
    expect(attempts.find('pending', 1)).toBeDefined()
    expect(attempts.find('retry', 1)).toBeDefined()
    expect(new QueueRepository(connection.db).findById(first.id)).toBeDefined()
    expect(connection.sqlite.pragma('foreign_key_check')).toEqual([])
  })

  it('reports incomplete executions separately and does not invent latency for old records', () => {
    const { attempts, service } = fixture()
    attempts.start({
      playbackAttemptId: 'pending',
      attemptNumber: 1,
      queueItem: first,
      startedAt: '2026-08-20T00:00:00.000Z',
    })
    expect(service.get().summary).toMatchObject({ plays: 0, incomplete: 1, stale: 1 })
    expect(service.get().latency?.firstAudio).toEqual({ samples: 0, p50: null, p95: null })
  })

  it('populates timing diagnostics and percentiles only with sufficient samples', () => {
    const { attempts, service } = fixture()
    for (let n = 1; n <= 20; n++)
      attempts.report(
        {
          queueItemId: first.id,
          playbackAttemptId: `timed-${n}`,
          attempt: 1,
          outcome: 'failed',
          terminal: true,
          resolutionDurationMs: n * 10,
          fetchLatencyMs: n * 5,
          timeToFirstAudioMs: n * 20,
          playbackDurationMs: 500,
          progressAtFailureMs: 500,
          sourceProvider: 'youtube_music',
          failureStage: 'player',
          failureClass: 'player',
          errorCode: 'PLAYER_ERROR',
        },
        first,
        '2026-08-20T00:00:00.000Z',
      )
    expect(service.get().latency?.resolution).toEqual({ samples: 20, p50: 100, p95: 190 })
    expect(service.get().recentFailures[0]).toMatchObject({
      playbackDurationMs: 500,
      expectedDurationMs: first.track.durationMs,
      progressAtFailureMs: 500,
    })
  })

  it('counts logical executions and separates recovered retries from terminal failures', () => {
    const connection = createDatabaseConnection({ url: ':memory:' })
    migrate(connection.db, { migrationsFolder })
    connections.push(connection)
    const queue = new QueueRepository(connection.db)
    queue.insert(first)
    queue.insert(second)
    const attempts = new PlaybackAttemptRepository(connection.db)
    attempts.start({
      playbackAttemptId: 'logical-first',
      attemptNumber: 1,
      queueItem: first,
      startedAt: '2026-08-20T10:00:00.000Z',
    })
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'logical-first',
        attempt: 1,
        outcome: 'failed',
        terminal: false,
        failureStage: 'demux',
        failureClass: 'operational',
        errorCode: 'DEMUX_PROBE_FAILED',
      },
      first,
      '2026-08-20T10:00:01.000Z',
    )
    attempts.start({
      playbackAttemptId: 'logical-first',
      attemptNumber: 2,
      queueItem: first,
      startedAt: '2026-08-20T10:00:01.000Z',
    })
    attempts.report(
      {
        queueItemId: first.id,
        playbackAttemptId: 'logical-first',
        attempt: 2,
        outcome: 'played',
        terminal: true,
      },
      first,
      '2026-08-20T10:03:00.000Z',
    )
    attempts.start({
      playbackAttemptId: 'logical-second',
      attemptNumber: 1,
      queueItem: second,
      startedAt: '2026-08-20T11:00:00.000Z',
    })
    attempts.report(
      {
        queueItemId: second.id,
        playbackAttemptId: 'logical-second',
        attempt: 1,
        outcome: 'failed',
        terminal: true,
        failureStage: 'transport',
        failureClass: 'operational',
        errorCode: 'SOURCE_HTTP_STATUS',
      },
      second,
      '2026-08-20T11:00:02.000Z',
    )

    const result = new PlaybackHealthService(
      attempts,
      () => new Date('2026-08-21T00:00:00.000Z'),
    ).get({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' })

    expect(result.summary).toMatchObject({ plays: 2, successes: 1, failures: 1, retries: 1 })
    expect(result.problematicTracks[0]).toMatchObject({
      trackTitle: 'Second',
      failures: 1,
      failureRate: 1,
      primaryErrorCode: 'SOURCE_HTTP_STATUS',
    })
  })
})
