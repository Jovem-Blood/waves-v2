import { EventEmitter } from 'node:events'

import type { QueueItem } from '@waves/shared'
import {
  AudioPlayerStatus,
  PlayerSubscription,
  type AudioPlayer,
  type AudioPlayerState,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice'
import { describe, expect, it, vi } from 'vitest'

import type { WavesApi } from '../src/api/waves-api.client.js'
import type { BotLogger } from '../src/logger.js'
import {
  AudioPlayerManager,
  type PlaybackRuntime,
} from '../src/playback/audio-player-manager.js'
import type { VoiceManager } from '../src/voice/voice-manager.js'

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
  status: 'playing',
  position: 0,
  createdAt: '2026-06-20T12:00:00.000Z',
  updatedAt: '2026-06-20T12:00:00.000Z',
}
const nextItem: QueueItem = {
  ...item,
  id: 'queue-2',
  track: {
    ...item.track,
    id: 'spotify:track-2',
    providerTrackId: 'track-2',
    title: 'Track Two',
  },
}

class FakeAudioPlayer extends EventEmitter {
  state = { status: AudioPlayerStatus.Idle } as AudioPlayerState
  readonly played: AudioResource[] = []
  readonly stop = vi.fn((force?: boolean) => {
    const previous = this.state
    this.state = { status: AudioPlayerStatus.Idle }
    this.emit('stateChange', previous, this.state)
    return force ?? false
  })

  play(resource: AudioResource): void {
    const previous = this.state
    this.played.push(resource)
    this.state = { status: AudioPlayerStatus.Playing, resource } as AudioPlayerState
    this.emit('stateChange', previous, this.state)
  }

  finish(): void {
    const previous = this.state
    this.state = { status: AudioPlayerStatus.Idle }
    this.emit('stateChange', previous, this.state)
  }

  fail(): void {
    this.emit('error', new Error('signed-url-must-not-be-logged'))
  }
}

function setup(connected = true) {
  const player = new FakeAudioPlayer()
  const createResource = vi.fn((streamUrl: string, queueItemId: string) => {
    return { metadata: { queueItemId }, streamUrl } as unknown as AudioResource<{
      queueItemId: string
    }>
  })
  const runtime: PlaybackRuntime = {
    createPlayer: () => player as unknown as AudioPlayer,
    createResource,
  }
  const claimPlayback = vi.fn().mockResolvedValue({
    player: {
      status: 'playing',
      currentQueueItemId: item.id,
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: item.updatedAt,
    },
    item,
  })
  const resolveSource = vi.fn().mockResolvedValue({
    queueItemId: item.id,
    source: {
      provider: 'audius',
      sourceIdentifier: 'audius-1',
      streamUrl: 'https://stream.example/signed',
      expiresAt: '2026-06-20T12:05:00.000Z',
    },
  })
  const completePlayback = vi.fn().mockResolvedValue({
    completedQueueItemId: item.id,
    player: {
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: item.updatedAt,
    },
    queue: [],
  })
  const skip = vi.fn().mockResolvedValue({
    player: {
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: item.updatedAt,
    },
    queue: [],
  })
  const sendEvent = vi.fn().mockResolvedValue(undefined)
  const api: WavesApi = {
    claimPlayback,
    completePlayback,
    getQueue: vi.fn(),
    play: vi.fn(),
    resolveSource,
    sendEvent,
    skip,
  }
  const subscription = new PlayerSubscription(
    {} as VoiceConnection,
    player as unknown as AudioPlayer,
  )
  const subscribe = vi.fn().mockReturnValue(subscription)
  const voiceManager: VoiceManager = {
    destroyAll: vi.fn(),
    isConnected: vi.fn().mockReturnValue(connected),
    join: vi.fn(),
    leave: vi.fn(),
    subscribe,
  }
  const loggerError = vi.fn()
  const logger = { error: loggerError } as unknown as BotLogger
  const manager = new AudioPlayerManager(api, voiceManager, logger, runtime)

  return {
    manager,
    player,
    mocks: {
      claimPlayback,
      completePlayback,
      createResource,
      loggerError,
      resolveSource,
      sendEvent,
      skip,
      subscribe,
    },
  }
}

describe('AudioPlayerManager', () => {
  it('does not claim playback without a ready voice connection', async () => {
    const { manager, mocks } = setup(false)

    await expect(manager.start('guild-1')).resolves.toBe('not-connected')
    expect(mocks.claimPlayback).not.toHaveBeenCalled()
  })

  it('claims, resolves, subscribes and starts the current queue item', async () => {
    const { manager, player, mocks } = setup()

    await expect(manager.start('guild-1')).resolves.toBe('started')
    expect(mocks.subscribe).toHaveBeenCalledOnce()
    expect(mocks.resolveSource).toHaveBeenCalledWith('queue-1', false)
    expect(mocks.createResource).toHaveBeenCalledWith(
      'https://stream.example/signed',
      'queue-1',
    )
    expect(player.played).toHaveLength(1)
    await vi.waitFor(() => {
      expect(mocks.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'playback.started',
          guildId: 'guild-1',
          payload: { queueItemId: 'queue-1' },
        }),
      )
    })
  })

  it('completes an idle resource and automatically starts the promoted next item', async () => {
    const { manager, player, mocks } = setup()
    mocks.completePlayback.mockResolvedValue({
      completedQueueItemId: item.id,
      player: {
        status: 'playing',
        currentQueueItemId: nextItem.id,
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        updatedAt: item.updatedAt,
      },
      queue: [nextItem],
      nextItem,
    })
    mocks.resolveSource
      .mockResolvedValueOnce({
        queueItemId: item.id,
        source: {
          provider: 'audius',
          sourceIdentifier: 'audius-1',
          streamUrl: 'https://stream.example/one',
          expiresAt: '2026-06-20T12:05:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        queueItemId: nextItem.id,
        source: {
          provider: 'audius',
          sourceIdentifier: 'audius-2',
          streamUrl: 'https://stream.example/two',
          expiresAt: '2026-06-20T12:05:00.000Z',
        },
      })

    await manager.start('guild-1')
    player.finish()

    await vi.waitFor(() => {
      expect(mocks.completePlayback).toHaveBeenCalledWith({
        queueItemId: item.id,
        outcome: 'played',
      })
      expect(player.played).toHaveLength(2)
    })
  })

  it('refreshes the source once after a player error before failing the item', async () => {
    const { manager, player, mocks } = setup()

    await manager.start('guild-1')
    player.fail()

    await vi.waitFor(() => {
      expect(mocks.resolveSource).toHaveBeenNthCalledWith(2, item.id, true)
      expect(player.played).toHaveLength(2)
    })
    expect(mocks.completePlayback).not.toHaveBeenCalled()
  })

  it('suppresses the idle transition caused by skip and plays the API-selected next item', async () => {
    const { manager, player, mocks } = setup()
    mocks.skip.mockResolvedValue({
      player: {
        status: 'playing',
        currentQueueItemId: nextItem.id,
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        updatedAt: item.updatedAt,
      },
      queue: [nextItem],
    })
    mocks.resolveSource.mockImplementation((queueItemId: string) =>
      Promise.resolve({
        queueItemId,
        source: {
          provider: 'audius',
          sourceIdentifier: `audius-${queueItemId}`,
          streamUrl: `https://stream.example/${queueItemId}`,
          expiresAt: '2026-06-20T12:05:00.000Z',
        },
      }),
    )

    await manager.start('guild-1')
    await expect(manager.skip('guild-1')).resolves.toBe('skipped')

    expect(player.stop).toHaveBeenCalledWith(true)
    expect(mocks.completePlayback).not.toHaveBeenCalled()
    expect(mocks.resolveSource).toHaveBeenLastCalledWith(nextItem.id, false)
  })
})
