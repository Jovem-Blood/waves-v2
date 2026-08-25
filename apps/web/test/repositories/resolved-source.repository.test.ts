import { fileURLToPath } from 'node:url'

import type { QueueItem } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { ResolvedSourceRepository } from '../../server/repositories/resolved-source.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

function setup() {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  const queueRepository = new QueueRepository(connection.db)
  const item: QueueItem = {
    id: 'queue-1',
    track: {
      id: 'spotify:track-1',
      provider: 'spotify',
      providerTrackId: 'track-1',
      title: 'Track One',
      artists: ['Artist One'],
      durationMs: 120_000,
    },
    status: 'queued',
    position: 0,
    createdAt: '2026-06-20T12:00:00.000Z',
    updatedAt: '2026-06-20T12:00:00.000Z',
  }
  queueRepository.insert(item)
  return new ResolvedSourceRepository(connection.db)
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('ResolvedSourceRepository', () => {
  it('reuses only a non-expired source', () => {
    const repository = setup()
    repository.replace({
      id: 'source-1',
      queueItemId: 'queue-1',
      provider: 'youtube_music',
      sourceIdentifier: 'youtube-1',
      streamUrl: 'https://stream.example/one',
      expiresAt: '2026-06-20T12:05:00.000Z',
      createdAt: '2026-06-20T12:00:00.000Z',
      updatedAt: '2026-06-20T12:00:00.000Z',
    })

    expect(repository.findReusable('queue-1', '2026-06-20T12:04:59.000Z')).toMatchObject({
      sourceIdentifier: 'youtube-1',
    })
    expect(repository.findReusable('queue-1', '2026-06-20T12:05:00.000Z')).toBeUndefined()
  })

  it('replaces stale rows without changing the existing schema', () => {
    const repository = setup()
    const base = {
      queueItemId: 'queue-1',
      provider: 'youtube_music' as const,
      createdAt: '2026-06-20T12:00:00.000Z',
      updatedAt: '2026-06-20T12:00:00.000Z',
    }
    repository.replace({
      ...base,
      id: 'source-1',
      sourceIdentifier: 'old',
      streamUrl: 'https://stream.example/old',
      expiresAt: '2026-06-20T12:01:00.000Z',
    })
    repository.replace({
      ...base,
      id: 'source-2',
      sourceIdentifier: 'new',
      streamUrl: 'https://stream.example/new',
      expiresAt: '2026-06-20T12:10:00.000Z',
    })

    expect(repository.findReusable('queue-1', '2026-06-20T12:02:00.000Z')).toMatchObject({
      id: 'source-2',
      sourceIdentifier: 'new',
    })
  })
})
