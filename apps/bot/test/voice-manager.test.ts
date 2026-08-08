import { EventEmitter } from 'node:events'

import {
  VoiceConnectionStatus,
  type DiscordGatewayAdapterCreator,
  type AudioPlayer,
  type VoiceConnection,
  type VoiceConnectionState,
} from '@discordjs/voice'
import { describe, expect, it, vi } from 'vitest'

import type { BotLogger } from '../src/logger.js'
import { DiscordVoiceManager, VoiceConnectionError } from '../src/voice/discord-voice.manager.js'

interface FakeConnection extends EventEmitter {
  state: VoiceConnectionState
  destroy: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function connection(initialStatus = VoiceConnectionStatus.Connecting): FakeConnection {
  const emitter = new EventEmitter() as FakeConnection
  emitter.state = { status: initialStatus } as VoiceConnectionState
  emitter.destroy = vi.fn(() => {
    const previous = emitter.state
    emitter.state = { status: VoiceConnectionStatus.Destroyed }
    emitter.emit('stateChange', previous, emitter.state)
  })
  emitter.subscribe = vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
  return emitter
}

function setup() {
  const connections: FakeConnection[] = []
  const waitUntilReady = vi.fn((value: VoiceConnection): Promise<void> => {
    const fake = value as unknown as FakeConnection
    fake.state = { status: VoiceConnectionStatus.Ready } as VoiceConnectionState
    return Promise.resolve()
  })
  const runtime = {
    join: vi.fn(() => {
      const value = connection()
      connections.push(value)
      return value as unknown as VoiceConnection
    }),
    waitUntilReady,
  }
  const onUnexpectedDisconnect = vi.fn().mockResolvedValue(undefined)
  const onConnectionStateChange = vi.fn().mockResolvedValue(undefined)
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as BotLogger
  const manager = new DiscordVoiceManager(
    logger,
    onUnexpectedDisconnect,
    runtime,
    100,
    onConnectionStateChange,
  )
  const adapterCreator = vi.fn() as unknown as DiscordGatewayAdapterCreator

  return {
    adapterCreator,
    connections,
    manager,
    onUnexpectedDisconnect,
    onConnectionStateChange,
    runtime,
    waitUntilReady,
  }
}

describe('DiscordVoiceManager', () => {
  it('connects, reuses the same channel and replaces a different channel', async () => {
    const test = setup()

    await expect(
      test.manager.join({
        guildId: 'guild-1',
        channelId: 'voice-1',
        adapterCreator: test.adapterCreator,
      }),
    ).resolves.toBe('connected')
    await expect(
      test.manager.join({
        guildId: 'guild-1',
        channelId: 'voice-1',
        adapterCreator: test.adapterCreator,
      }),
    ).resolves.toBe('already-connected')
    await expect(
      test.manager.join({
        guildId: 'guild-1',
        channelId: 'voice-2',
        adapterCreator: test.adapterCreator,
      }),
    ).resolves.toBe('connected')

    expect(test.runtime.join).toHaveBeenCalledTimes(2)
    expect(test.connections[0]?.destroy).toHaveBeenCalledOnce()
    expect(test.manager.isConnected('guild-1')).toBe(true)
    expect(test.manager.getConnectedGuildIds()).toEqual(['guild-1'])
    const player = {} as AudioPlayer
    expect(test.manager.subscribe('guild-1', player)).toBeDefined()
    expect(test.connections[1]?.subscribe).toHaveBeenCalledWith(player)
    expect(test.manager.leave('guild-1')).toBe(true)
    expect(test.manager.isConnected('guild-1')).toBe(false)
    expect(test.manager.getConnectedGuildIds()).toEqual([])
    expect(test.manager.leave('guild-1')).toBe(false)
  })

  it('destroys a partial connection when ready times out', async () => {
    const test = setup()
    const cause = new Error('timeout')
    test.waitUntilReady.mockRejectedValueOnce(cause)

    const error = await test.manager
      .join({
        guildId: 'guild-1',
        channelId: 'voice-1',
        adapterCreator: test.adapterCreator,
      })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(VoiceConnectionError)
    expect((error as Error).cause).toBe(cause)
    expect(test.connections[0]?.destroy).toHaveBeenCalledOnce()
    expect(test.manager.leave('guild-1')).toBe(false)
  })

  it('reports unexpected destruction and destroys every active connection', async () => {
    const test = setup()
    await test.manager.join({
      guildId: 'guild-1',
      channelId: 'voice-1',
      adapterCreator: test.adapterCreator,
    })
    const first = test.connections[0]!
    const previous = first.state
    first.state = { status: VoiceConnectionStatus.Destroyed }
    first.emit('stateChange', previous, first.state)
    await vi.waitFor(() => {
      expect(test.onUnexpectedDisconnect).toHaveBeenCalledWith('guild-1', 'voice-1')
    })

    await test.manager.join({
      guildId: 'guild-2',
      channelId: 'voice-2',
      adapterCreator: test.adapterCreator,
    })
    test.manager.destroyAll()
    expect(test.connections[1]?.destroy).toHaveBeenCalledOnce()
  })

  it('reports reconnecting and reconnected voice states', async () => {
    const test = setup()
    await test.manager.join({
      guildId: 'guild-1',
      channelId: 'voice-1',
      adapterCreator: test.adapterCreator,
    })
    const active = test.connections[0]!
    const previous = active.state
    active.state = { status: VoiceConnectionStatus.Disconnected } as VoiceConnectionState
    active.emit('stateChange', previous, active.state)

    await vi.waitFor(() => {
      expect(test.onConnectionStateChange).toHaveBeenCalledWith(
        'reconnecting',
        'guild-1',
        'voice-1',
      )
      expect(test.onConnectionStateChange).toHaveBeenCalledWith('reconnected', 'guild-1', 'voice-1')
    })
  })
})
