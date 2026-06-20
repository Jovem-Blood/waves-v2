import {
  completePlaybackInputSchema,
  setPlayerVolumeInputSchema,
  updatePlayerProgressInputSchema,
  type CompletePlaybackInput,
  type PlaybackClaimResult,
  type PlaybackTransitionResult,
  type PlayerState,
  type QueueItem,
  type QueueItemStatus,
} from '@waves/shared'

import type { PlayerStateRepository } from '../repositories/player-state.repository'
import type { UnitOfWork } from '../repositories/unit-of-work'
import { PlaybackConflictError, QueueItemNotFoundError } from './domain-errors'
import { type WavesLogger, useLogger } from '../utils/logger'

export interface SkipResult {
  player: PlayerState
  queue: QueueItem[]
}

export class PlayerStateService {
  constructor(
    private readonly playerStateRepository: PlayerStateRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: WavesLogger = useLogger(),
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
    return this.playerStateRepository.update({
      status: 'paused',
      updatedAt: this.now().toISOString(),
    })
  }

  resume(): PlayerState {
    const player = this.playerStateRepository.get()
    if (player.status !== 'paused' || !player.currentQueueItemId) {
      throw new PlaybackConflictError()
    }
    return this.playerStateRepository.update({
      status: 'playing',
      updatedAt: this.now().toISOString(),
    })
  }

  setVolume(input: { volume: number }): PlayerState {
    const parsed = setPlayerVolumeInputSchema.parse(input)
    return this.playerStateRepository.update({
      volume: parsed.volume,
      updatedAt: this.now().toISOString(),
    })
  }

  updateProgress(input: { queueItemId: string; progressMs: number }): PlayerState {
    const parsed = updatePlayerProgressInputSchema.parse(input)
    const player = this.playerStateRepository.get()
    if (player.currentQueueItemId !== parsed.queueItemId || player.status === 'idle') {
      throw new PlaybackConflictError()
    }
    const current = this.unitOfWork.run(({ queue }) => queue.findById(parsed.queueItemId))
    if (!current) throw new QueueItemNotFoundError(parsed.queueItemId)
    return this.playerStateRepository.update({
      progressMs: Math.min(
        Math.max(player.progressMs, parsed.progressMs),
        current.track.durationMs,
      ),
      updatedAt: this.now().toISOString(),
    })
  }

  voiceConnected(guildId: string, voiceChannelId: string): PlayerState {
    const previous = this.playerStateRepository.get()
    const next = this.playerStateRepository.update({
      status: 'idle',
      currentQueueItemId: null,
      progressMs: 0,
      guildId,
      voiceChannelId,
      updatedAt: this.now().toISOString(),
    })
    this.logPlayerTransition('voice.connected', previous, next, { guildId, voiceChannelId })
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
          voiceChannelId: null,
          updatedAt: timestamp,
        }),
      }
    })
    this.logPlayerTransition('voice.disconnected', result.previous, result.next, { guildId })
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
    return result
  }

  claimPlayback(): PlaybackClaimResult {
    const result = this.unitOfWork.run(({ playerState, queue }) => {
      const player = playerState.get()
      const activeItems = queue.listActive()
      const current = activeItems.find(
        (item) => item.id === player.currentQueueItemId && item.status === 'playing',
      )

      if (current) {
        return { player, item: current }
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

      return {
        player: playerState.update({
          status: 'playing',
          currentQueueItemId: claimed.id,
          progressMs: 0,
          updatedAt: timestamp,
        }),
        item: claimed,
      }
    })
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
    return result
  }

  completePlayback(input: CompletePlaybackInput): PlaybackTransitionResult {
    const parsed = completePlaybackInputSchema.parse(input)
    return this.transitionCurrent(parsed.queueItemId, parsed.outcome)
  }

  private transitionCurrent(
    queueItemId: string,
    outcome: Extract<QueueItemStatus, 'played' | 'failed'>,
  ): PlaybackTransitionResult {
    const result = this.unitOfWork.run(({ playerState, queue }) => {
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

      return {
        completedQueueItemId: queueItemId,
        player: nextPlayer,
        queue: queue.listActive(),
        ...(nextItem === undefined ? {} : { nextItem }),
      }
    })
    this.logger.info(
      {
        operation: 'player.complete',
        queueItemId,
        outcome,
        completedQueueItemId: result.completedQueueItemId,
        promotedQueueItemId: result.nextItem?.id,
        playerStatusTo: result.player.status,
      },
      'Playback queue transition completed',
    )
    return result
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
