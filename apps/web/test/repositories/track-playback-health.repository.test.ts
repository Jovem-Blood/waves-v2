import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { TrackMetadata } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { TrackPlaybackHealthRepository } from '../../server/repositories/track-playback-health.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const track: TrackMetadata = {
  id: 'spotify:unavailable',
  provider: 'spotify',
  providerTrackId: 'unavailable',
  title: 'Unavailable',
  artists: ['Artist'],
  durationMs: 180_000,
}
let connection: DatabaseConnection

beforeEach(() => {
  connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
})
afterEach(() => connection.close())

describe('TrackPlaybackHealthRepository', () => {
  it('suppresses only repeated content failures and clears suppression after success or expiry', () => {
    const repository = new TrackPlaybackHealthRepository(connection.db)
    const firstAt = '2026-09-18T10:00:00.000Z'
    repository.record({
      track,
      outcome: 'failed',
      errorCode: 'SOURCE_NOT_FOUND',
      occurredAt: firstAt,
    })
    expect(repository.suppressedTracks(new Date('2026-09-18T10:01:00.000Z'))).toEqual([])

    repository.record({
      track,
      outcome: 'failed',
      errorCode: 'SOURCE_HTTP_STATUS',
      occurredAt: '2026-09-18T10:01:00.000Z',
    })
    expect(repository.suppressedTracks(new Date('2026-09-18T10:02:00.000Z'))).toEqual([])

    repository.record({
      track,
      outcome: 'failed',
      errorCode: 'SOURCE_GEO_BLOCKED',
      failureClass: 'content',
      failureStage: 'resolve',
      occurredAt: '2026-09-18T10:02:00.000Z',
    })
    expect(repository.suppressedTracks(new Date('2026-09-18T10:03:00.000Z'))).toHaveLength(1)
    expect(repository.listProblematic()[0]).toMatchObject({
      failures: 3,
      contentFailures: 2,
      lastErrorCode: 'SOURCE_GEO_BLOCKED',
      lastFailureClass: 'content',
      lastFailureStage: 'resolve',
    })
    expect(repository.suppressedTracks(new Date('2026-09-26T10:03:00.000Z'))).toEqual([])

    repository.record({ track, outcome: 'played', occurredAt: '2026-09-18T10:04:00.000Z' })
    expect(repository.get('spotify:unavailable')).toMatchObject({
      successes: 1,
      failures: 3,
      contentFailures: 0,
    })
    expect(repository.suppressedTracks(new Date('2026-09-18T10:05:00.000Z'))).toEqual([])
  })

  it('backfills the durable catalog from existing terminal playback attempts', () => {
    connection.close()
    connection = createDatabaseConnection({ url: ':memory:' })
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    for (const entry of journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) < 13)) {
      connection.sqlite.exec(readFileSync(`${migrationsFolder}/${entry.tag}.sql`, 'utf8'))
    }
    connection.sqlite
      .prepare(
        `INSERT INTO queue_items (
        id, track_id, provider, provider_track_id, title, artists_json, duration_ms,
        origin, status, position, created_at, updated_at
      ) VALUES ('queue-1', 'spotify:unavailable', 'spotify', 'unavailable', 'Unavailable', '["Artist"]',
        180000, 'human', 'failed', 0, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`,
      )
      .run()
    const insert = connection.sqlite.prepare(`INSERT INTO playback_attempts (
      id, playback_attempt_id, attempt_number, queue_item_id, outcome, terminal,
      track_id, track_provider, provider_track_id, track_title, track_artists_json,
      started_at, created_at, updated_at, error_code
    ) VALUES (?, ?, 1, 'queue-1', ?, 1, 'spotify:unavailable', 'spotify',
      'unavailable', 'Unavailable', '["Artist"]', ?, ?, ?, ?)`)
    insert.run(
      'attempt-1',
      'logical-1',
      'failed',
      '2026-09-18T10:00:00.000Z',
      '2026-09-18T10:00:00.000Z',
      '2026-09-18T10:00:00.000Z',
      'SOURCE_NOT_FOUND',
    )
    insert.run(
      'attempt-2',
      'logical-2',
      'played',
      '2026-09-18T10:01:00.000Z',
      '2026-09-18T10:01:00.000Z',
      '2026-09-18T10:01:00.000Z',
      null,
    )
    insert.run(
      'attempt-3',
      'logical-3',
      'failed',
      '2026-09-18T10:02:00.000Z',
      '2026-09-18T10:02:00.000Z',
      '2026-09-18T10:02:00.000Z',
      'SOURCE_GEO_BLOCKED',
    )
    connection.sqlite.exec(readFileSync(`${migrationsFolder}/0013_shallow_la_nuit.sql`, 'utf8'))

    const repository = new TrackPlaybackHealthRepository(connection.db)
    expect(repository.get('spotify:unavailable')).toMatchObject({
      successes: 1,
      failures: 2,
      contentFailures: 1,
      lastErrorCode: 'SOURCE_GEO_BLOCKED',
    })
    expect(repository.suppressedTracks(new Date('2026-09-18T10:03:00.000Z'))).toEqual([])
  })
})
