import type { QueueItem } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlaybackAttemptRepository } from '../../server/repositories/playback-attempt.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { PlaybackHealthService } from '../../server/services/playback-health.service'

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
