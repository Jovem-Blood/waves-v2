import { fileURLToPath } from 'node:url'

import type { AddQueueItemInput, RealtimeEvent } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import {
  DuplicateTrackError,
  QueueItemNotFoundError,
  QueueItemNotRemovableError,
  QueueRestoreExpiredError,
} from '../../server/services/domain-errors'
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

function setup({
  nowProvider = now,
  publishRealtime,
}: {
  nowProvider?: () => Date
  publishRealtime?: (event: RealtimeEvent) => { id: string; event: RealtimeEvent }
} = {}): {
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
      new DatabaseUnitOfWork(connection.db, nowProvider),
      nowProvider,
      () => `queue-${++nextId}`,
      publishRealtime,
    ),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('QueueService', () => {
  it('generates item ids without depending on global crypto', () => {
    vi.stubGlobal('crypto', {})
    const connection = createDatabaseConnection({ url: ':memory:' })
    migrate(connection.db, { migrationsFolder })
    connections.push(connection)
    const repository = new QueueRepository(connection.db)
    const service = new QueueService(repository, new DatabaseUnitOfWork(connection.db, now), now)

    const item = service.add(input)

    expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('adds the first item at position zero with deterministic metadata', () => {
    const { service } = setup()

    expect(service.add(input)).toEqual({
      id: 'queue-1',
      track: input.track,
      origin: 'human',
      requestedByDisplayName: 'Luis',
      status: 'queued',
      position: 0,
      createdAt: '2026-06-18T14:00:00.000Z',
      updatedAt: '2026-06-18T14:00:00.000Z',
    })
  })

  it('publishes realtime queue updates after mutations', () => {
    const published: RealtimeEvent[] = []
    const { service } = setup({
      publishRealtime: (event) => {
        published.push(event)
        return { id: String(published.length), event }
      },
    })

    service.add(input)
    service.add({
      track: { ...input.track, id: 'spotify:track-2', providerTrackId: 'track-2' },
    })
    service.move('queue-2', { newPosition: 0 })
    service.remove('queue-1')
    service.restore('queue-1')

    expect(published.map((event) => event.type)).toEqual([
      'queue.updated',
      'queue.updated',
      'queue.updated',
      'queue.updated',
      'queue.updated',
    ])
    expect(
      published.map((event) => (event.type === 'queue.updated' ? event.reason : undefined)),
    ).toEqual(['added', 'added', 'moved', 'removed', 'restored'])
    expect(published.at(-1)).toMatchObject({
      type: 'queue.updated',
      queue: [
        expect.objectContaining({ id: 'queue-2', position: 0 }),
        expect.objectContaining({ id: 'queue-1', position: 1 }),
      ],
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

  it('adds next after the playing item or at the start when idle', () => {
    const { repository, service } = setup()
    service.add(input)
    service.add({
      track: { ...input.track, id: 'spotify:track-2', providerTrackId: 'track-2' },
    })
    repository.updateStatusAndPosition('queue-1', {
      status: 'playing',
      position: 0,
      updatedAt: now().toISOString(),
    })

    service.add({
      track: { ...input.track, id: 'spotify:track-3', providerTrackId: 'track-3' },
      placement: 'next',
    })
    expect(service.list().map(({ id }) => id)).toEqual(['queue-1', 'queue-3', 'queue-2'])

    const idle = setup()
    idle.service.add(input)
    idle.service.add({
      track: { ...input.track, id: 'spotify:track-2', providerTrackId: 'track-2' },
      placement: 'next',
    })
    expect(idle.service.list().map(({ id }) => id)).toEqual(['queue-2', 'queue-1'])
  })

  it('rejects duplicate active tracks but allows re-adding a removed track', () => {
    const { service } = setup()
    service.add(input)
    expect(() => service.add({ track: { ...input.track, id: 'different-client-id' } })).toThrow(
      DuplicateTrackError,
    )

    service.remove('queue-1')
    expect(service.add(input)).toMatchObject({ id: 'queue-2', position: 0 })
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
    service.add({
      track: { ...input.track, id: 'spotify:track-2', providerTrackId: 'track-2' },
    })
    const before = service.list()

    expect(service.move('queue-2', { newPosition: 1 })).toEqual(before)
  })

  it('keeps the playing item fixed while queued items are reordered', () => {
    const { repository, service } = setup()
    service.add(input)
    service.add({
      track: { ...input.track, id: 'spotify:track-2', providerTrackId: 'track-2' },
    })
    service.add({
      track: { ...input.track, id: 'spotify:track-3', providerTrackId: 'track-3' },
    })
    repository.updateStatusAndPosition('queue-1', {
      status: 'playing',
      position: 0,
      updatedAt: now().toISOString(),
    })

    expect(service.move('queue-1', { newPosition: 2 }).map(({ id }) => id)).toEqual([
      'queue-1',
      'queue-2',
      'queue-3',
    ])
    expect(service.move('queue-3', { newPosition: 0 }).map(({ id }) => id)).toEqual([
      'queue-1',
      'queue-3',
      'queue-2',
    ])
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

    const { queue } = service.remove(id)

    expect(queue.map(({ position }) => position)).toEqual(queue.map((_, index) => index))
    expect(queue.some((item) => item.id === id)).toBe(false)
  })

  it('restores a removed item at its original valid position', () => {
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

    service.remove('queue-2')
    expect(service.restore('queue-2').queue.map(({ id }) => id)).toEqual([
      'queue-1',
      'queue-2',
      'queue-3',
    ])
  })

  it('rejects removing the playing item and restoring after ten seconds', () => {
    let currentTime = new Date('2026-06-18T14:00:00.000Z')
    const { repository, service } = setup({ nowProvider: () => currentTime })
    service.add(input)
    repository.updateStatusAndPosition('queue-1', {
      status: 'playing',
      position: 0,
      updatedAt: currentTime.toISOString(),
    })
    expect(() => service.remove('queue-1')).toThrow(QueueItemNotRemovableError)

    repository.updateStatusAndPosition('queue-1', {
      status: 'queued',
      position: 0,
      updatedAt: currentTime.toISOString(),
    })
    service.remove('queue-1')
    currentTime = new Date('2026-06-18T14:00:10.001Z')
    expect(() => service.restore('queue-1')).toThrow(QueueRestoreExpiredError)
  })

  it('throws a domain error for missing active items', () => {
    const { service } = setup()

    expect(() => service.remove('missing')).toThrow(QueueItemNotFoundError)
    expect(() => service.move('missing', { newPosition: 0 })).toThrow(QueueItemNotFoundError)
  })
})
