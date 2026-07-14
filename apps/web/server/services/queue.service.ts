import { randomUUID } from 'node:crypto'

import {
  addQueueItemInputSchema,
  moveQueueItemInputSchema,
  type AddQueueItemInput,
  type MoveQueueItemInput,
  type QueueItem,
  type RemoveQueueItemResult,
  type RestoreQueueItemResult,
} from '@waves/shared'

import type { QueueRepository } from '../repositories/queue.repository'
import type { UnitOfWork } from '../repositories/unit-of-work'
import type { RealtimePublisher } from '../utils/realtime-events'
import {
  DuplicateTrackError,
  QueueItemNotFoundError,
  QueueItemNotRemovableError,
  QueueItemNotRestorableError,
  QueueRestoreExpiredError,
} from './domain-errors'

const RESTORE_WINDOW_MS = 10_000
const noopPublish: RealtimePublisher = (event) => ({ id: '0', event })

function isActiveTrackConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      'UNIQUE constraint failed: queue_items.provider, queue_items.provider_track_id',
    )
  )
}

export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = randomUUID,
    private readonly publishRealtime: RealtimePublisher = noopPublish,
  ) {}

  list(): QueueItem[] {
    return this.queueRepository.listActive()
  }

  add(input: AddQueueItemInput): QueueItem {
    const parsed = addQueueItemInputSchema.parse(input)
    try {
      const item = this.unitOfWork.run(({ queue }) => {
        if (queue.findActiveByTrack(parsed.track.provider, parsed.track.providerTrackId)) {
          throw new DuplicateTrackError()
        }

        const activeItems = queue.listActive()
        const placement = parsed.placement ?? 'end'
        const targetPosition =
          placement === 'next' ? (activeItems[0]?.status === 'playing' ? 1 : 0) : activeItems.length
        const timestamp = this.now().toISOString()

        if (targetPosition < activeItems.length) {
          queue.updatePositions(
            activeItems.map((item, index) => ({
              id: item.id,
              position: index >= targetPosition ? index + 1 : index,
              updatedAt: timestamp,
            })),
          )
        }

        const item: QueueItem = {
          id: this.generateId(),
          track: parsed.track,
          ...(parsed.requestedByUserId === undefined
            ? {}
            : { requestedByUserId: parsed.requestedByUserId }),
          ...(parsed.requestedByDiscordUserId === undefined
            ? {}
            : { requestedByDiscordUserId: parsed.requestedByDiscordUserId }),
          ...(parsed.requestedByDisplayName === undefined
            ? {}
            : { requestedByDisplayName: parsed.requestedByDisplayName }),
          status: 'queued',
          position: targetPosition,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        return queue.insert(item)
      })
      this.publishRealtime({
        type: 'queue.updated',
        queue: this.queueRepository.listActive(),
        reason: 'added',
      })
      return item
    } catch (error) {
      if (error instanceof DuplicateTrackError || isActiveTrackConstraintError(error)) {
        throw new DuplicateTrackError()
      }
      throw error
    }
  }

  remove(id: string): RemoveQueueItemResult {
    const result = this.unitOfWork.run(({ queue }) => {
      const item = queue.findById(id)
      if (!item) {
        throw new QueueItemNotFoundError(id)
      }
      if (item.status !== 'queued') {
        throw new QueueItemNotRemovableError(id)
      }

      const now = this.now()
      const timestamp = now.toISOString()
      queue.updateStatusAndPosition(id, {
        status: 'removed',
        position: item.position,
        removedAt: timestamp,
        updatedAt: timestamp,
      })
      const activeItems = queue.listForRecalculation()
      queue.updatePositions(
        activeItems.map((item, position) => ({
          id: item.id,
          position,
          updatedAt: timestamp,
        })),
      )

      return {
        queue: queue.listActive(),
        removal: {
          queueItemId: id,
          expiresAt: new Date(now.getTime() + RESTORE_WINDOW_MS).toISOString(),
        },
      }
    })
    this.publishRealtime({ type: 'queue.updated', queue: result.queue, reason: 'removed' })
    return result
  }

  restore(id: string): RestoreQueueItemResult {
    try {
      const result = this.unitOfWork.run(({ queue }) => {
        const item = queue.findById(id)
        if (!item) throw new QueueItemNotFoundError(id)
        if (item.status !== 'removed') throw new QueueItemNotRestorableError(id)

        const removedAt = queue.getRemovedAt(id)
        if (!removedAt) throw new QueueItemNotRestorableError(id)
        const now = this.now()
        if (now.getTime() - new Date(removedAt).getTime() > RESTORE_WINDOW_MS) {
          throw new QueueRestoreExpiredError(id)
        }
        if (queue.findActiveByTrack(item.track.provider, item.track.providerTrackId)) {
          throw new DuplicateTrackError()
        }

        const activeItems = queue.listActive()
        const playingOffset = activeItems[0]?.status === 'playing' ? 1 : 0
        const targetPosition = Math.max(playingOffset, Math.min(item.position, activeItems.length))
        const timestamp = now.toISOString()

        queue.updatePositions(
          activeItems.map((activeItem, index) => ({
            id: activeItem.id,
            position: index >= targetPosition ? index + 1 : index,
            updatedAt: timestamp,
          })),
        )
        const restoredItem = queue.restore(id, targetPosition, timestamp)
        if (!restoredItem) throw new QueueItemNotFoundError(id)

        return { queue: queue.listActive(), restoredItem }
      })
      this.publishRealtime({ type: 'queue.updated', queue: result.queue, reason: 'restored' })
      return result
    } catch (error) {
      if (error instanceof DuplicateTrackError || isActiveTrackConstraintError(error)) {
        throw new DuplicateTrackError()
      }
      throw error
    }
  }

  move(id: string, input: MoveQueueItemInput): QueueItem[] {
    const { newPosition } = moveQueueItemInputSchema.parse(input)

    const result = this.unitOfWork.run(({ queue }) => {
      const activeItems = queue.listActive()
      const currentIndex = activeItems.findIndex((item) => item.id === id)

      if (currentIndex === -1) {
        throw new QueueItemNotFoundError(id)
      }

      const currentItem = activeItems[currentIndex]
      if (!currentItem || currentItem.status === 'playing') {
        return activeItems
      }

      const playingOffset = activeItems[0]?.status === 'playing' ? 1 : 0
      const targetIndex = Math.max(playingOffset, Math.min(newPosition, activeItems.length - 1))
      if (targetIndex === currentIndex) {
        return activeItems
      }

      const [movedItem] = activeItems.splice(currentIndex, 1)
      if (!movedItem) {
        throw new QueueItemNotFoundError(id)
      }

      activeItems.splice(targetIndex, 0, movedItem)
      const timestamp = this.now().toISOString()
      queue.updatePositions(
        activeItems.map((item, position) => ({
          id: item.id,
          position,
          updatedAt: timestamp,
        })),
      )

      return queue.listActive()
    })
    this.publishRealtime({ type: 'queue.updated', queue: result, reason: 'moved' })
    return result
  }
}
