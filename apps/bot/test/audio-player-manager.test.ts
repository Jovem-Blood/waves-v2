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
  createRangedAudioStream,
  type ResourceCreationContext,
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
    Object.defineProperty(resource, 'playbackDuration', {
      configurable: true,
      value: 120_000,
      writable: true,
    })
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

  finishPrematurely(): void {
    if (this.state.status === AudioPlayerStatus.Playing) {
      Object.defineProperty(this.state.resource, 'playbackDuration', {
        configurable: true,
        value: 100,
        writable: true,
      })
    }
    this.finish()
  }

  fail(): void {
    this.emit('error', new Error('signed-url-must-not-be-logged'))
  }
}

function setup(connected = true) {
  const player = new FakeAudioPlayer()
  const createResource = vi.fn(
    (streamUrl: string, queueItemId: string, context?: ResourceCreationContext) => {
      void context
      return { metadata: { queueItemId }, streamUrl } as unknown as AudioResource<{
        queueItemId: string
      }>
    },
  )
  const runtime: PlaybackRuntime = {
    createPlayer: () => player as unknown as AudioPlayer,
    createResource: (streamUrl, queueItemId, context) =>
      Promise.resolve(createResource(streamUrl, queueItemId, context)),
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
    getPlayer: vi.fn().mockResolvedValue({
      status: 'playing',
      volume: 100,
      progressMs: 0,
      updatedAt: item.updatedAt,
    }),
    updateProgress: vi.fn(),
  }
  const subscription = new PlayerSubscription(
    {} as VoiceConnection,
    player as unknown as AudioPlayer,
  )
  const subscribe = vi.fn().mockReturnValue(subscription)
  const voiceManager: VoiceManager = {
    destroyAll: vi.fn(),
    getConnectedGuildIds: vi.fn().mockReturnValue(connected ? ['guild-1'] : []),
    getChannelId: vi.fn().mockReturnValue('voice-1'),
    isConnected: vi.fn().mockReturnValue(connected),
    join: vi.fn(),
    leave: vi.fn(),
    subscribe,
  }
  const loggerError = vi.fn()
  const loggerInfo = vi.fn()
  const loggerWarn = vi.fn()
  const loggerDebug = vi.fn()
  const loggerChild = vi.fn()
  const logger = {
    child: loggerChild,
    debug: loggerDebug,
    error: loggerError,
    info: loggerInfo,
    warn: loggerWarn,
  }
  loggerChild.mockReturnValue(logger)
  const manager = new AudioPlayerManager(api, voiceManager, logger as unknown as BotLogger, runtime)

  return {
    manager,
    player,
    mocks: {
      claimPlayback,
      completePlayback,
      createResource,
      loggerError,
      loggerInfo,
      loggerWarn,
      loggerDebug,
      loggerChild,
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
    expect(mocks.createResource.mock.calls[0]?.[0]).toBe('https://stream.example/signed')
    expect(mocks.createResource.mock.calls[0]?.[1]).toBe('queue-1')
    expect(mocks.createResource.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal)
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
    const operations = mocks.loggerInfo.mock.calls
      .map(([bindings]) => bindings as unknown)
      .filter((bindings): bindings is Record<string, unknown> => typeof bindings === 'object')
      .map((bindings) => bindings.operation)
    expect(operations).toEqual(
      expect.arrayContaining([
        'playback.claim',
        'source.resolve',
        'audio_player.play',
        'playback.lifecycle',
      ]),
    )
    expect(mocks.loggerChild).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'playback.start', guildId: 'guild-1' }),
    )
    const attemptIds = new Set(
      mocks.loggerChild.mock.calls
        .map(([bindings]) => (bindings as Record<string, unknown>).playbackAttemptId)
        .filter(Boolean),
    )
    expect(attemptIds.size).toBe(1)
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
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'audio_player.error',
        errorCode: 'PLAYER_ERROR',
        outcome: 'refreshing',
      }),
      'Audio player error',
    )
  })

  it('treats an immediate idle transition as a failed stream and refreshes the source', async () => {
    const { manager, player, mocks } = setup()

    await manager.start('guild-1')
    player.finishPrematurely()

    await vi.waitFor(() => {
      expect(mocks.resolveSource).toHaveBeenNthCalledWith(2, item.id, true)
      expect(player.played).toHaveLength(2)
    })
    expect(mocks.completePlayback).not.toHaveBeenCalled()
    expect(mocks.sendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'playback.finished' }),
    )
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'playback.idle',
        errorCode: 'PREMATURE_IDLE',
        outcome: 'premature',
      }),
      'Premature player idle detected',
    )
  })

  it('logs a definitive failure and advances after the retry also fails', async () => {
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

    await manager.start('guild-1')
    player.fail()
    await vi.waitFor(() => expect(player.played).toHaveLength(2))
    player.fail()

    await vi.waitFor(() => {
      expect(mocks.completePlayback).toHaveBeenCalledWith({
        queueItemId: item.id,
        outcome: 'failed',
      })
    })
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'playback.complete',
        queueItemId: item.id,
        outcome: 'failed',
        nextQueueItemId: nextItem.id,
      }),
      'Playback failure synchronized',
    )
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
    const firstSignal = (mocks.createResource.mock.calls[0]?.[2] as ResourceCreationContext).signal
    await expect(manager.skip('guild-1')).resolves.toBe('skipped')

    expect(firstSignal?.aborted).toBe(true)
    expect(player.stop).toHaveBeenCalledWith(true)
    expect(mocks.completePlayback).not.toHaveBeenCalled()
    expect(mocks.resolveSource).toHaveBeenLastCalledWith(nextItem.id, false)
    expect(mocks.loggerInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'natural_completion' }),
      expect.any(String),
    )
  })

  it('cancels the active source when the guild playback session is destroyed', async () => {
    const { manager, mocks } = setup()

    await manager.start('guild-1')
    const signal = (mocks.createResource.mock.calls[0]?.[2] as ResourceCreationContext).signal
    manager.destroyGuild('guild-1')

    expect(signal?.aborted).toBe(true)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'playback.cleanup',
        outcome: 'intentional_idle',
      }),
      'Playback session destroyed',
    )
  })

  it('does not start a resource when leave occurs while source resolution is pending', async () => {
    const { manager, mocks } = setup()
    let finishResolution!: (value: Awaited<ReturnType<WavesApi['resolveSource']>>) => void
    mocks.resolveSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishResolution = resolve
        }),
    )

    const start = manager.start('guild-1')
    await vi.waitFor(() => expect(mocks.resolveSource).toHaveBeenCalledOnce())
    manager.destroyGuild('guild-1')
    finishResolution({
      queueItemId: item.id,
      source: {
        provider: 'audius',
        sourceIdentifier: 'audius-1',
        streamUrl: 'https://stream.example/signed',
        expiresAt: '2026-06-20T12:05:00.000Z',
      },
    })

    await expect(start).resolves.toBe('started')
    expect(mocks.createResource).not.toHaveBeenCalled()
  })
})

describe('createRangedAudioStream', () => {
  async function streamError(stream: NodeJS.ReadableStream): Promise<unknown> {
    return new Promise((resolve) => {
      stream.once('error', resolve)
      stream.resume()
    })
  }

  function loggerContext(
    overrides: Partial<ResourceCreationContext> = {},
  ): ResourceCreationContext {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as BotLogger
    return {
      logger,
      playbackAttemptId: 'attempt-1',
      provider: 'youtube_music',
      sourceIdentifier: 'video-1',
      attempt: 1,
      ...overrides,
    }
  }

  it('creates a binary stream compatible with demux probing', () => {
    const stream = createRangedAudioStream('https://media.example/audio', vi.fn())

    expect(stream.readableObjectMode).toBe(false)
    stream.destroy()
  })

  it('downloads the source in bounded sequential ranges', async () => {
    const source = new Uint8Array(600_000).map((_, index) => index % 251)
    const request = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('range')
      const match = range?.match(/^bytes=(\d+)-(\d+)$/)
      if (!match) {
        throw new Error('Missing range')
      }
      const start = Number(match[1])
      const requestedEnd = Number(match[2])
      const end = Math.min(requestedEnd, source.byteLength - 1)
      return Promise.resolve(
        new Response(source.slice(start, end + 1), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${source.byteLength}`,
          },
        }),
      )
    })

    const received: Buffer[] = []
    for await (const chunk of createRangedAudioStream('https://media.example/audio', request)) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('Expected a byte chunk')
      }
      received.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(received)).toEqual(Buffer.from(source))
    expect(request).toHaveBeenCalledTimes(3)
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get('range')).toBe('bytes=0-262143')
    expect(new Headers(request.mock.calls[1]?.[1]?.headers).get('range')).toBe(
      'bytes=262144-524287',
    )
    expect(new Headers(request.mock.calls[2]?.[1]?.headers).get('range')).toBe(
      'bytes=524288-786431',
    )
  }, 10_000)

  it('rejects invalid range responses without exposing the URL', async () => {
    const stream = createRangedAudioStream('https://media.example/signed-secret', () =>
      Promise.resolve(new Response('forbidden', { status: 403 })),
    )

    const error = await streamError(stream)
    expect(String(error)).not.toContain('signed-secret')
  })

  it.each([400, 403, 416])('rejects HTTP status %s safely', async (status) => {
    const stream = createRangedAudioStream('https://media.example/audio', () =>
      Promise.resolve(new Response(null, { status })),
    )

    await expect(streamError(stream)).resolves.toMatchObject({
      code: 'SOURCE_HTTP_STATUS',
      httpStatus: status,
    })
  })

  it('rejects inconsistent Content-Range metadata', async () => {
    const stream = createRangedAudioStream('https://media.example/audio', () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-1/3' },
        }),
      ),
    )

    await expect(streamError(stream)).resolves.toMatchObject({
      code: 'SOURCE_INVALID_RANGE',
    })
  })

  it('rejects an empty range body', async () => {
    const stream = createRangedAudioStream('https://media.example/audio', () =>
      Promise.resolve(
        new Response(new Uint8Array(0), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-0/1' },
        }),
      ),
    )

    await expect(streamError(stream)).resolves.toMatchObject({
      code: 'SOURCE_EMPTY_RANGE',
    })
  })

  it('times out the first range request', async () => {
    const request = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const stream = createRangedAudioStream(
      'https://media.example/audio',
      request,
      loggerContext({ fetchTimeoutMs: 5 }),
    )

    await expect(streamError(stream)).resolves.toMatchObject({
      code: 'SOURCE_FETCH_TIMEOUT',
    })
  })

  it('times out a later range request', async () => {
    const first = new Uint8Array(256 * 1024)
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(first, {
          status: 206,
          headers: { 'Content-Range': `bytes 0-${first.byteLength - 1}/300000` },
        }),
      )
      .mockImplementationOnce((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        })
      })
    const stream = createRangedAudioStream(
      'https://media.example/audio',
      request,
      loggerContext({ fetchTimeoutMs: 5 }),
    )

    await expect(streamError(stream)).resolves.toMatchObject({
      code: 'SOURCE_FETCH_TIMEOUT',
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('cancels an in-flight range without classifying it as a timeout', async () => {
    const controller = new AbortController()
    const context = loggerContext({ signal: controller.signal, fetchTimeoutMs: 1_000 })
    const request = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const stream = createRangedAudioStream('https://media.example/audio', request, context)
    const errorPromise = streamError(stream)

    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    controller.abort()

    await expect(errorPromise).resolves.toMatchObject({
      code: 'SOURCE_FETCH_CANCELLED',
    })
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'source.range',
        outcome: 'cancelled',
        errorCode: 'SOURCE_FETCH_CANCELLED',
      }),
      'Source range cancelled',
    )
  })

  it('logs range metadata without logging the source URL', async () => {
    const logs: unknown[][] = []
    const logger = {
      debug: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
    } as unknown as BotLogger
    const source = new Uint8Array([1, 2, 3])
    const stream = createRangedAudioStream(
      'https://media.example/audio?signature=secret',
      () =>
        Promise.resolve(
          new Response(source, {
            status: 206,
            headers: { 'Content-Range': 'bytes 0-2/3' },
          }),
        ),
      {
        logger,
        playbackAttemptId: 'attempt-1',
        provider: 'youtube_music',
        sourceIdentifier: 'video-1',
        attempt: 1,
      },
    )

    for await (const chunk of stream) {
      expect(chunk).toBeInstanceOf(Uint8Array)
    }

    const serialized = JSON.stringify(logs)
    expect(serialized).toContain('"rangeBytes":3')
    expect(serialized).toContain('"sourceIdentifier":"video-1"')
    expect(serialized).not.toContain('media.example')
    expect(serialized).not.toContain('signature')
    expect(serialized).not.toContain('secret')
  })
})
