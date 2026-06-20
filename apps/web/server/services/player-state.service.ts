import {
  completePlaybackInputSchema,
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

export interface SkipResult {
  player: PlayerState
  queue: QueueItem[]
}

export class PlayerStateService {
  constructor(
    private readonly playerStateRepository: PlayerStateRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): PlayerState {
    return this.playerStateRepository.get()
  }

  voiceConnected(guildId: string, voiceChannelId: string): PlayerState {
    return this.playerStateRepository.update({
      status: 'idle',
      currentQueueItemId: null,
      guildId,
      voiceChannelId,
      updatedAt: this.now().toISOString(),
    })
  }

  voiceDisconnected(guildId: string): PlayerState {
    const player = this.playerStateRepository.get()
    if (player.guildId !== guildId) {
      return player
    }

    return this.playerStateRepository.update({
      status: 'idle',
      currentQueueItemId: null,
      guildId: null,
      voiceChannelId: null,
      updatedAt: this.now().toISOString(),
    })
  }

  skip(): SkipResult {
    return this.unitOfWork.run(({ playerState, queue }) => {
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
          updatedAt: timestamp,
        }),
        queue: queue.listActive(),
      }
    })
  }

  claimPlayback(): PlaybackClaimResult {
    return this.unitOfWork.run(({ playerState, queue }) => {
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
          updatedAt: timestamp,
        }),
        item: claimed,
      }
    })
  }

  completePlayback(input: CompletePlaybackInput): PlaybackTransitionResult {
    const parsed = completePlaybackInputSchema.parse(input)
    return this.transitionCurrent(parsed.queueItemId, parsed.outcome)
  }

  private transitionCurrent(
    queueItemId: string,
    outcome: Extract<QueueItemStatus, 'played' | 'failed'>,
  ): PlaybackTransitionResult {
    return this.unitOfWork.run(({ playerState, queue }) => {
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
        updatedAt: timestamp,
      })

      return {
        completedQueueItemId: queueItemId,
        player: nextPlayer,
        queue: queue.listActive(),
        ...(nextItem === undefined ? {} : { nextItem }),
      }
    })
  }
}
