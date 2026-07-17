import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

import type { QueueItem } from '@waves/shared'
import { ActivityType } from 'discord.js'
import type { Client } from 'discord.js'
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  type AudioPlayer,
  type AudioPlayerState,
  type AudioResource,
} from '@discordjs/voice'

import type { WavesApi } from '../api/waves-api.client.js'
import type { BotLogger } from '../logger.js'
import { classifyPlaybackError, playbackLogger, SafePlaybackError } from '../observability.js'
import type { VoiceManager } from '../voice/voice-manager.js'

export type StartPlaybackResult = 'started' | 'already-playing' | 'not-connected' | 'empty'
export type SkipPlaybackResult = 'skipped' | 'not-connected' | 'empty'

export interface PlaybackManager {
  start(guildId: string): Promise<StartPlaybackResult>
  skip(guildId: string): Promise<SkipPlaybackResult>
  pause(guildId: string): boolean
  resume(guildId: string): boolean
  setVolume(guildId: string, volume: number): boolean
  synchronize(guildId: string): Promise<void>
  destroyGuild(guildId: string): void
  destroyAll(): void
}

export interface ResourceCreationContext {
  logger: BotLogger
  playbackAttemptId: string
  provider: string
  sourceIdentifier: string
  attempt: number
  signal?: AbortSignal
  fetchTimeoutMs?: number
}

export interface PlaybackRuntime {
  createPlayer(): AudioPlayer
  createResource(
    streamUrl: string,
    queueItemId: string,
    context?: ResourceCreationContext,
  ): Promise<AudioResource<{ queueItemId: string }>>
}

interface CurrentPlayback {
  item: QueueItem
  retries: number
  playbackAttemptId: string
  abortController: AbortController
  provider?: string
  sourceIdentifier?: string
}

interface PlaybackSession {
  player: AudioPlayer
  current: CurrentPlayback | undefined
  settling: boolean
}

const RESOURCE_FETCH_TIMEOUT_MS = 10_000
const MIN_SUCCESSFUL_PLAYBACK_MS = 1_000
const SOURCE_CHUNK_SIZE = 256 * 1024

export type AudioSourceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export function createRangedAudioStream(
  streamUrl: string,
  request: AudioSourceFetch = fetch,
  context?: ResourceCreationContext,
): Readable {
  async function* chunks(): AsyncGenerator<Uint8Array> {
    let offset = 0
    let totalLength: number | undefined
    let totalBytes = 0
    const startedAt = Date.now()

    context?.logger.info(
      {
        operation: 'source.transport',
        outcome: 'started',
        provider: context.provider,
        sourceIdentifier: context.sourceIdentifier,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Segmented source transport started',
    )

    while (totalLength === undefined || offset < totalLength) {
      const end =
        totalLength === undefined
          ? offset + SOURCE_CHUNK_SIZE - 1
          : Math.min(offset + SOURCE_CHUNK_SIZE - 1, totalLength - 1)
      if (end < offset) {
        break
      }
      const controller = new AbortController()
      const abortFromContext = () => controller.abort()
      if (context?.signal?.aborted) {
        throw new SafePlaybackError('SOURCE_FETCH_CANCELLED')
      }
      context?.signal?.addEventListener('abort', abortFromContext, { once: true })
      const timeout = setTimeout(
        () => controller.abort(),
        context?.fetchTimeoutMs ?? RESOURCE_FETCH_TIMEOUT_MS,
      )
      timeout.unref?.()

      try {
        context?.logger.debug(
          {
            operation: 'source.range',
            rangeStart: offset,
            rangeEnd: end,
            attempt: context.attempt,
            playbackAttemptId: context.playbackAttemptId,
          },
          'Source range requested',
        )
        const response = await request(streamUrl, {
          headers: { Range: `bytes=${offset}-${end}` },
          signal: controller.signal,
        })
        if (response.status !== 206 || !response.body) {
          await response.body?.cancel()
          throw new SafePlaybackError('SOURCE_HTTP_STATUS', response.status)
        }

        const contentRange = response.headers.get('content-range')
        const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
        const responseStart = Number(match?.[1])
        const responseEnd = Number(match?.[2])
        const responseTotal = Number(match?.[3])
        const expectedEnd = Math.min(end, responseTotal - 1)
        if (
          !match ||
          responseStart !== offset ||
          !Number.isSafeInteger(responseEnd) ||
          !Number.isSafeInteger(responseTotal) ||
          responseTotal <= 0 ||
          responseEnd !== expectedEnd ||
          responseEnd < responseStart ||
          (totalLength !== undefined && responseTotal !== totalLength)
        ) {
          await response.body.cancel()
          throw new SafePlaybackError('SOURCE_INVALID_RANGE', response.status)
        }

        totalLength = responseTotal
        const chunk = new Uint8Array(await response.arrayBuffer())
        if (chunk.byteLength === 0) {
          throw new SafePlaybackError('SOURCE_EMPTY_RANGE', response.status)
        }
        if (chunk.byteLength !== responseEnd - responseStart + 1) {
          throw new SafePlaybackError('SOURCE_INVALID_RANGE', response.status)
        }
        context?.logger.debug(
          {
            operation: 'source.range',
            outcome: 'received',
            httpStatus: response.status,
            rangeStart: responseStart,
            rangeEnd: responseEnd,
            rangeBytes: chunk.byteLength,
            contentLength: totalLength,
            attempt: context.attempt,
            playbackAttemptId: context.playbackAttemptId,
          },
          'Source range received',
        )
        offset += chunk.byteLength
        totalBytes += chunk.byteLength
        yield chunk
      } catch (error) {
        const externallyCancelled = context?.signal?.aborted === true
        const classified = externallyCancelled
          ? { errorCode: 'SOURCE_FETCH_CANCELLED' as const }
          : error instanceof DOMException && error.name === 'AbortError'
            ? { errorCode: 'SOURCE_FETCH_TIMEOUT' as const }
            : classifyPlaybackError(error)
        const logPayload = {
          operation: 'source.range',
          outcome: externallyCancelled ? 'cancelled' : 'failed',
          ...classified,
          rangeStart: offset,
          rangeEnd: end,
          attempt: context?.attempt,
          playbackAttemptId: context?.playbackAttemptId,
        }
        if (externallyCancelled) {
          context?.logger.info(logPayload, 'Source range cancelled')
        } else {
          context?.logger.warn(logPayload, 'Source range failed')
        }
        throw externallyCancelled
          ? new SafePlaybackError('SOURCE_FETCH_CANCELLED')
          : error instanceof DOMException && error.name === 'AbortError'
            ? new SafePlaybackError('SOURCE_FETCH_TIMEOUT')
            : error
      } finally {
        clearTimeout(timeout)
        context?.signal?.removeEventListener('abort', abortFromContext)
      }
    }

    context?.logger.info(
      {
        operation: 'source.transport',
        outcome: 'completed',
        contentLength: totalLength,
        rangeBytes: totalBytes,
        durationMs: Date.now() - startedAt,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Segmented source transport completed',
    )
  }

  return Readable.from(chunks(), { objectMode: false })
}

const defaultRuntime: PlaybackRuntime = {
  createPlayer() {
    return createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    })
  },
  async createResource(streamUrl, queueItemId, context) {
    const input = createRangedAudioStream(streamUrl, fetch, context)
    const probeStartedAt = Date.now()
    let probe
    try {
      probe = await demuxProbe(input)
    } catch {
      throw new SafePlaybackError('DEMUX_PROBE_FAILED')
    }
    context?.logger.debug(
      {
        operation: 'source.demux_probe',
        outcome: 'completed',
        streamType: probe.type,
        durationMs: Date.now() - probeStartedAt,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Source demux probe completed',
    )
    try {
      const resource = createAudioResource(probe.stream, {
        inputType: probe.type,
        metadata: { queueItemId },
        inlineVolume: true,
      })
      context?.logger.info(
        {
          operation: 'audio_resource.create',
          outcome: 'completed',
          streamType: probe.type,
          attempt: context.attempt,
          playbackAttemptId: context.playbackAttemptId,
        },
        'Audio resource created',
      )
      return resource
    } catch {
      throw new SafePlaybackError('AUDIO_RESOURCE_FAILED')
    }
  },
}

export class AudioPlayerManager implements PlaybackManager {
  private readonly sessions = new Map<string, PlaybackSession>()
  private readonly startingGuilds = new Set<string>()
  private lastActivityGuildId: string | undefined

  constructor(
    private readonly api: WavesApi,
    private readonly voiceManager: VoiceManager,
    private readonly logger: BotLogger,
    private readonly client: Client,
    private readonly runtime: PlaybackRuntime = defaultRuntime,
  ) {}

  async start(guildId: string): Promise<StartPlaybackResult> {
    const playbackAttemptId = randomUUID()
    const logger = playbackLogger(this.logger, {
      operation: 'playback.start',
      guildId,
      voiceChannelId: this.voiceManager.getChannelId(guildId),
      playbackAttemptId,
    })
    logger.info({ outcome: 'requested' }, 'Playback start requested')
    if (!this.voiceManager.isConnected(guildId)) {
      logger.info({ outcome: 'not_connected' }, 'Playback start finished')
      return 'not-connected'
    }
    if (this.startingGuilds.has(guildId)) {
      logger.info({ outcome: 'already_starting' }, 'Playback start finished')
      return 'already-playing'
    }

    this.startingGuilds.add(guildId)
    try {
      const session = this.getOrCreateSession(guildId)
      if (session.current) {
        logger.info({ outcome: 'already_playing' }, 'Playback start finished')
        return 'already-playing'
      }

      logger.info({ operation: 'playback.claim', outcome: 'requested' }, 'Playback claim requested')
      let claim
      try {
        claim = await this.api.claimPlayback()
      } catch (error) {
        logger.error(
          { operation: 'playback.claim', outcome: 'failed', ...classifyPlaybackError(error) },
          'Playback claim failed',
        )
        throw error
      }
      if (!claim.item) {
        logger.info({ operation: 'playback.claim', outcome: 'empty' }, 'Playback claim completed')
        return 'empty'
      }
      logger.info(
        { operation: 'playback.claim', outcome: 'claimed', queueItemId: claim.item.id },
        'Playback claim completed',
      )

      await this.playItem(guildId, session, claim.item, 0, playbackAttemptId)
      logger.info({ outcome: 'started', queueItemId: claim.item.id }, 'Playback start finished')
      return 'started'
    } finally {
      this.startingGuilds.delete(guildId)
    }
  }

  hasActivePlayback(guildId: string): boolean {
    return this.sessions.get(guildId)?.current !== undefined
  }

  async skip(guildId: string): Promise<SkipPlaybackResult> {
    const current = this.sessions.get(guildId)?.current
    const logger = playbackLogger(this.logger, {
      operation: 'playback.skip',
      guildId,
      voiceChannelId: this.voiceManager.getChannelId(guildId),
      ...(current
        ? { queueItemId: current.item.id, playbackAttemptId: current.playbackAttemptId }
        : {}),
    })
    logger.info({ outcome: 'requested' }, 'Playback skip requested')
    if (!this.voiceManager.isConnected(guildId)) {
      logger.info({ outcome: 'not_connected' }, 'Playback skip finished')
      return 'not-connected'
    }

    const result = await this.api.skip()
    const session = this.getOrCreateSession(guildId)
    session.settling = true
    session.current?.abortController.abort()
    session.current = undefined
    session.player.stop(true)
    session.settling = false
    logger.info(
      { outcome: 'intentional_idle', playerStatusTo: AudioPlayerStatus.Idle },
      'Playback stopped for skip',
    )

    const next = result.queue[0]
    if (!next) {
      logger.info({ outcome: 'empty' }, 'Playback skip finished')
      this.updateActivity(guildId)
      return 'empty'
    }

    await this.playItem(guildId, session, next, 0, randomUUID())
    logger.info({ outcome: 'skipped', nextQueueItemId: next.id }, 'Playback skip finished')
    return 'skipped'
  }

  pause(guildId: string): boolean {
    return this.sessions.get(guildId)?.player.pause() ?? false
  }

  resume(guildId: string): boolean {
    return this.sessions.get(guildId)?.player.unpause() ?? false
  }

  setVolume(guildId: string, volume: number): boolean {
    const session = this.sessions.get(guildId)
    if (!session?.current || session.player.state.status === AudioPlayerStatus.Idle) return false
    const resource =
      session.player.state.status === AudioPlayerStatus.Playing ||
      session.player.state.status === AudioPlayerStatus.Paused
        ? session.player.state.resource
        : undefined
    resource?.volume?.setVolume(volume / 100)
    return resource?.volume !== undefined
  }

  async synchronize(guildId: string): Promise<void> {
    const desired = await this.api.getPlayer()
    const session = this.sessions.get(guildId)
    if (!session?.current) return

    if (desired.currentQueueItemId !== session.current.item.id) {
      const currentItem = session.current
      const logger = playbackLogger(this.logger, {
        operation: 'playback.sync',
        guildId,
        voiceChannelId: this.voiceManager.getChannelId(guildId),
        queueItemId: currentItem.item.id,
        playbackAttemptId: currentItem.playbackAttemptId,
      })
      if (!desired.currentQueueItemId) {
        logger.info({ outcome: 'forcing_idle' }, 'Web UI triggered idle, stopping playback')
      } else {
        logger.info(
          { outcome: 'forcing_skip', desiredQueueItemId: desired.currentQueueItemId },
          'Web UI skip detected, forcing playback transition',
        )
      }
      session.settling = true
      currentItem.abortController.abort()
      session.current = undefined
      session.player.stop(true)
      session.settling = false
      this.updateActivity(guildId)
      if (desired.currentQueueItemId) {
        const claim = await this.api.claimPlayback()
        if (claim.item) {
          await this.playItem(guildId, session, claim.item, 0, randomUUID())
        }
      }
      return
    }

    this.setVolume(guildId, desired.volume)
    if (desired.status === 'paused') this.pause(guildId)
    if (desired.status === 'playing') this.resume(guildId)
    const state = session.player.state
    if (
      (state.status === AudioPlayerStatus.Playing || state.status === AudioPlayerStatus.Paused) &&
      state.resource.playbackDuration - desired.progressMs >= 1_000
    ) {
      await this.api.updateProgress(session.current.item.id, state.resource.playbackDuration)
    }
  }

  destroyGuild(guildId: string): void {
    this.startingGuilds.delete(guildId)
    const session = this.sessions.get(guildId)
    if (!session) {
      return
    }
    const current = session.current
    session.settling = true
    current?.abortController.abort()
    session.current = undefined
    session.player.stop(true)
    this.updateActivity(guildId)
    this.sessions.delete(guildId)
    this.logger.info(
      {
        operation: 'playback.cleanup',
        guildId,
        voiceChannelId: this.voiceManager.getChannelId(guildId),
        ...(current
          ? { queueItemId: current.item.id, playbackAttemptId: current.playbackAttemptId }
          : {}),
        outcome: 'intentional_idle',
      },
      'Playback session destroyed',
    )
  }

  destroyAll(): void {
    for (const guildId of [...this.sessions.keys()]) {
      this.destroyGuild(guildId)
    }
  }

  private updateActivity(guildId: string, item?: QueueItem): void {
    if (item) {
      this.client.user?.setActivity(`🎵 Ouvindo ${item.track.title}`, {
        type: ActivityType.Listening,
      })
      this.lastActivityGuildId = guildId
    } else if (this.lastActivityGuildId === guildId) {
      this.client.user?.setActivity()
      this.lastActivityGuildId = undefined
    }
  }

  private getOrCreateSession(guildId: string): PlaybackSession {
    const existing = this.sessions.get(guildId)
    if (existing) {
      return existing
    }

    const player = this.runtime.createPlayer()
    const session: PlaybackSession = { player, current: undefined, settling: false }
    player.on('stateChange', (previousState, nextState) => {
      this.handleStateChange(guildId, session, previousState, nextState)
    })
    player.on('error', (error) => {
      void this.handlePlayerError(guildId, session, error)
    })

    if (!this.voiceManager.subscribe(guildId, player)) {
      player.stop(true)
      throw new Error('Voice connection is not ready for playback')
    }
    this.logger.info(
      {
        operation: 'voice.subscription',
        guildId,
        voiceChannelId: this.voiceManager.getChannelId(guildId),
        outcome: 'subscribed',
      },
      'Audio player subscribed',
    )

    this.sessions.set(guildId, session)
    return session
  }

  private async playItem(
    guildId: string,
    session: PlaybackSession,
    item: QueueItem,
    retries: number,
    playbackAttemptId: string,
  ): Promise<void> {
    const attempt = retries + 1
    const abortController = new AbortController()
    const current: CurrentPlayback = {
      item,
      retries,
      playbackAttemptId,
      abortController,
    }
    session.current = current
    const logger = playbackLogger(this.logger, {
      guildId,
      voiceChannelId: this.voiceManager.getChannelId(guildId),
      queueItemId: item.id,
      playbackAttemptId,
      attempt,
    })
    try {
      logger.info(
        { operation: 'source.resolve', outcome: 'started', forceRefresh: retries > 0 },
        'Audio source resolution started',
      )
      const resolveStartedAt = Date.now()
      const resolved = await this.api.resolveSource(item.id, retries > 0)
      if (
        abortController.signal.aborted ||
        this.sessions.get(guildId) !== session ||
        session.current !== current
      ) {
        logger.info(
          {
            operation: 'playback.attempt',
            outcome: 'cancelled',
            errorCode: 'SOURCE_FETCH_CANCELLED',
          },
          'Playback attempt cancelled',
        )
        return
      }
      logger.info(
        {
          operation: 'source.resolve',
          outcome: 'resolved',
          provider: resolved.source.provider,
          sourceIdentifier: resolved.source.sourceIdentifier,
          forceRefresh: retries > 0,
          durationMs: Date.now() - resolveStartedAt,
          expiresAt: resolved.source.expiresAt,
        },
        'Audio source resolution completed',
      )
      current.provider = resolved.source.provider
      current.sourceIdentifier = resolved.source.sourceIdentifier
      const resource = await this.runtime.createResource(
        resolved.source.streamUrl,
        resolved.queueItemId,
        {
          logger,
          playbackAttemptId,
          provider: resolved.source.provider,
          sourceIdentifier: resolved.source.sourceIdentifier,
          attempt,
          signal: abortController.signal,
        },
      )
      if (abortController.signal.aborted || session.current !== current) {
        return
      }
      logger.info(
        {
          operation: 'audio_player.play',
          outcome: 'submitted',
          provider: resolved.source.provider,
          sourceIdentifier: resolved.source.sourceIdentifier,
        },
        'Audio resource submitted to player',
      )
      session.player.play(resource)
      resource.volume?.setVolume((await this.api.getPlayer()).volume / 100)
      this.updateActivity(guildId, item)
    } catch (error) {
      if (
        abortController.signal.aborted ||
        (error instanceof SafePlaybackError && error.code === 'SOURCE_FETCH_CANCELLED')
      ) {
        logger.info(
          {
            operation: 'playback.attempt',
            outcome: 'cancelled',
            errorCode: 'SOURCE_FETCH_CANCELLED',
          },
          'Playback attempt cancelled',
        )
        return
      }
      abortController.abort()
      logger.warn(
        {
          operation: 'playback.attempt',
          outcome: retries < 1 ? 'retrying' : 'failed',
          forceRefresh: retries < 1,
          ...classifyPlaybackError(error),
        },
        'Playback attempt failed',
      )
      if (retries < 1) {
        await this.playItem(guildId, session, item, retries + 1, playbackAttemptId)
        return
      }
      await this.failAndAdvance(guildId, session, item, playbackAttemptId)
    }
  }

  private handleStateChange(
    guildId: string,
    session: PlaybackSession,
    previousState: AudioPlayerState,
    nextState: AudioPlayerState,
  ): void {
    const current = session.current
    const playbackDurationMs =
      previousState.status === AudioPlayerStatus.Playing
        ? previousState.resource.playbackDuration
        : nextState.status === AudioPlayerStatus.Playing
          ? nextState.resource.playbackDuration
          : undefined
    this.logger.debug(
      {
        operation: 'audio_player.state_change',
        guildId,
        voiceChannelId: this.voiceManager.getChannelId(guildId),
        ...(current
          ? {
              queueItemId: current.item.id,
              playbackAttemptId: current.playbackAttemptId,
              attempt: current.retries + 1,
              provider: current.provider,
              sourceIdentifier: current.sourceIdentifier,
            }
          : {}),
        playerStatusFrom: previousState.status,
        playerStatusTo: nextState.status,
        ...(playbackDurationMs === undefined ? {} : { playbackDurationMs }),
        ...(nextState.status === AudioPlayerStatus.Playing
          ? { missedFrames: nextState.missedFrames }
          : {}),
      },
      'Audio player state changed',
    )

    if (
      nextState.status === AudioPlayerStatus.Playing &&
      previousState.status !== AudioPlayerStatus.Playing &&
      current
    ) {
      this.logger.info(
        {
          operation: 'playback.lifecycle',
          guildId,
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          attempt: current.retries + 1,
          playerStatusFrom: previousState.status,
          playerStatusTo: nextState.status,
          outcome: 'started',
        },
        'Playback started',
      )
      void this.sendPlaybackEvent('playback.started', guildId, current.item.id)
      return
    }

    if (
      nextState.status === AudioPlayerStatus.Idle &&
      previousState.status !== AudioPlayerStatus.Idle &&
      !session.settling &&
      current
    ) {
      if (
        previousState.status === AudioPlayerStatus.Playing &&
        previousState.resource.playbackDuration < MIN_SUCCESSFUL_PLAYBACK_MS
      ) {
        this.logger.warn(
          {
            operation: 'playback.idle',
            guildId,
            queueItemId: current.item.id,
            playbackAttemptId: current.playbackAttemptId,
            attempt: current.retries + 1,
            playerStatusFrom: previousState.status,
            playerStatusTo: nextState.status,
            playbackDurationMs: previousState.resource.playbackDuration,
            outcome: 'premature',
            errorCode: 'PREMATURE_IDLE',
          },
          'Premature player idle detected',
        )
        void this.retryOrFail(guildId, session, current)
        return
      }
      session.current = undefined
      session.settling = true
      this.logger.info(
        {
          operation: 'playback.idle',
          guildId,
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          playerStatusFrom: previousState.status,
          playerStatusTo: nextState.status,
          ...(playbackDurationMs === undefined ? {} : { playbackDurationMs }),
          outcome: 'natural_completion',
        },
        'Natural playback completion detected',
      )
      void this.completeAndAdvance(guildId, session, current)
    }
  }

  private async handlePlayerError(
    guildId: string,
    session: PlaybackSession,
    error: unknown,
  ): Promise<void> {
    const current = session.current
    if (!current || session.settling) {
      return
    }

    this.logger.warn(
      {
        operation: 'audio_player.error',
        guildId,
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: current.retries < 1 ? 'refreshing' : 'failing',
        ...classifyPlaybackError(error),
        errorCode: 'PLAYER_ERROR',
      },
      'Audio player error',
    )
    await this.retryOrFail(guildId, session, current)
  }

  private async retryOrFail(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
  ): Promise<void> {
    session.settling = true
    current.abortController.abort()
    session.current = undefined
    if (current.retries < 1) {
      session.settling = false
      await this.playItem(
        guildId,
        session,
        current.item,
        current.retries + 1,
        current.playbackAttemptId,
      )
      return
    }
    await this.failAndAdvance(guildId, session, current.item, current.playbackAttemptId)
  }

  private async completeAndAdvance(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
  ): Promise<void> {
    try {
      const result = await this.api.completePlayback({
        queueItemId: current.item.id,
        outcome: 'played',
      })
      this.logger.info(
        {
          operation: 'playback.complete',
          guildId,
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          outcome: 'played',
          nextQueueItemId: result.nextItem?.id,
        },
        'Playback completion synchronized',
      )
      void this.sendPlaybackEvent('playback.finished', guildId, current.item.id)
      session.settling = false
      if (result.nextItem) {
        await this.playItem(guildId, session, result.nextItem, 0, randomUUID())
      } else {
        this.updateActivity(guildId)
      }
    } catch (error) {
      session.settling = false
      const classified = classifyPlaybackError(error)
      this.logger.error(
        {
          operation: 'playback.complete',
          guildId,
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          outcome: 'sync_failed',
          errorCode: 'PLAYBACK_SYNC_FAILED',
          ...(classified.httpStatus === undefined ? {} : { httpStatus: classified.httpStatus }),
        },
        'Playback completion sync failed',
      )
    }
  }

  private async failAndAdvance(
    guildId: string,
    session: PlaybackSession,
    item: QueueItem,
    playbackAttemptId: string,
  ): Promise<void> {
    session.settling = true
    session.current = undefined
    try {
      const result = await this.api.completePlayback({
        queueItemId: item.id,
        outcome: 'failed',
      })
      this.logger.info(
        {
          operation: 'playback.complete',
          guildId,
          queueItemId: item.id,
          playbackAttemptId,
          outcome: 'failed',
          nextQueueItemId: result.nextItem?.id,
        },
        'Playback failure synchronized',
      )
      void this.sendPlaybackEvent('playback.failed', guildId, item.id)
      session.settling = false
      if (result.nextItem) {
        await this.playItem(guildId, session, result.nextItem, 0, randomUUID())
      } else {
        this.updateActivity(guildId)
      }
    } catch (error) {
      session.settling = false
      const classified = classifyPlaybackError(error)
      this.logger.error(
        {
          operation: 'playback.complete',
          guildId,
          queueItemId: item.id,
          playbackAttemptId,
          outcome: 'sync_failed',
          errorCode: 'PLAYBACK_SYNC_FAILED',
          ...(classified.httpStatus === undefined ? {} : { httpStatus: classified.httpStatus }),
        },
        'Playback failure sync failed',
      )
    }
  }

  private async sendPlaybackEvent(
    type: 'playback.started' | 'playback.finished' | 'playback.failed',
    guildId: string,
    queueItemId: string,
  ): Promise<void> {
    await this.api
      .sendEvent({
        type,
        occurredAt: new Date().toISOString(),
        guildId,
        payload: { queueItemId },
      })
      .catch(() => {
        this.logger.error(
          {
            operation: 'playback.event',
            guildId,
            queueItemId,
            eventType: type,
            outcome: 'sync_failed',
            errorCode: 'PLAYBACK_SYNC_FAILED',
          },
          'Playback event sync failed',
        )
      })
  }
}
