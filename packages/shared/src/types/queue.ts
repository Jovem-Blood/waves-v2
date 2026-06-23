import type { z } from 'zod'

import type {
  addQueueItemInputSchema,
  botPlayInputSchema,
  moveQueueItemInputSchema,
  queueRemovalReceiptSchema,
  removeQueueItemResultSchema,
  restoreQueueItemResultSchema,
  queueItemSchema,
  queueItemStatusSchema,
  queueSchema,
} from '../schemas/queue.schema.js'

export type QueueItemStatus = z.infer<typeof queueItemStatusSchema>
export type QueueItem = z.infer<typeof queueItemSchema>
export type Queue = z.infer<typeof queueSchema>
export type AddQueueItemInput = z.infer<typeof addQueueItemInputSchema>
export type MoveQueueItemInput = z.infer<typeof moveQueueItemInputSchema>
export type BotPlayInput = z.infer<typeof botPlayInputSchema>
export type QueueRemovalReceipt = z.infer<typeof queueRemovalReceiptSchema>
export type RemoveQueueItemResult = z.infer<typeof removeQueueItemResultSchema>
export type RestoreQueueItemResult = z.infer<typeof restoreQueueItemResultSchema>
