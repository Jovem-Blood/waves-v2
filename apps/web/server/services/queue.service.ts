import {
  addQueueItemInputSchema,
  moveQueueItemInputSchema,
  type AddQueueItemInput,
  type MoveQueueItemInput,
  type QueueItem,
} from '@waves/shared'

import type { QueueRepository } from '../repositories/queue.repository'
import type { UnitOfWork } from '../repositories/unit-of-work'
import { QueueItemNotFoundError } from './domain-errors'

export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  list(): QueueItem[] {
    return this.queueRepository.listActive()
  }

  add(input: AddQueueItemInput): QueueItem {
    const parsed = addQueueItemInputSchema.parse(input)
    const timestamp = this.now().toISOString()
    const item: QueueItem = {
      id: this.generateId(),
      track: parsed.track,
      ...(parsed.requestedByDiscordUserId === undefined
        ? {}
        : { requestedByDiscordUserId: parsed.requestedByDiscordUserId }),
      ...(parsed.requestedByDisplayName === undefined
        ? {}
        : { requestedByDisplayName: parsed.requestedByDisplayName }),
      status: 'queued',
      position: this.queueRepository.listActive().length,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    return this.queueRepository.insert(item)
  }

  remove(id: string): QueueItem[] {
    return this.unitOfWork.run(({ queue }) => {
      if (!queue.findById(id)) {
        throw new QueueItemNotFoundError(id)
      }

      queue.delete(id)
      const timestamp = this.now().toISOString()
      const activeItems = queue.listForRecalculation()
      queue.updatePositions(
        activeItems.map((item, position) => ({
          id: item.id,
          position,
          updatedAt: timestamp,
        })),
      )

      return queue.listActive()
    })
  }

  move(id: string, input: MoveQueueItemInput): QueueItem[] {
    const { newPosition } = moveQueueItemInputSchema.parse(input)

    return this.unitOfWork.run(({ queue }) => {
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
  }
}
