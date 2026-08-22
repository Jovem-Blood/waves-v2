import {
  completePlaybackInputSchema,
  playbackAttemptReportSchema,
  setPlayerVolumeInputSchema,
  updatePlayerProgressInputSchema,
  type CompletePlaybackInput,
  type PlaybackAttemptReport,
  type PlaybackClaimResult,
  type PlaybackTransitionResult,
  type PlayerState,
  type QueueItem,
} from '@waves/shared'

import type { PlayerStateRepository } from '../repositories/player-state.repository'
import type { UnitOfWork } from '../repositories/unit-of-work'
import { PlaybackConflictError, QueueItemNotFoundError } from './domain-errors'
import { type WavesLogger, useLogger } from '../utils/logger'
import type { RealtimePublisher } from '../utils/realtime-events'
import { randomUUID } from 'node:crypto'
import { RECENT_PLAYED_LIMIT } from './autoplay-exclusions'

export interface SkipResult {
  player: PlayerState
  queue: QueueItem[]
}

const noopPublish: RealtimePublisher = (event) => ({ id: '0', event })

export class PlayerStateService {
  constructor(
    private readonly playerStateRepository: PlayerStateRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: WavesLogger = useLogger(),
    private readonly generateId: () => string = randomUUID,
    private readonly publishRealtime: RealtimePublisher = noopPublish,
  ) {}

  get(): PlayerState {
    return this.playerStateRepository.get()
  }

  pause(): PlayerState {
    const player = this.playerStateRepository.get()
    if (player.status === 'paused') return player
    if (player.status !== 'playing' || !player.currentQueueItemId) {
      throw new PlaybackConflictError()
    }
    const next = this.playerStateRepository.update({
      status: 'paused',
      updatedAt: this.now().toISOString(),
    })
    this.publishPlayerUpdated(next)
    return next
  }

  resume(): PlayerState {
    const player = this.playerStateRepository.get()
    if (player.status !== 'paused' || !player.currentQueueItemId) {
      throw new PlaybackConflictError()
    }
    const next = this.playerStateRepository.update({
      status: 'playing',
      updatedAt: this.now().toISOString(),
    })
    this.publishPlayerUpdated(next)
    return next
  }

  setVolume(input: { volume: number }): PlayerState {
    const parsed = setPlayerVolumeInputSchema.parse(input)
    const next = this.playerStateRepository.update({
      volume: parsed.volume,
      updatedAt: this.now().toISOString(),
    })
    this.publishPlayerUpdated(next)
    return next
  }

  updateProgress(input: { queueItemId: string; progressMs: number }): PlayerState {
    const parsed = updatePlayerProgressInputSchema.parse(input)
    const player = this.playerStateRepository.get()
    if (player.currentQueueItemId !== parsed.queueItemId || player.status === 'idle') {
      throw new PlaybackConflictError()
    }
    const current = this.unitOfWork.run(({ queue }) => queue.findById(parsed.queueItemId))
    if (!current) throw new QueueItemNotFoundError(parsed.queueItemId)
    const next = this.playerStateRepository.update({
      progressMs: Math.min(
        Math.max(player.progressMs, parsed.progressMs),
        current.track.durationMs,
      ),
      updatedAt: this.now().toISOString(),
    })
    this.publishPlayerUpdated(next)
    return next
  }

  voiceConnected(
    guildId: string,
    guildName: string,
    voiceChannelId: string,
    voiceChannelName: string,
  ): PlayerState {
    const previous = this.playerStateRepository.get()
    const next = this.playerStateRepository.update({
      status: 'idle',
      currentQueueItemId: null,
      progressMs: 0,
      guildId,
      guildName,
      voiceChannelId,
      voiceChannelName,
      updatedAt: this.now().toISOString(),
    })
    this.logPlayerTransition('voice.connected', previous, next, { guildId, voiceChannelId })
    this.publishPlayerUpdated(next)
    return next
  }

  voiceDisconnected(guildId: string): PlayerState {
    const result = this.unitOfWork.run(({ playerState, queue }) => {
      const player = playerState.get()
      if (player.guildId && player.guildId !== guildId) {
        return { previous: player, next: player }
      }

      const timestamp = this.now().toISOString()
      const currentItem =
        queue.listActive().find((item) => item.id === player.currentQueueItemId) ??
        queue.listActive().find((item) => item.status === 'playing')

      if (currentItem?.status === 'playing') {
        queue.updateStatusAndPosition(currentItem.id, {
          status: 'queued',
          position: currentItem.position,
          updatedAt: timestamp,
        })
      }

      return {
        previous: player,
        next: playerState.update({
          status: 'idle',
          currentQueueItemId: null,
          progressMs: 0,
          guildId: null,
          guildName: null,
          voiceChannelId: null,
          voiceChannelName: null,
          updatedAt: timestamp,
        }),
      }
    })
    this.logPlayerTransition('voice.disconnected', result.previous, result.next, { guildId })
    if (result.previous.updatedAt !== result.next.updatedAt) {
      this.publishPlayerUpdated(result.next)
      this.publishQueueUpdated(this.listActiveQueue(), 'voice_changed')
    }
    return result.next
  }

  skip(): SkipResult {
    const result = this.unitOfWork.run(({ playerState, queue }) => {
      const player = playerState.get()
      const activeItems = queue.listActive()
      const currentItem =
        activeItems.find((item) => item.id === player.currentQueueItemId) ?? activeItems[0]
      const timestamp = this.now().toISOString()

      if (!currentItem) {
        return {
          player: playerState.update({
            status: 'idle',
            currentQueueItemId: null,
            progressMs: 0,
            updatedAt: timestamp,
          }),
          queue: [],
        }
      }

      queue.updateStatusAndPosition(currentItem.id, {
        status: 'skipped',
        position: currentItem.position,
        updatedAt: timestamp,
      })

      const remainingItems = queue.listForRecalculation()
      queue.updatePositions(
        remainingItems.map((item, position) => ({
          id: item.id,
          position,
          updatedAt: timestamp,
        })),
      )

      const nextItem = queue.listActive()[0]
      if (!nextItem) {
        return {
          player: playerState.update({
            status: 'idle',
            currentQueueItemId: null,
            updatedAt: timestamp,
          }),
          queue: [],
        }
      }

      queue.updateStatusAndPosition(nextItem.id, {
        status: 'playing',
        position: nextItem.position,
        updatedAt: timestamp,
      })

      return {
        player: playerState.update({
          status: 'playing',
          currentQueueItemId: nextItem.id,
          progressMs: 0,
          updatedAt: timestamp,
        }),
        queue: queue.listActive(),
      }
    })
    this.logger.info(
      {
        operation: 'player.skip',
        outcome: 'skipped',
        playerStatusTo: result.player.status,
        queueItemId: result.player.currentQueueItemId,
        promotedQueueItemId: result.queue[0]?.id,
      },
      'Player skip transition completed',
    )
    this.publishPlayerUpdated(result.player)
    this.publishQueueUpdated(result.queue, 'player_transition')
    return result
  }

  claimPlayback(input: { playbackAttemptId?: string } = {}): PlaybackClaimResult {
    const result = this.unitOfWork.run(({ playerState, queue, playbackAttempt }) => {
      const player = playerState.get()
      const activeItems = queue.listActive()
      const current = activeItems.find(
        (item) => item.id === player.currentQueueItemId && item.status === 'playing',
      )

      if (current) {
        const existing = playbackAttempt.findLatestForQueueItem(current.id)
        return {
          player,
          item: current,
          ...(existing
            ? { playbackAttemptId: existing.playbackAttemptId, attempt: existing.attemptNumber }
            : {}),
        }
      }

      const nextItem = activeItems[0]
      const timestamp = this.now().toISOString()
      if (!nextItem || !player.guildId || !player.voiceChannelId) {
        return {
          player: playerState.update({
            status: 'idle',
            currentQueueItemId: null,
            progressMs: 0,
            updatedAt: timestamp,
          }),
        }
      }

      const claimed = queue.updateStatusAndPosition(nextItem.id, {
        status: 'playing',
        position: nextItem.position,
        updatedAt: timestamp,
      })
      if (!claimed) {
        throw new Error('Claimed queue item was not persisted')
      }

      const playbackAttemptId = input.playbackAttemptId ?? this.generateId()
      try {
        playbackAttempt.start({
          playbackAttemptId,
          attemptNumber: 1,
          queueItem: claimed,
          startedAt: timestamp,
        })
      } catch {
        this.logger.error(
          {
            event: 'playback',
            operation: 'telemetry.attempt',
            outcome: 'failed',
            failureClass: 'internal',
            errorCode: 'PLAYBACK_TELEMETRY_FAILED',
            queueItemId: claimed.id,
          },
          'Playback telemetry start failed',
        )
      }

      return {
        player: playerState.update({
          status: 'playing',
          currentQueueItemId: claimed.id,
          progressMs: 0,
          updatedAt: timestamp,
        }),
        item: claimed,
        playbackAttemptId,
        attempt: 1,
      }
    }) as PlaybackClaimResult
    this.logger.info(
      {
        operation: 'player.claim',
        guildId: result.player.guildId,
        voiceChannelId: result.player.voiceChannelId,
        queueItemId: result.item?.id,
        playerStatusTo: result.player.status,
        outcome: result.item ? 'claimed' : 'empty',
      },
      'Playback claim transition completed',
    )
    this.publishPlayerUpdated(result.player)
    this.publishQueueUpdated(this.listActiveQueue(), 'player_transition')
    return result
  }

  completePlayback(input: CompletePlaybackInput): PlaybackTransitionResult {
    const parsed = completePlaybackInputSchema.parse(input)
    return this.transitionCurrent(parsed)
  }

  promoteAutoplaySuggestion(expectedSeedFingerprint: string): PlaybackClaimResult {
    const result = this.unitOfWork.run(({ autoplay, autoplaySuggestion, playerState, queue }) => {
      const state = autoplay.get()
      const suggestion = autoplaySuggestion.list()[0]
      const active = queue.listActive()
      const recentIds = new Set(
        queue.listRecentPlayed(RECENT_PLAYED_LIMIT).map((item) => item.track.providerTrackId),
      )
      if (
        !state.enabled ||
        active.length > 0 ||
        !suggestion ||
        suggestion.seedFingerprint !== expectedSeedFingerprint ||
        recentIds.has(suggestion.track.providerTrackId) ||
        queue.findActiveByTrack(suggestion.track.provider, suggestion.track.providerTrackId)
      ) {
        if (suggestion && suggestion.seedFingerprint !== expectedSeedFingerprint) {
          autoplaySuggestion.clear()
        }
        return { player: playerState.get() }
      }

      const player = playerState.get()
      if (!player.guildId || !player.voiceChannelId) return { player }
      const timestamp = this.now().toISOString()
      const item = queue.insert({
        id: this.generateId(),
        track: suggestion.track,
        requestedByDisplayName: 'Autoplay',
        origin: 'autoplay',
        status: 'playing',
        position: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      autoplaySuggestion.removeByProviderTrackId(suggestion.track.providerTrackId)
      autoplaySuggestion.compactPositions()
      const result = {
        item,
        player: playerState.update({
          status: 'playing',
          currentQueueItemId: item.id,
          progressMs: 0,
          updatedAt: timestamp,
        }),
      }
      return result
    })
    if ('item' in result && result.item) {
      this.publishPlayerUpdated(result.player)
      this.publishQueueUpdated(this.listActiveQueue(), 'player_transition')
    }
    return result
  }

  private transitionCurrent(input: CompletePlaybackInput): PlaybackTransitionResult {
    const queueItemId = input.queueItemId
    const outcome = input.outcome
    const parsed = input
    const result = this.unitOfWork.run(({ playerState, queue, playbackAttempt }) => {
      const timestamp = this.now().toISOString()
      const player = playerState.get()
      const current = queue.findById(queueItemId)

      if (!current) {
        throw new QueueItemNotFoundError(queueItemId)
      }

      if (
        current.status !== 'played' &&
        current.status !== 'failed' &&
        player.currentQueueItemId !== queueItemId
      ) {
        throw new PlaybackConflictError()
      }

      if (current?.status === 'playing') {
        if (parsed.playbackAttemptId && parsed.attempt) {
          try {
            const attemptReport = {
              queueItemId,
              playbackAttemptId: parsed.playbackAttemptId,
              attempt: parsed.attempt,
              outcome: parsed.outcome,
              terminal: true,
              ...(parsed.retryCount === undefined ? {} : { retryCount: parsed.retryCount }),
              ...(parsed.trackId === undefined ? {} : { trackId: parsed.trackId }),
              ...(parsed.trackTitle === undefined ? {} : { trackTitle: parsed.trackTitle }),
              ...(parsed.trackArtists === undefined ? {} : { trackArtists: parsed.trackArtists }),
              ...(parsed.trackProvider === undefined
                ? {}
                : { trackProvider: parsed.trackProvider }),
              ...(parsed.sourceProvider === undefined
                ? {}
                : { sourceProvider: parsed.sourceProvider }),
              ...(parsed.sourceIdentifier === undefined
                ? {}
                : { sourceIdentifier: parsed.sourceIdentifier }),
              ...(parsed.failureStage === undefined ? {} : { failureStage: parsed.failureStage }),
              ...(parsed.failureClass === undefined ? {} : { failureClass: parsed.failureClass }),
              ...(parsed.errorCode === undefined ? {} : { errorCode: parsed.errorCode }),
              ...(parsed.httpStatus === undefined ? {} : { httpStatus: parsed.httpStatus }),
              ...(parsed.durationMs === undefined ? {} : { durationMs: parsed.durationMs }),
              ...(parsed.playbackDurationMs === undefined
                ? {}
                : { playbackDurationMs: parsed.playbackDurationMs }),
            }
            playbackAttempt.report(
              playbackAttemptReportSchema.parse(attemptReport),
              current,
              timestamp,
            )
          } catch {
            this.logger.error(
              {
                event: 'playback',
                operation: 'telemetry.attempt',
                outcome: 'failed',
                failureClass: 'internal',
                errorCode: 'PLAYBACK_TELEMETRY_FAILED',
                queueItemId,
                playbackAttemptId: parsed.playbackAttemptId,
                attempt: parsed.attempt,
              },
              'Playback telemetry result failed',
            )
          }
        }
        queue.updateStatusAndPosition(current.id, {
          status: outcome,
          position: current.position,
          updatedAt: timestamp,
        })
      }

      const remainingItems = queue.listForRecalculation()
      queue.updatePositions(
        remainingItems.map((item, position) => ({
          id: item.id,
          position,
          updatedAt: timestamp,
        })),
      )

      const nextCandidate = queue.listActive()[0]
      const nextItem = nextCandidate
        ? queue.updateStatusAndPosition(nextCandidate.id, {
            status: 'playing',
            position: nextCandidate.position,
            updatedAt: timestamp,
          })
        : undefined
      const nextPlayer = playerState.update({
        status: nextItem ? 'playing' : 'idle',
        currentQueueItemId: nextItem?.id ?? null,
        progressMs: 0,
        updatedAt: timestamp,
      })

      const nextPlaybackAttemptId = nextItem
        ? (parsed.nextPlaybackAttemptId ?? this.generateId())
        : undefined
      if (nextItem && nextPlaybackAttemptId) {
        try {
          playbackAttempt.start({
            playbackAttemptId: nextPlaybackAttemptId,
            attemptNumber: 1,
            queueItem: nextItem,
            startedAt: timestamp,
          })
        } catch {
          this.logger.error(
            {
              event: 'playback',
              operation: 'telemetry.attempt',
              outcome: 'failed',
              failureClass: 'internal',
              errorCode: 'PLAYBACK_TELEMETRY_FAILED',
              queueItemId: nextItem.id,
              playbackAttemptId: nextPlaybackAttemptId,
              attempt: 1,
            },
            'Next playback telemetry start failed',
          )
        }
      }

      return {
        completedQueueItemId: queueItemId,
        player: nextPlayer,
        queue: queue.listActive(),
        ...(nextItem === undefined ? {} : { nextItem }),
        ...(nextPlaybackAttemptId === undefined ? {} : { nextPlaybackAttemptId }),
      }
    })
    this.logger.info(
      {
        event: 'playback',
        operation: 'player.transition',
        queueItemId,
        outcome,
        completedQueueItemId: result.completedQueueItemId,
        promotedQueueItemId: result.nextItem?.id,
        playerStatusTo: result.player.status,
      },
      'Playback queue transition completed',
    )
    const completedItem = this.unitOfWork.run(({ queue }) => queue.findById(queueItemId))
    this.logger[outcome === 'failed' ? 'error' : 'info'](
      {
        event: 'playback',
        operation: 'playback.result',
        outcome,
        terminal: true,
        queueItemId,
        ...(parsed.playbackAttemptId === undefined
          ? {}
          : { playbackAttemptId: parsed.playbackAttemptId }),
        ...(parsed.attempt === undefined ? {} : { attempt: parsed.attempt }),
        ...(parsed.retryCount === undefined ? {} : { retryCount: parsed.retryCount }),
        ...(completedItem
          ? {
              trackId: completedItem.track.id,
              trackTitle: completedItem.track.title,
              trackArtists: completedItem.track.artists.join(', '),
              trackProvider: completedItem.track.provider,
            }
          : {}),
        ...(parsed.sourceProvider === undefined ? {} : { sourceProvider: parsed.sourceProvider }),
        ...(parsed.sourceIdentifier === undefined
          ? {}
          : { sourceIdentifier: parsed.sourceIdentifier }),
        ...(parsed.failureStage === undefined ? {} : { failureStage: parsed.failureStage }),
        ...(parsed.failureClass === undefined ? {} : { failureClass: parsed.failureClass }),
        ...(parsed.errorCode === undefined ? {} : { errorCode: parsed.errorCode }),
        ...(parsed.httpStatus === undefined ? {} : { httpStatus: parsed.httpStatus }),
        ...(parsed.durationMs === undefined ? {} : { durationMs: parsed.durationMs }),
        ...(parsed.playbackDurationMs === undefined
          ? {}
          : { playbackDurationMs: parsed.playbackDurationMs }),
      },
      outcome === 'failed' ? 'Playback failed' : 'Playback completed',
    )
    if (outcome === 'failed') {
      const failedItem = this.unitOfWork.run(({ queue }) => queue.findById(queueItemId))
      if (failedItem) {
        this.publishRealtime({
          type: 'queue.item_failed',
          item: failedItem,
          queue: result.queue,
        })
      }
    }
    this.publishPlayerUpdated(result.player)
    this.publishQueueUpdated(result.queue, 'player_transition')
    return result
  }

  reportPlaybackAttempt(input: PlaybackAttemptReport): void {
    const parsed = playbackAttemptReportSchema.parse(input)
    try {
      const result = this.unitOfWork.run(({ queue, playbackAttempt }) => {
        const item = queue.findById(parsed.queueItemId)
        if (!item) throw new QueueItemNotFoundError(parsed.queueItemId)
        const existing = playbackAttempt.find(parsed.playbackAttemptId, parsed.attempt)
        const record = playbackAttempt.report(parsed, item, this.now().toISOString())
        return { item, record, shouldLog: parsed.terminal && !existing?.terminal }
      })
      if (result.shouldLog) {
        this.logger[parsed.outcome === 'failed' ? 'error' : 'info'](
          {
            event: 'playback',
            operation: 'playback.result',
            outcome: parsed.outcome,
            terminal: true,
            queueItemId: parsed.queueItemId,
            playbackAttemptId: parsed.playbackAttemptId,
            attempt: parsed.attempt,
            trackId: result.item.track.id,
            trackTitle: result.item.track.title,
            trackArtists: result.item.track.artists.join(', '),
            trackProvider: result.item.track.provider,
            ...(result.record.sourceProvider === null
              ? {}
              : { sourceProvider: result.record.sourceProvider }),
            ...(result.record.sourceIdentifier === null
              ? {}
              : { sourceIdentifier: result.record.sourceIdentifier }),
            ...(result.record.failureStage === null
              ? {}
              : { failureStage: result.record.failureStage }),
            ...(result.record.failureClass === null
              ? {}
              : { failureClass: result.record.failureClass }),
            ...(result.record.errorCode === null ? {} : { errorCode: result.record.errorCode }),
            ...(result.record.httpStatus === null ? {} : { httpStatus: result.record.httpStatus }),
            ...(result.record.durationMs === null ? {} : { durationMs: result.record.durationMs }),
            ...(result.record.playbackDurationMs === null
              ? {}
              : { playbackDurationMs: result.record.playbackDurationMs }),
          },
          'Playback result',
        )
      }
    } catch (error) {
      this.logger.error(
        {
          event: 'playback',
          operation: 'telemetry.attempt',
          outcome: 'failed',
          failureClass: 'internal',
          errorCode: 'PLAYBACK_TELEMETRY_FAILED',
          queueItemId: parsed.queueItemId,
          playbackAttemptId: parsed.playbackAttemptId,
          attempt: parsed.attempt,
        },
        'Playback attempt telemetry failed',
      )
      void error
    }
  }

  private publishPlayerUpdated(player: PlayerState): void {
    this.publishRealtime({ type: 'player.updated', player })
  }

  private publishQueueUpdated(queue: QueueItem[], reason: 'player_transition' | 'voice_changed') {
    this.publishRealtime({ type: 'queue.updated', queue, reason })
  }

  private listActiveQueue(): QueueItem[] {
    return this.unitOfWork.run(({ queue }) => queue.listActive())
  }

  private logPlayerTransition(
    operation: string,
    previous: PlayerState,
    next: PlayerState,
    context: Record<string, unknown>,
  ): void {
    this.logger.info(
      {
        service: 'web',
        operation,
        ...context,
        playerStatusFrom: previous.status,
        playerStatusTo: next.status,
        queueItemId: next.currentQueueItemId,
        outcome: 'completed',
      },
      'Player state transitioned',
    )
  }
}
