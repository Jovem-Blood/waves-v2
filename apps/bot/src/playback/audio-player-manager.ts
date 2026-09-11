import { randomUUID } from 'node:crypto'

import type { AudioSourceProvider, PlaybackAttemptReport, QueueItem } from '@waves/shared'
import { ActivityType } from 'discord.js'
import type { Client } from 'discord.js'
import { AudioPlayerStatus, type AudioPlayer, type AudioPlayerState } from '@discordjs/voice'

import type { WavesApi } from '../api/waves-api.client.js'
import type { BotLogger } from '../logger.js'
import {
  classifyPlaybackError,
  playbackFailureClass,
  playbackFailureStage,
  playbackLogger,
  SafePlaybackError,
} from '../observability.js'
import type { VoiceManager } from '../voice/voice-manager.js'
import { defaultPlaybackRuntime, type PlaybackRuntime } from './playback-runtime.js'
import { deliverPlayback } from './telemetry-delivery.js'

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

interface CurrentPlayback {
  item: QueueItem
  retries: number
  playbackAttemptId: string
  abortController: AbortController
  provider?: AudioSourceProvider
  sourceIdentifier?: string
  failureStage?: 'claim' | 'resolve' | 'transport' | 'demux' | 'resource' | 'player' | 'sync'
  failureClass?: PlaybackAttemptReport['failureClass']
  errorCode?: string
  httpStatus?: number
}

interface PlaybackSession {
  player: AudioPlayer
  current: CurrentPlayback | undefined
  settling: boolean
}

const MIN_SUCCESSFUL_PLAYBACK_MS = 1_000

export class AudioPlayerManager implements PlaybackManager {
  private readonly sessions = new Map<string, PlaybackSession>()
  private readonly startingGuilds = new Set<string>()
  private readonly deliveries = new Set<Promise<void>>()
  private lastActivityGuildId: string | undefined

  constructor(
    private readonly api: WavesApi,
    private readonly voiceManager: VoiceManager,
    private readonly logger: BotLogger,
    private readonly client: Client,
    private readonly runtime: PlaybackRuntime = defaultPlaybackRuntime,
  ) {}

  private reportAttempt(input: PlaybackAttemptReport): Promise<void> {
    const delivery = deliverPlayback(
      'telemetry.attempt',
      input,
      () => this.api.reportPlaybackAttempt(input),
      this.logger,
    ).catch(() => {
      // Each failure and exhausted delivery was logged by deliverPlayback.
      // Server-side stale reconciliation recovers attempts if the API stays offline.
    })
    this.deliveries.add(delivery)
    void delivery.then(() => this.deliveries.delete(delivery))
    return delivery
  }

  async flushTelemetry(): Promise<void> {
    await Promise.all([...this.deliveries])
  }

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
        claim = await this.api.claimPlayback(playbackAttemptId)
      } catch (error) {
        logger.error(
          {
            operation: 'playback.claim',
            outcome: 'failed',
            ...classifyPlaybackError(error),
            err: error,
          },
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

      await this.playItem(
        guildId,
        session,
        claim.item,
        0,
        claim.playbackAttemptId ?? playbackAttemptId,
      )
      logger.info({ outcome: 'started', queueItemId: claim.item.id }, 'Playback start finished')
      return 'started'
    } finally {
      this.startingGuilds.delete(guildId)
    }
  }

  hasActivePlayback(guildId: string): boolean {
    const session = this.sessions.get(guildId)
    return session?.current !== undefined || session?.settling === true
  }

  activeAttemptIds(): string[] {
    return [...this.sessions.values()].flatMap((session) =>
      session.current ? [session.current.playbackAttemptId] : [],
    )
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
    this.stopAsSkipped(session, current)
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
      this.stopAsSkipped(session, currentItem)
      this.updateActivity(guildId)
      if (desired.currentQueueItemId) {
        const nextPlaybackAttemptId = randomUUID()
        const claim = await this.api.claimPlayback(nextPlaybackAttemptId)
        if (claim.item) {
          await this.playItem(
            guildId,
            session,
            claim.item,
            0,
            claim.playbackAttemptId ?? nextPlaybackAttemptId,
          )
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

  destroyGuild(
    guildId: string,
    reason: 'PLAYBACK_CANCELLED' | 'VOICE_DISCONNECTED' | 'BOT_SHUTDOWN' = 'PLAYBACK_CANCELLED',
  ): void {
    this.startingGuilds.delete(guildId)
    const session = this.sessions.get(guildId)
    if (!session) {
      return
    }
    const current = session.current
    session.settling = true
    current?.abortController.abort()
    if (current) {
      void this.reportAttempt({
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: reason === 'VOICE_DISCONNECTED' ? 'failed' : 'cancelled',
        terminal: true,
        failureStage: 'player',
        failureClass: reason === 'VOICE_DISCONNECTED' ? 'player' : 'intentional',
        errorCode: reason,
        sourceProvider: current.provider,
        sourceIdentifier: current.sourceIdentifier,
      })
    }
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
      this.destroyGuild(guildId, 'BOT_SHUTDOWN')
    }
  }

  private stopAsSkipped(session: PlaybackSession, current?: CurrentPlayback): void {
    if (current) {
      void this.reportAttempt({
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: 'skipped',
        terminal: true,
        failureStage: 'player',
        failureClass: 'intentional',
        errorCode: 'PLAYBACK_SKIPPED',
        sourceProvider: current.provider,
        sourceIdentifier: current.sourceIdentifier,
      })
    }
    session.settling = true
    current?.abortController.abort()
    session.current = undefined
    session.player.stop(true)
    session.settling = false
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
      void this.handlePlayerError(guildId, session, error).catch((recoveryError: unknown) => {
        this.logger.error(
          {
            operation: 'audio_player.recovery',
            guildId,
            outcome: 'failed',
            err: new AggregateError([error, recoveryError], 'Audio player recovery failed', {
              cause: recoveryError,
            }),
          },
          'Audio player recovery failed',
        )
      })
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
      provider: 'youtube_music',
    }
    session.current = current
    const logger = playbackLogger(this.logger, {
      event: 'playback',
      guildId,
      voiceChannelId: this.voiceManager.getChannelId(guildId),
      queueItemId: item.id,
      playbackAttemptId,
      attempt,
      retryCount: retries,
      trackId: item.track.id,
      trackTitle: item.track.title,
      trackArtists: item.track.artists.join(', '),
      trackProvider: item.track.provider,
    })
    {
      void this.reportAttempt({
        queueItemId: item.id,
        playbackAttemptId,
        attempt,
        outcome: 'pending',
        terminal: false,
        sourceProvider: current.provider,
      })
    }
    try {
      logger.info(
        { operation: 'source.resolve', outcome: 'started', forceRefresh: retries > 0 },
        'Audio source resolution started',
      )
      const resolveStartedAt = Date.now()
      const resolved = await this.api.resolveSource(item.id, retries > 0, {
        playbackAttemptId,
        attempt,
      })
      if (
        abortController.signal.aborted ||
        this.sessions.get(guildId) !== session ||
        session.current !== current
      ) {
        const error = new SafePlaybackError('SOURCE_FETCH_CANCELLED')
        logger.info(
          {
            operation: 'playback.attempt',
            outcome: 'cancelled',
            errorCode: 'SOURCE_FETCH_CANCELLED',
            err: error,
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
        const error = new SafePlaybackError('SOURCE_FETCH_CANCELLED')
        logger.info(
          {
            operation: 'playback.attempt',
            outcome: 'cancelled',
            errorCode: error.code,
            err: error,
          },
          'Playback attempt cancelled',
        )
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
            err: error,
          },
          'Playback attempt cancelled',
        )
        return
      }
      abortController.abort()
      const classified = classifyPlaybackError(error)
      logger.warn(
        {
          operation: 'playback.attempt',
          outcome: retries < 1 ? 'retrying' : 'failed',
          forceRefresh: retries < 1,
          ...classified,
          failureStage: playbackFailureStage(classified.errorCode, 'resolve'),
          failureClass: playbackFailureClass(classified.errorCode),
          err: error,
        },
        'Playback attempt failed',
      )
      current.failureStage = playbackFailureStage(classified.errorCode, 'resolve')
      current.failureClass = playbackFailureClass(classified.errorCode)
      current.errorCode = classified.errorCode
      if (classified.httpStatus === undefined) delete current.httpStatus
      else current.httpStatus = classified.httpStatus
      await this.reportAttempt({
        queueItemId: item.id,
        playbackAttemptId,
        attempt,
        outcome: 'failed',
        terminal: retries >= 1,
        failureStage: playbackFailureStage(classified.errorCode, 'resolve'),
        failureClass: playbackFailureClass(classified.errorCode),
        errorCode: classified.errorCode,
        ...(classified.httpStatus === undefined ? {} : { httpStatus: classified.httpStatus }),
        sourceProvider: current.provider,
        sourceIdentifier: current.sourceIdentifier,
      })
      if (retries < 1) {
        await this.playItem(guildId, session, item, retries + 1, playbackAttemptId)
        return
      }
      await this.advancePlayback(guildId, session, current, 'failed')
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
        const error = new SafePlaybackError('PREMATURE_IDLE')
        current.failureStage = 'player'
        current.failureClass = 'player'
        current.errorCode = error.code
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
            err: error,
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
      void this.advancePlayback(guildId, session, current, 'played')
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
        failureStage: 'player',
        failureClass: 'player',
        err: error,
      },
      'Audio player error',
    )
    current.failureStage = 'player'
    current.failureClass = 'player'
    current.errorCode = 'PLAYER_ERROR'
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
    await this.reportAttempt({
      queueItemId: current.item.id,
      playbackAttemptId: current.playbackAttemptId,
      attempt: current.retries + 1,
      outcome: 'failed',
      terminal: current.retries >= 1,
      sourceProvider: current.provider,
      failureStage: current.failureStage,
      failureClass: current.failureClass,
      errorCode: current.errorCode,
    })
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
    await this.advancePlayback(guildId, session, current, 'failed')
  }

  private async advancePlayback(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
    outcome: 'played' | 'failed',
  ): Promise<void> {
    const nextPlaybackAttemptId = randomUUID()
    session.settling = true
    session.current = undefined
    try {
      const result = await deliverPlayback(
        'playback.complete',
        {
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          attempt: current.retries + 1,
        },
        () =>
          this.api.completePlayback({
            queueItemId: current.item.id,
            outcome,
            playbackAttemptId: current.playbackAttemptId,
            attempt: current.retries + 1,
            retryCount: current.retries,
            ...(current.provider === undefined ? {} : { sourceProvider: current.provider }),
            ...(current.sourceIdentifier === undefined
              ? {}
              : { sourceIdentifier: current.sourceIdentifier }),
            ...(outcome === 'played' || current.failureStage === undefined
              ? {}
              : { failureStage: current.failureStage }),
            ...(outcome === 'played' || current.failureClass === undefined
              ? {}
              : { failureClass: current.failureClass }),
            ...(outcome === 'played' || current.errorCode === undefined
              ? {}
              : { errorCode: current.errorCode }),
            ...(outcome === 'played' || current.httpStatus === undefined
              ? {}
              : { httpStatus: current.httpStatus }),
            nextPlaybackAttemptId,
          }),
        this.logger,
      )
      this.logger.info(
        {
          operation: 'playback.complete',
          guildId,
          queueItemId: current.item.id,
          playbackAttemptId: current.playbackAttemptId,
          outcome,
          nextQueueItemId: result.nextItem?.id,
        },
        outcome === 'played' ? 'Playback completion synchronized' : 'Playback failure synchronized',
      )
      void this.sendPlaybackEvent(
        outcome === 'played' ? 'playback.finished' : 'playback.failed',
        guildId,
        current.item.id,
      )
      session.settling = false
      if (result.nextItem && this.sessions.get(guildId) === session && !session.current) {
        await this.playItem(
          guildId,
          session,
          result.nextItem,
          0,
          result.nextPlaybackAttemptId ?? nextPlaybackAttemptId,
        )
      } else {
        this.updateActivity(guildId)
      }
    } catch (error) {
      session.settling = false
      const classified = classifyPlaybackError(error)
      await this.reportAttempt({
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: 'failed',
        terminal: true,
        failureStage: 'sync',
        failureClass: 'sync',
        errorCode: 'PLAYBACK_SYNC_FAILED',
        sourceProvider: current.provider,
      })
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
        outcome === 'played' ? 'Playback completion sync failed' : 'Playback failure sync failed',
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
      .catch((error: unknown) => {
        this.logger.error(
          {
            operation: 'playback.event',
            guildId,
            queueItemId,
            eventType: type,
            outcome: 'sync_failed',
            errorCode: 'PLAYBACK_SYNC_FAILED',
            err: error,
          },
          'Playback event sync failed',
        )
      })
  }
}
