import { fileURLToPath } from 'node:url'

import type { QueueItem, QueueItemStatus } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { QueueRepository } from '../../server/repositories/queue.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

function setup(): QueueRepository {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  return new QueueRepository(connection.db)
}

function queueItem(id: string, position: number, status: QueueItemStatus = 'queued'): QueueItem {
  return {
    id,
    track: {
      id: `spotify:track-${id}`,
      provider: 'spotify',
      providerTrackId: `track-${id}`,
      title: `Track ${id}`,
      artists: ['Artist One', 'Artist Two'],
      albumName: 'Album',
      durationMs: 123_456,
      coverUrl: 'https://example.com/cover.jpg',
      externalUrl: 'https://example.com/track',
      isrc: 'GBARL9300135',
    },
    requestedByDiscordUserId: 'discord-1',
    requestedByDisplayName: 'Luis',
    status,
    position,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:00:00.000Z',
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('QueueRepository', () => {
  it('preserves TrackMetadata when inserting and reading an item', () => {
    const repository = setup()
    const item = queueItem('queue-1', 0)

    repository.insert(item)

    expect(repository.findById(item.id)).toEqual(item)
  })

  it('returns only queued and playing items ordered by position', () => {
    const repository = setup()
    repository.insert(queueItem('queued-2', 2))
    repository.insert(queueItem('played', 8, 'played'))
    repository.insert(queueItem('playing', 0, 'playing'))
    repository.insert(queueItem('queued-1', 1))
    repository.insert(queueItem('skipped', 9, 'skipped'))

    expect(repository.listActive().map(({ id }) => id)).toEqual(['playing', 'queued-1', 'queued-2'])
  })

  it('permanently deletes an item', () => {
    const repository = setup()
    repository.insert(queueItem('queue-1', 0))

    expect(repository.delete('queue-1')).toBe(true)
    expect(repository.findById('queue-1')).toBeUndefined()
    expect(repository.delete('queue-1')).toBe(false)
  })

  it('keeps historical items outside the active queue', () => {
    const repository = setup()
    repository.insert(queueItem('failed', 0, 'failed'))
    repository.insert(queueItem('played', 1, 'played'))
    repository.insert(queueItem('skipped', 2, 'skipped'))

    expect(repository.listActive()).toEqual([])
    expect(repository.findById('played')?.status).toBe('played')
  })

  it('updates multiple positions atomically without transient uniqueness conflicts', () => {
    const repository = setup()
    repository.insert(queueItem('first', 0))
    repository.insert(queueItem('second', 1))

    repository.updatePositions([
      { id: 'first', position: 1, updatedAt: '2026-06-18T13:00:00.000Z' },
      { id: 'second', position: 0, updatedAt: '2026-06-18T13:00:00.000Z' },
    ])

    expect(repository.listActive().map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'second', position: 0 },
      { id: 'first', position: 1 },
    ])
  })
})
