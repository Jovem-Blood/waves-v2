import {
  historyCursorSchema,
  historyPageSchema,
  type HistoryCursor,
  type HistoryPage,
  type QueueItem,
} from '@waves/shared'

import type { QueueRepository } from '../repositories/queue.repository'

const PAGE_SIZE = 20

export function decodeHistoryCursor(cursor: string | undefined): HistoryCursor | undefined {
  if (!cursor) return undefined

  return historyCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
}

function encodeHistoryCursor(item: QueueItem): string {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt, id: item.id })).toString(
    'base64url',
  )
}

export class HistoryService {
  constructor(private readonly queueRepository: QueueRepository) {}

  list(cursor?: string): HistoryPage {
    const decodedCursor = decodeHistoryCursor(cursor)
    const items = this.queueRepository.listHistory({
      ...(decodedCursor === undefined ? {} : { cursor: decodedCursor }),
      limit: PAGE_SIZE + 1,
    })
    const hasMore = items.length > PAGE_SIZE
    const pageItems = hasMore ? items.slice(0, PAGE_SIZE) : items
    const finalItem = pageItems.at(-1)

    return historyPageSchema.parse({
      items: pageItems,
      nextCursor: hasMore && finalItem ? encodeHistoryCursor(finalItem) : null,
    })
  }
}
