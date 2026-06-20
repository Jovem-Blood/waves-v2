import { fileURLToPath } from 'node:url'

import type { QueueItem, QueueItemStatus } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import {
  DatabaseUnitOfWork,
  type RepositoryContext,
  type UnitOfWork,
} from '../../server/repositories/unit-of-work'
import { PlayerStateService } from '../../server/services/player-state.service'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []
const now = () => new Date('2026-06-18T15:00:00.000Z')

function item(id: string, position: number, status: QueueItemStatus = 'queued'): QueueItem {
  return {
    id,
    track: {
      id: `spotify:${id}`,
      provider: 'spotify',
      providerTrackId: id,
      title: id,
      artists: ['Artist'],
      durationMs: 100_000,
    },
    status,
    position,
    createdAt: '2026-06-18T14:00:00.000Z',
    updatedAt: '2026-06-18T14:00:00.000Z',
  }
}

function setup(): {
  connection: DatabaseConnection
  playerRepository: PlayerStateRepository
  queueRepository: QueueRepository
  service: PlayerStateService
  unitOfWork: DatabaseUnitOfWork
} {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  const playerRepository = new PlayerStateRepository(connection.db, now)
  const queueRepository = new QueueRepository(connection.db)
  const unitOfWork = new DatabaseUnitOfWork(connection.db, now)

  return {
    connection,
    playerRepository,
    queueRepository,
    service: new PlayerStateService(playerRepository, unitOfWork, now),
    unitOfWork,
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('PlayerStateService', () => {
  it('returns the initial logical player state', () => {
    const { service } = setup()

    expect(service.get()).toEqual({
      status: 'idle',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })

  it('persists and clears the connected voice guild and channel', () => {
    const { service } = setup()

    expect(service.voiceConnected('guild-1', 'voice-1')).toEqual({
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(service.voiceDisconnected('other-guild')).toEqual({
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(service.voiceDisconnected('guild-1')).toEqual({
      status: 'idle',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })

  it('skips the configured current item and promotes the next item', () => {
    const { playerRepository, queueRepository, service } = setup()
    queueRepository.insert(item('current', 0, 'playing'))
    queueRepository.insert(item('next', 1))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'current',
    })

    expect(service.skip()).toEqual({
      player: {
        status: 'playing',
        currentQueueItemId: 'next',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [
        expect.objectContaining({
          id: 'next',
          status: 'playing',
          position: 0,
        }),
      ],
    })
    expect(queueRepository.findById('current')?.status).toBe('skipped')
  })

  it('uses the first active item when the player current item is absent or invalid', () => {
    const { playerRepository, queueRepository, service } = setup()
    queueRepository.insert(item('historical', 9, 'skipped'))
    queueRepository.insert(item('first', 0))
    queueRepository.insert(item('second', 1))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'historical',
    })

    service.skip()

    expect(queueRepository.findById('first')?.status).toBe('skipped')
    expect(service.get()).toEqual({
      status: 'playing',
      currentQueueItemId: 'second',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })

  it('leaves the player idle after skipping the last item', () => {
    const { playerRepository, queueRepository, service } = setup()
    queueRepository.insert(item('only', 0, 'playing'))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'only',
    })

    expect(service.skip()).toEqual({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [],
    })
    expect(queueRepository.findById('only')?.status).toBe('skipped')
  })

  it('is idempotent when skipping an empty queue', () => {
    const { service } = setup()

    expect(service.skip()).toEqual({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [],
    })
    expect(service.skip()).toEqual({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [],
    })
  })

  it('claims the first queued item only while voice is connected', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('first', 0))

    expect(service.claimPlayback()).toEqual({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
    })

    service.voiceConnected('guild-1', 'voice-1')
    const claimed = service.claimPlayback()
    expect(claimed.player).toEqual({
      status: 'playing',
      currentQueueItemId: 'first',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(claimed.item).toMatchObject({ id: 'first', status: 'playing' })
  })

  it('completes the current item and promotes the next atomically', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('first', 0))
    queueRepository.insert(item('second', 1))
    service.voiceConnected('guild-1', 'voice-1')
    service.claimPlayback()

    expect(
      service.completePlayback({ queueItemId: 'first', outcome: 'played' }),
    ).toMatchObject({
      completedQueueItemId: 'first',
      player: {
        status: 'playing',
        currentQueueItemId: 'second',
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
      },
      nextItem: {
        id: 'second',
        status: 'playing',
        position: 0,
      },
    })
    expect(queueRepository.findById('first')?.status).toBe('played')
  })

  it('marks a failed last item and leaves the connected player idle', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('only', 0))
    service.voiceConnected('guild-1', 'voice-1')
    service.claimPlayback()

    expect(
      service.completePlayback({ queueItemId: 'only', outcome: 'failed' }),
    ).toEqual({
      completedQueueItemId: 'only',
      player: {
        status: 'idle',
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [],
    })
    expect(queueRepository.findById('only')?.status).toBe('failed')
  })

  it('rejects a transition for an item that is not current', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('first', 0))
    queueRepository.insert(item('second', 1))
    service.voiceConnected('guild-1', 'voice-1')
    service.claimPlayback()

    expect(() =>
      service.completePlayback({ queueItemId: 'second', outcome: 'played' }),
    ).toThrow('Playback transition does not match')
  })

  it('rolls back queue and player changes when the coordinated operation fails', () => {
    const { playerRepository, queueRepository, unitOfWork } = setup()
    queueRepository.insert(item('current', 0, 'playing'))
    queueRepository.insert(item('next', 1))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'current',
    })

    const failingUnitOfWork: UnitOfWork = {
      run<T>(operation: (repositories: RepositoryContext) => T): T {
        return unitOfWork.run((repositories) => {
          operation(repositories)
          throw new Error('simulated failure')
        })
      },
    }
    const service = new PlayerStateService(playerRepository, failingUnitOfWork, now)

    expect(() => service.skip()).toThrow('simulated failure')
    expect(
      queueRepository.listActive().map(({ id, status, position }) => ({
        id,
        status,
        position,
      })),
    ).toEqual([
      { id: 'current', status: 'playing', position: 0 },
      { id: 'next', status: 'queued', position: 1 },
    ])
    expect(playerRepository.get()).toEqual({
      status: 'playing',
      currentQueueItemId: 'current',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })
})
