import { fileURLToPath } from 'node:url'

import type { QueueItem, ResolvedAudioSource } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { ResolvedSourceRepository } from '../../server/repositories/resolved-source.repository'
import type { AudioSourceResolver } from '../../server/services/audio-source/resolver'
import { AudioSourceService } from '../../server/services/audio-source/service'
import { QueueItemNotFoundError } from '../../server/services/domain-errors'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []
const source: ResolvedAudioSource = {
  provider: 'youtube_music',
  sourceIdentifier: 'youtube-1',
  streamUrl: 'https://stream.example/signed-secret',
  expiresAt: '2026-06-20T12:05:00.000Z',
}

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
  const resolve = vi.fn<() => Promise<ResolvedAudioSource>>().mockResolvedValue(source)
  const resolver: AudioSourceResolver = { resolve }
  let currentTime = new Date('2026-06-20T12:00:00.000Z')
  const setTime = (value: string) => {
    currentTime = new Date(value)
  }
  const loggerInfo = vi.fn()
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: loggerInfo,
    warn: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  const service = new AudioSourceService(
    queueRepository,
    new ResolvedSourceRepository(connection.db),
    resolver,
    () => currentTime,
    () => 'source-1',
    logger,
  )
  return {
    resolve,
    service,
    setTime,
    loggerInfo,
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('AudioSourceService', () => {
  it('persists a new resolution and reuses it while valid', async () => {
    const { resolve, service, loggerInfo } = setup()

    await expect(service.resolve('queue-1')).resolves.toEqual({
      queueItemId: 'queue-1',
      source,
    })
    await expect(service.resolve('queue-1')).resolves.toEqual({
      queueItemId: 'queue-1',
      source,
    })
    expect(resolve).toHaveBeenCalledOnce()
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'cache_miss' }),
      'Audio source cache requires resolution',
    )
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'cache_hit',
        provider: 'youtube_music',
        sourceIdentifier: 'youtube-1',
      }),
      'Audio source cache hit',
    )
  })

  it('renews an expired resolution', async () => {
    const { resolve, service, setTime } = setup()
    await service.resolve('queue-1')
    setTime('2026-06-20T12:05:00.000Z')
    resolve.mockResolvedValue({
      ...source,
      sourceIdentifier: 'youtube-2',
      streamUrl: 'https://stream.example/renewed',
      expiresAt: '2026-06-20T12:10:00.000Z',
    })

    await expect(service.resolve('queue-1')).resolves.toMatchObject({
      source: { sourceIdentifier: 'youtube-2' },
    })
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(resolve).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        preferredSource: {
          sourceIdentifier: 'youtube-1',
        },
      }),
    )
  })

  it('renews a resolution before it enters the expiry margin', async () => {
    const { resolve, service, setTime } = setup()
    await service.resolve('queue-1')
    setTime('2026-06-20T12:04:01.000Z')
    resolve.mockResolvedValue({
      ...source,
      sourceIdentifier: 'youtube-2',
      streamUrl: 'https://stream.example/renewed',
      expiresAt: '2026-06-20T12:10:00.000Z',
    })

    await expect(service.resolve('queue-1')).resolves.toMatchObject({
      source: { sourceIdentifier: 'youtube-2' },
    })
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('fails before contacting the provider for a missing queue item', async () => {
    const { resolve, service } = setup()

    await expect(service.resolve('missing')).rejects.toBeInstanceOf(QueueItemNotFoundError)
    expect(resolve).not.toHaveBeenCalled()
  })
})
