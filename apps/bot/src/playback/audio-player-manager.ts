import { randomUUID } from 'node:crypto'

import type {
  AudioSourceProvider,
  PlaybackAttemptReport,
  PlaybackTransitionResult,
  QueueItem,
} from '@waves/shared'
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
import { CrossfadeMixer, type PcmPlaybackSource } from './crossfade-mixer.js'
import {
  defaultPlaybackRuntime,
  type DecodedAudioStream,
  type PlaybackRuntime,
} from './playback-runtime.js'
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
  startedAt: number
  resolutionDurationMs?: number
  fetchLatencyMs?: number
  timeToFirstAudioMs?: number
  playbackDurationMs?: number
  resource?: { playbackDuration: number }
}

interface PlaybackSession {
  player: AudioPlayer
  current: CurrentPlayback | undefined
  settling: boolean
  crossfade: CrossfadeMixer | undefined
  prepared: CurrentPlayback | undefined
  preparing: Promise<void> | undefined
  crossfadeTransition: Promise<void> | undefined
  fadingOut: CurrentPlayback | undefined
  crossfadeEnabled: boolean
}

export interface CrossfadeOptions {
  durationMs: number
  preloadMs: number
}

const MIN_SUCCESSFUL_PLAYBACK_MS = 1_000
const DEFAULT_CROSSFADE_OPTIONS: CrossfadeOptions = { durationMs: 5_000, preloadMs: 12_000 }

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
    private readonly crossfadeOptions: CrossfadeOptions = DEFAULT_CROSSFADE_OPTIONS,
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

  private timingFields(current: CurrentPlayback, failed: boolean) {
    const playbackDurationMs = current.resource?.playbackDuration ?? current.playbackDurationMs
    return {
      durationMs: Math.max(0, Date.now() - current.startedAt),
      resolutionDurationMs: current.resolutionDurationMs,
      fetchLatencyMs: current.fetchLatencyMs,
      timeToFirstAudioMs: current.timeToFirstAudioMs,
      expectedDurationMs: current.item.track.durationMs,
      playbackDurationMs,
      ...(failed && playbackDurationMs !== undefined
        ? { progressAtFailureMs: playbackDurationMs }
        : {}),
    }
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
    this.applyCrossfadeSetting(session, desired.crossfadeEnabled)

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
      (session.crossfade?.getPlaybackDuration(session.current.item.id) ??
        state.resource.playbackDuration) -
        desired.progressMs >=
        1_000
    ) {
      await this.api.updateProgress(
        session.current.item.id,
        session.crossfade?.getPlaybackDuration(session.current.item.id) ??
          state.resource.playbackDuration,
      )
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
    this.destroyCrossfade(session)
    current?.abortController.abort()
    if (current) {
      void this.reportAttempt({
        queueItemId: current.item.id,
        ...this.timingFields(current, reason === 'VOICE_DISCONNECTED'),
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
        ...this.timingFields(current, false),
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
    this.destroyCrossfade(session)
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
    const session: PlaybackSession = {
      player,
      current: undefined,
      settling: false,
      crossfade: undefined,
      prepared: undefined,
      preparing: undefined,
      crossfadeTransition: undefined,
      fadingOut: undefined,
      crossfadeEnabled: false,
    }
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
      startedAt: Date.now(),
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
      current.resolutionDurationMs = Date.now() - resolveStartedAt
      current.sourceIdentifier = resolved.source.sourceIdentifier
      const desiredPlayer = await this.api.getPlayer()
      this.applyCrossfadeSetting(session, desiredPlayer.crossfadeEnabled)
      const fetchStartedAt = Date.now()
      if (this.canCrossfade(item, session.crossfadeEnabled)) {
        const decoded = await this.runtime.createDecodedStream!(resolved.source.streamUrl, {
          logger,
          playbackAttemptId,
          provider: resolved.source.provider,
          sourceIdentifier: resolved.source.sourceIdentifier,
          attempt,
          signal: abortController.signal,
        })
        current.fetchLatencyMs = Date.now() - fetchStartedAt
        if (abortController.signal.aborted || session.current !== current) {
          decoded.dispose()
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
        this.startCrossfadeResource(guildId, session, current, decoded, desiredPlayer.volume)
        return
      }
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
      current.fetchLatencyMs = Date.now() - fetchStartedAt
      current.resource = resource
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
      resource.volume?.setVolume(desiredPlayer.volume / 100)
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
      if (current.resolutionDurationMs === undefined)
        current.resolutionDurationMs = Date.now() - current.startedAt
      else
        current.fetchLatencyMs ??= Math.max(
          0,
          Date.now() - current.startedAt - current.resolutionDurationMs,
        )
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
        ...this.timingFields(current, true),
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
      if (this.sessions.get(guildId) !== session || session.current !== current) return
      if (retries < 1) {
        await this.playItem(guildId, session, item, retries + 1, playbackAttemptId)
        return
      }
      await this.advancePlayback(guildId, session, current, 'failed')
    }
  }

  private canCrossfade(item: QueueItem, enabled: boolean): boolean {
    return (
      enabled &&
      item.track.durationMs > this.crossfadeOptions.durationMs * 2 &&
      this.runtime.createDecodedStream !== undefined &&
      this.runtime.createPcmResource !== undefined
    )
  }

  private startCrossfadeResource(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
    decoded: DecodedAudioStream,
    volume: number,
  ): void {
    const source = this.toPcmSource(current, decoded)
    const mixer = new CrossfadeMixer(source, {
      crossfadeDurationMs: this.crossfadeOptions.durationMs,
      preloadMs: this.crossfadeOptions.preloadMs,
      onPreloadRequired: (trackId) => this.requestCrossfadePreparation(guildId, session, trackId),
      onCrossfadeRequired: (trackId, playbackDurationMs) =>
        this.requestCrossfadeTransition(guildId, session, trackId, playbackDurationMs),
      onSourceEnded: (trackId, playbackDurationMs) => {
        void this.handleCrossfadeSourceEnd(guildId, session, trackId, playbackDurationMs)
      },
      onCrossfadeCompleted: (outgoingTrackId) => {
        if (session.fadingOut?.item.id !== outgoingTrackId) return
        session.fadingOut.abortController.abort()
        session.fadingOut = undefined
      },
    })
    session.crossfade = mixer
    const resource = this.runtime.createPcmResource!(mixer, current.item.id)
    this.logger.info(
      {
        operation: 'audio_player.play',
        outcome: 'submitted',
        guildId,
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        provider: current.provider,
        sourceIdentifier: current.sourceIdentifier,
        crossfadeDurationMs: this.crossfadeOptions.durationMs,
      },
      'Crossfade audio resource submitted to player',
    )
    session.player.play(resource)
    resource.volume?.setVolume(volume / 100)
    this.updateActivity(guildId, current.item)
  }

  private toPcmSource(current: CurrentPlayback, decoded: DecodedAudioStream): PcmPlaybackSource {
    return {
      id: current.item.id,
      expectedDurationMs: current.item.track.durationMs,
      stream: decoded.stream,
      dispose: () => decoded.dispose(),
    }
  }

  private requestCrossfadePreparation(
    guildId: string,
    session: PlaybackSession,
    outgoingTrackId: string,
  ): void {
    if (
      session.current?.item.id !== outgoingTrackId ||
      !session.crossfadeEnabled ||
      session.prepared ||
      session.preparing ||
      !session.crossfade
    ) {
      return
    }
    const preparation = this.prepareCrossfade(guildId, session, outgoingTrackId)
    session.preparing = preparation
    void preparation.finally(() => {
      if (session.preparing === preparation) session.preparing = undefined
    })
  }

  private async prepareCrossfade(
    guildId: string,
    session: PlaybackSession,
    outgoingTrackId: string,
  ): Promise<void> {
    let prepared: CurrentPlayback | undefined
    let decoded: DecodedAudioStream | undefined
    try {
      const queue = await this.api.getQueue()
      const nextItem = queue.find((queueItem) => queueItem.status === 'queued')
      if (
        !nextItem ||
        !this.canCrossfade(nextItem, session.crossfadeEnabled) ||
        session.current?.item.id !== outgoingTrackId ||
        session.crossfade?.currentTrackId !== outgoingTrackId
      ) {
        return
      }

      const playbackAttemptId = randomUUID()
      const abortController = new AbortController()
      prepared = {
        item: nextItem,
        retries: 0,
        playbackAttemptId,
        abortController,
        provider: 'youtube_music',
        startedAt: Date.now(),
      }
      const logger = playbackLogger(this.logger, {
        event: 'playback',
        operation: 'playback.crossfade.prepare',
        guildId,
        voiceChannelId: this.voiceManager.getChannelId(guildId),
        queueItemId: nextItem.id,
        playbackAttemptId,
        attempt: 1,
      })
      const resolveStartedAt = Date.now()
      const resolved = await this.api.resolveSource(nextItem.id, false, {
        playbackAttemptId,
        attempt: 1,
      })
      prepared.provider = resolved.source.provider
      prepared.sourceIdentifier = resolved.source.sourceIdentifier
      prepared.resolutionDurationMs = Date.now() - resolveStartedAt
      const fetchStartedAt = Date.now()
      decoded = await this.runtime.createDecodedStream!(resolved.source.streamUrl, {
        logger,
        playbackAttemptId,
        provider: resolved.source.provider,
        sourceIdentifier: resolved.source.sourceIdentifier,
        attempt: 1,
        signal: abortController.signal,
      })
      prepared.fetchLatencyMs = Date.now() - fetchStartedAt

      if (
        abortController.signal.aborted ||
        !session.crossfadeEnabled ||
        session.current?.item.id !== outgoingTrackId ||
        session.crossfade?.currentTrackId !== outgoingTrackId
      ) {
        decoded.dispose()
        return
      }
      if (!session.crossfade.prepare(this.toPcmSource(prepared, decoded))) return
      decoded = undefined
      session.prepared = prepared
      logger.info(
        {
          outcome: 'prepared',
          outgoingQueueItemId: outgoingTrackId,
          sourceIdentifier: prepared.sourceIdentifier,
        },
        'Next crossfade source prepared',
      )
      if (session.crossfade.isCrossfadeDue(outgoingTrackId)) {
        const playbackDurationMs =
          session.crossfade.getPlaybackDuration(outgoingTrackId) ??
          Math.max(0, prepared.item.track.durationMs - this.crossfadeOptions.durationMs)
        this.requestCrossfadeTransition(guildId, session, outgoingTrackId, playbackDurationMs)
      }
    } catch (error) {
      prepared?.abortController.abort()
      decoded?.dispose()
      this.logger.warn(
        {
          operation: 'playback.crossfade.prepare',
          guildId,
          queueItemId: prepared?.item.id,
          outgoingQueueItemId: outgoingTrackId,
          outcome: 'failed',
          ...classifyPlaybackError(error),
          err: error,
        },
        'Crossfade preparation failed; natural transition remains available',
      )
    }
  }

  private requestCrossfadeTransition(
    guildId: string,
    session: PlaybackSession,
    outgoingTrackId: string,
    playbackDurationMs: number,
  ): void {
    if (
      session.current?.item.id !== outgoingTrackId ||
      !session.crossfadeEnabled ||
      !session.prepared ||
      session.crossfadeTransition ||
      !session.crossfade
    ) {
      return
    }
    const transition = this.commitCrossfade(guildId, session, outgoingTrackId, playbackDurationMs)
    session.crossfadeTransition = transition
    void transition.finally(() => {
      if (session.crossfadeTransition === transition) session.crossfadeTransition = undefined
    })
  }

  private async commitCrossfade(
    guildId: string,
    session: PlaybackSession,
    outgoingTrackId: string,
    playbackDurationMs: number,
  ): Promise<void> {
    const outgoing = session.current
    const prepared = session.prepared
    const mixer = session.crossfade
    if (
      !outgoing ||
      outgoing.item.id !== outgoingTrackId ||
      !prepared ||
      !mixer ||
      !session.crossfadeEnabled
    )
      return

    outgoing.playbackDurationMs = Math.min(
      outgoing.item.track.durationMs,
      playbackDurationMs + this.crossfadeOptions.durationMs,
    )
    try {
      const result = await this.completePlaybackTransition(
        guildId,
        outgoing,
        'played',
        prepared.playbackAttemptId,
      )
      if (!result.nextItem || result.nextItem.id !== prepared.item.id) {
        await this.fallbackFromPreparedTransition(guildId, session, outgoing, prepared, result)
        return
      }

      prepared.item = result.nextItem
      prepared.playbackAttemptId = result.nextPlaybackAttemptId ?? prepared.playbackAttemptId
      prepared.startedAt = Date.now()
      session.prepared = undefined
      session.fadingOut = outgoing
      session.current = prepared
      session.settling = false
      if (!mixer.beginCrossfade(outgoingTrackId, prepared.item.id)) {
        await this.fallbackFromPreparedTransition(guildId, session, outgoing, prepared, result)
        return
      }
      this.markCrossfadeTrackStarted(guildId, prepared)
      this.updateActivity(guildId, prepared.item)
      this.logger.info(
        {
          operation: 'playback.crossfade',
          guildId,
          outgoingQueueItemId: outgoingTrackId,
          queueItemId: prepared.item.id,
          crossfadeDurationMs: this.crossfadeOptions.durationMs,
          outcome: 'started',
        },
        'Crossfade started',
      )
    } catch (error) {
      await this.handleCrossfadeSyncFailure(guildId, session, outgoing, error)
    }
  }

  private markCrossfadeTrackStarted(guildId: string, current: CurrentPlayback): void {
    current.timeToFirstAudioMs = 0
    void this.reportAttempt({
      queueItemId: current.item.id,
      playbackAttemptId: current.playbackAttemptId,
      attempt: current.retries + 1,
      outcome: 'pending',
      terminal: false,
      sourceProvider: current.provider,
      ...this.timingFields(current, false),
    })
    void this.sendPlaybackEvent('playback.started', guildId, current.item.id)
  }

  private async handleCrossfadeSourceEnd(
    guildId: string,
    session: PlaybackSession,
    outgoingTrackId: string,
    playbackDurationMs: number,
  ): Promise<void> {
    await session.crossfadeTransition
    const outgoing = session.current
    const mixer = session.crossfade
    if (!outgoing || outgoing.item.id !== outgoingTrackId || !mixer) return

    outgoing.playbackDurationMs = playbackDurationMs
    const prepared = session.prepared
    const nextPlaybackAttemptId = prepared?.playbackAttemptId ?? randomUUID()
    session.settling = true
    try {
      const result = await this.completePlaybackTransition(
        guildId,
        outgoing,
        'played',
        nextPlaybackAttemptId,
      )
      if (prepared && result.nextItem?.id === prepared.item.id) {
        prepared.item = result.nextItem
        prepared.playbackAttemptId = result.nextPlaybackAttemptId ?? prepared.playbackAttemptId
        prepared.startedAt = Date.now()
        session.prepared = undefined
        session.current = prepared
        session.settling = false
        outgoing.abortController.abort()
        if (!mixer.promotePreparedAfterEnd(outgoingTrackId, prepared.item.id)) {
          await this.fallbackFromPreparedTransition(guildId, session, outgoing, prepared, result)
          return
        }
        this.markCrossfadeTrackStarted(guildId, prepared)
        this.updateActivity(guildId, prepared.item)
        return
      }
      await this.fallbackFromPreparedTransition(guildId, session, outgoing, prepared, result)
    } catch (error) {
      await this.handleCrossfadeSyncFailure(guildId, session, outgoing, error)
    }
  }

  private async fallbackFromPreparedTransition(
    guildId: string,
    session: PlaybackSession,
    outgoing: CurrentPlayback,
    prepared: CurrentPlayback | undefined,
    result: PlaybackTransitionResult,
  ): Promise<void> {
    session.settling = true
    session.current = undefined
    session.prepared = undefined
    prepared?.abortController.abort()
    outgoing.abortController.abort()
    session.crossfade?.discardPrepared(prepared?.item.id ?? '')
    this.destroyCrossfade(session)
    session.player.stop(true)
    session.settling = false

    if (result.nextItem && this.sessions.get(guildId) === session) {
      await this.playItem(
        guildId,
        session,
        result.nextItem,
        0,
        result.nextPlaybackAttemptId ?? randomUUID(),
      )
    } else {
      this.updateActivity(guildId)
    }
  }

  private async handleCrossfadeSyncFailure(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
    error: unknown,
  ): Promise<void> {
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
    session.settling = true
    session.current = undefined
    current.abortController.abort()
    session.prepared?.abortController.abort()
    this.destroyCrossfade(session)
    session.player.stop(true)
    session.settling = false
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
      'Crossfade playback completion sync failed',
    )
  }

  private destroyCrossfade(session: PlaybackSession): void {
    session.prepared?.abortController.abort()
    session.fadingOut?.abortController.abort()
    session.crossfade?.destroy()
    session.crossfade = undefined
    session.prepared = undefined
    session.fadingOut = undefined
  }

  private applyCrossfadeSetting(session: PlaybackSession, enabled: boolean): void {
    if (session.crossfadeEnabled === enabled) return
    session.crossfadeEnabled = enabled
    if (!enabled) {
      session.prepared?.abortController.abort()
      session.prepared = undefined
    }
    session.crossfade?.setEnabled(enabled)
  }

  private handleStateChange(
    guildId: string,
    session: PlaybackSession,
    previousState: AudioPlayerState,
    nextState: AudioPlayerState,
  ): void {
    const current = session.current
    const resourcePlaybackDurationMs =
      previousState.status === AudioPlayerStatus.Playing
        ? previousState.resource.playbackDuration
        : nextState.status === AudioPlayerStatus.Playing
          ? nextState.resource.playbackDuration
          : undefined
    const playbackDurationMs = current
      ? (session.crossfade?.getPlaybackDuration(current.item.id) ?? resourcePlaybackDurationMs)
      : resourcePlaybackDurationMs
    if (current && playbackDurationMs !== undefined) current.playbackDurationMs = playbackDurationMs
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
      current.timeToFirstAudioMs ??= Date.now() - current.startedAt
      void this.reportAttempt({
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: 'pending',
        terminal: false,
        sourceProvider: current.provider,
        ...this.timingFields(current, false),
      })
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

    const classified = classifyPlaybackError(error)
    const errorCode = classified.errorCode === 'UNKNOWN' ? 'PLAYER_ERROR' : classified.errorCode

    this.logger.warn(
      {
        operation: 'audio_player.error',
        guildId,
        queueItemId: current.item.id,
        playbackAttemptId: current.playbackAttemptId,
        attempt: current.retries + 1,
        outcome: current.retries < 1 ? 'refreshing' : 'failing',
        ...classifyPlaybackError(error),
        errorCode,
        failureStage: playbackFailureStage(errorCode, 'player'),
        failureClass: playbackFailureClass(errorCode),
        err: error,
      },
      'Audio player error',
    )
    current.failureStage = playbackFailureStage(errorCode, 'player')
    current.failureClass = playbackFailureClass(errorCode)
    current.errorCode = errorCode
    if (classified.httpStatus !== undefined) current.httpStatus = classified.httpStatus
    await this.retryOrFail(guildId, session, current)
  }

  private async retryOrFail(
    guildId: string,
    session: PlaybackSession,
    current: CurrentPlayback,
  ): Promise<void> {
    session.settling = true
    this.destroyCrossfade(session)
    current.abortController.abort()
    session.current = undefined
    await this.reportAttempt({
      queueItemId: current.item.id,
      ...this.timingFields(current, true),
      playbackAttemptId: current.playbackAttemptId,
      attempt: current.retries + 1,
      outcome: 'failed',
      terminal: current.retries >= 1,
      sourceProvider: current.provider,
      failureStage: current.failureStage,
      failureClass: current.failureClass,
      errorCode: current.errorCode,
    })
    if (this.sessions.get(guildId) !== session || session.current) return
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
    const timings = this.timingFields(current, outcome === 'failed')
    session.settling = true
    session.current = undefined
    try {
      const result = await this.completePlaybackTransition(
        guildId,
        current,
        outcome,
        nextPlaybackAttemptId,
        timings,
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

  private async completePlaybackTransition(
    guildId: string,
    current: CurrentPlayback,
    outcome: 'played' | 'failed',
    nextPlaybackAttemptId: string,
    timings = this.timingFields(current, outcome === 'failed'),
  ): Promise<PlaybackTransitionResult> {
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
          ...timings,
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
    return result
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
