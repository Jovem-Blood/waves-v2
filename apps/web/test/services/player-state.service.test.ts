import { fileURLToPath } from 'node:url'

import type { QueueItem, QueueItemStatus, RealtimeEvent } from '@waves/shared'
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
import { PlayerStateService } from '../../server/services/playback/player-state.service'

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

function setup({
  publishRealtime,
}: {
  publishRealtime?: (event: RealtimeEvent) => { id: string; event: RealtimeEvent }
} = {}): {
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
    service: new PlayerStateService(
      playerRepository,
      unitOfWork,
      now,
      undefined,
      undefined,
      publishRealtime,
    ),
    unitOfWork,
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('PlayerStateService', () => {
  it('does not reset the next track or create attempts on duplicate completion', () => {
    const { queueRepository, service, unitOfWork } = setup()
    queueRepository.insert(item('first', 0))
    queueRepository.insert(item('second', 1))
    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'voice')
    const claim = service.claimPlayback()
    const input = {
      queueItemId: 'first',
      outcome: 'played' as const,
      playbackAttemptId: claim.playbackAttemptId!,
      attempt: 1,
      nextPlaybackAttemptId: 'next',
    }
    service.completePlayback(input)
    service.updateProgress({ queueItemId: 'second', progressMs: 20_000 })
    const repeated = service.completePlayback({ ...input, nextPlaybackAttemptId: 'duplicate' })
    expect(repeated.player.progressMs).toBe(20_000)
    expect(repeated.nextPlaybackAttemptId).toBe('next')
    expect(
      unitOfWork.run(({ playbackAttempt }) => playbackAttempt.find('duplicate', 1)),
    ).toBeUndefined()
  })
  it('returns the initial logical player state', () => {
    const { service } = setup()

    expect(service.get()).toMatchObject({
      status: 'idle',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })

  it('persists and clears the connected voice guild and channel', () => {
    const { service } = setup()

    expect(service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')).toMatchObject({
      status: 'idle',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(service.voiceDisconnected('other-guild')).toMatchObject({
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    const disconnected = service.voiceDisconnected('guild-1')
    expect(disconnected).toMatchObject({
      status: 'idle',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(disconnected).not.toHaveProperty('guildId')
    expect(disconnected).not.toHaveProperty('guildName')
    expect(disconnected).not.toHaveProperty('voiceChannelId')
    expect(disconnected).not.toHaveProperty('voiceChannelName')
  })

  it('returns the current playing item to the queue when voice disconnects', () => {
    const { playerRepository, queueRepository, service } = setup()
    queueRepository.insert(item('current', 0, 'playing'))
    queueRepository.insert(item('next', 1))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'current',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
    })

    expect(service.voiceDisconnected('guild-1')).toMatchObject({
      status: 'idle',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
    expect(queueRepository.listActive()).toEqual([
      expect.objectContaining({ id: 'current', status: 'queued', position: 0 }),
      expect.objectContaining({ id: 'next', status: 'queued', position: 1 }),
    ])
  })

  it('repairs an orphan playing item on an idempotent disconnect event', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('orphan', 0, 'playing'))

    service.voiceDisconnected('guild-1')

    expect(queueRepository.findById('orphan')).toMatchObject({
      status: 'queued',
      position: 0,
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

    expect(service.skip()).toMatchObject({
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

  it('publishes realtime player and queue updates for skip transitions', () => {
    const published: RealtimeEvent[] = []
    const { playerRepository, queueRepository, service } = setup({
      publishRealtime: (event) => {
        published.push(event)
        return { id: String(published.length), event }
      },
    })
    queueRepository.insert(item('current', 0, 'playing'))
    queueRepository.insert(item('next', 1))
    playerRepository.update({
      status: 'playing',
      currentQueueItemId: 'current',
    })

    service.skip()

    expect(published.map((event) => event.type)).toEqual(['player.updated', 'queue.updated'])
    expect(
      published[0]?.type === 'player.updated' ? published[0].player.currentQueueItemId : undefined,
    ).toBe('next')
    expect(published[1]).toMatchObject({
      type: 'queue.updated',
      reason: 'player_transition',
    })
    expect(
      published[1]?.type === 'queue.updated' ? published[1].queue[0] : undefined,
    ).toMatchObject({ id: 'next', status: 'playing' })
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
    expect(service.get()).toMatchObject({
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

    expect(service.skip()).toMatchObject({
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

    expect(service.skip()).toMatchObject({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
      queue: [],
    })
    expect(service.skip()).toMatchObject({
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

    expect(service.claimPlayback()).toMatchObject({
      player: {
        status: 'idle',
        updatedAt: '2026-06-18T15:00:00.000Z',
      },
    })

    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')
    const claimed = service.claimPlayback()
    expect(claimed.player).toMatchObject({
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
    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')
    service.claimPlayback()

    expect(service.completePlayback({ queueItemId: 'first', outcome: 'played' })).toMatchObject({
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
    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')
    service.claimPlayback()

    expect(service.completePlayback({ queueItemId: 'only', outcome: 'failed' })).toMatchObject({
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

  it('publishes an explicit queue failure event after failed completion', () => {
    const published: RealtimeEvent[] = []
    const { queueRepository, service } = setup({
      publishRealtime: (event) => {
        published.push(event)
        return { id: String(published.length), event }
      },
    })
    queueRepository.insert(item('only', 0))
    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')
    service.claimPlayback()
    published.length = 0

    service.completePlayback({ queueItemId: 'only', outcome: 'failed' })

    expect(published.map((event) => event.type)).toEqual([
      'queue.item_failed',
      'player.updated',
      'queue.updated',
    ])
    expect(
      published[0]?.type === 'queue.item_failed'
        ? { item: published[0].item, queue: published[0].queue }
        : undefined,
    ).toMatchObject({ item: { id: 'only', status: 'failed' }, queue: [] })
    expect(published[1]?.type === 'player.updated' ? published[1].player.status : undefined).toBe(
      'idle',
    )
    expect(published[2]).toMatchObject({
      type: 'queue.updated',
      reason: 'player_transition',
      queue: [],
    })
  })

  it('rejects a transition for an item that is not current', () => {
    const { queueRepository, service } = setup()
    queueRepository.insert(item('first', 0))
    queueRepository.insert(item('second', 1))
    service.voiceConnected('guild-1', 'Waves', 'voice-1', 'ondas-da-noite')
    service.claimPlayback()

    expect(() => service.completePlayback({ queueItemId: 'second', outcome: 'played' })).toThrow(
      'Playback transition does not match',
    )
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
    expect(playerRepository.get()).toMatchObject({
      status: 'playing',
      currentQueueItemId: 'current',
      updatedAt: '2026-06-18T15:00:00.000Z',
    })
  })
})
