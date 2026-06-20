import { fileURLToPath } from 'node:url'

import type { AddQueueItemInput } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { QueueItemNotFoundError } from '../../server/services/domain-errors'
import { QueueService } from '../../server/services/queue.service'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []
const now = () => new Date('2026-06-18T14:00:00.000Z')

const input: AddQueueItemInput = {
  track: {
    id: 'spotify:track-1',
    provider: 'spotify',
    providerTrackId: 'track-1',
    title: 'Track One',
    artists: ['Artist One'],
    durationMs: 120_000,
  },
  requestedByDisplayName: 'Luis',
}

function setup(): {
  connection: DatabaseConnection
  repository: QueueRepository
  service: QueueService
} {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  const repository = new QueueRepository(connection.db)
  let nextId = 0

  return {
    connection,
    repository,
    service: new QueueService(
      repository,
      new DatabaseUnitOfWork(connection.db, now),
      now,
      () => `queue-${++nextId}`,
    ),
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('QueueService', () => {
  it('adds the first item at position zero with deterministic metadata', () => {
    const { service } = setup()

    expect(service.add(input)).toEqual({
      id: 'queue-1',
      track: input.track,
      requestedByDisplayName: 'Luis',
      status: 'queued',
      position: 0,
      createdAt: '2026-06-18T14:00:00.000Z',
      updatedAt: '2026-06-18T14:00:00.000Z',
    })
  })

  it('adds subsequent items at the end and lists them in order', () => {
    const { service } = setup()
    service.add(input)
    service.add({
      track: {
        ...input.track,
        id: 'spotify:track-2',
        providerTrackId: 'track-2',
        title: 'Track Two',
      },
    })

    expect(service.list().map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'queue-1', position: 0 },
      { id: 'queue-2', position: 1 },
    ])
  })

  it('moves items to the beginning, middle and end with contiguous positions', () => {
    const { service } = setup()
    for (let index = 1; index <= 4; index += 1) {
      service.add({
        track: {
          ...input.track,
          id: `spotify:track-${index}`,
          providerTrackId: `track-${index}`,
          title: `Track ${index}`,
        },
      })
    }

    expect(service.move('queue-4', { newPosition: 0 }).map(({ id }) => id)).toEqual([
      'queue-4',
      'queue-1',
      'queue-2',
      'queue-3',
    ])
    expect(service.move('queue-4', { newPosition: 2 }).map(({ id }) => id)).toEqual([
      'queue-1',
      'queue-2',
      'queue-4',
      'queue-3',
    ])
    expect(
      service.move('queue-1', { newPosition: 99 }).map(({ id, position }) => ({
        id,
        position,
      })),
    ).toEqual([
      { id: 'queue-2', position: 0 },
      { id: 'queue-4', position: 1 },
      { id: 'queue-3', position: 2 },
      { id: 'queue-1', position: 3 },
    ])
  })

  it('is idempotent when moving to the current position', () => {
    const { service } = setup()
    service.add(input)
    service.add({ track: { ...input.track, id: 'spotify:track-2' } })
    const before = service.list()

    expect(service.move('queue-2', { newPosition: 1 })).toEqual(before)
  })

  it.each([
    ['first', 'queue-1'],
    ['middle', 'queue-2'],
    ['last', 'queue-3'],
  ])('removes the %s item and recalculates positions', (_label, id) => {
    const { service } = setup()
    for (let index = 1; index <= 3; index += 1) {
      service.add({
        track: {
          ...input.track,
          id: `spotify:track-${index}`,
          providerTrackId: `track-${index}`,
        },
      })
    }

    const queue = service.remove(id)

    expect(queue.map(({ position }) => position)).toEqual(queue.map((_, index) => index))
    expect(queue.some((item) => item.id === id)).toBe(false)
  })

  it('throws a domain error for missing active items', () => {
    const { service } = setup()

    expect(() => service.remove('missing')).toThrow(QueueItemNotFoundError)
    expect(() => service.move('missing', { newPosition: 0 })).toThrow(QueueItemNotFoundError)
  })
})
