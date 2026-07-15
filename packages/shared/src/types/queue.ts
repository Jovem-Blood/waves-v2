import type { z } from 'zod'

import type {
  addQueueItemInputSchema,
  botPlayInputSchema,
  historyCursorSchema,
  historyPageSchema,
  historyQuerySchema,
  moveQueueItemInputSchema,
  queueRemovalReceiptSchema,
  removeQueueItemResultSchema,
  restoreQueueItemResultSchema,
  queueItemSchema,
  queueItemOriginSchema,
  queueItemStatusSchema,
  queueSchema,
} from '../schemas/queue.schema.js'

export type QueueItemStatus = z.infer<typeof queueItemStatusSchema>
export type QueueItemOrigin = z.infer<typeof queueItemOriginSchema>
export type QueueItem = z.infer<typeof queueItemSchema>
export type Queue = z.infer<typeof queueSchema>
export type HistoryCursor = z.infer<typeof historyCursorSchema>
export type HistoryQuery = z.infer<typeof historyQuerySchema>
export type HistoryPage = z.infer<typeof historyPageSchema>
export type AddQueueItemInput = z.infer<typeof addQueueItemInputSchema>
export type MoveQueueItemInput = z.infer<typeof moveQueueItemInputSchema>
export type BotPlayInput = z.infer<typeof botPlayInputSchema>
export type QueueRemovalReceipt = z.infer<typeof queueRemovalReceiptSchema>
export type RemoveQueueItemResult = z.infer<typeof removeQueueItemResultSchema>
export type RestoreQueueItemResult = z.infer<typeof restoreQueueItemResultSchema>
