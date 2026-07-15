import { z } from 'zod'

import { publicUserSchema } from './user.schema.js'
import { trackMetadataSchema } from './track.schema.js'

const requiredTextSchema = z.string().trim().min(1)
const optionalTextSchema = requiredTextSchema.optional()

export const queueItemStatusSchema = z.enum([
  'queued',
  'playing',
  'played',
  'skipped',
  'failed',
  'removed',
])

export const queueItemOriginSchema = z.enum(['human', 'autoplay'])

export const queueItemSchema = z
  .object({
    id: requiredTextSchema,
    track: trackMetadataSchema,
    requestedByUserId: optionalTextSchema,
    requestedByUser: publicUserSchema.optional(),
    requestedByDiscordUserId: optionalTextSchema,
    requestedByDisplayName: optionalTextSchema,
    origin: queueItemOriginSchema.default('human'),
    status: queueItemStatusSchema,
    position: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const queueSchema = z.array(queueItemSchema)

export const historyCursorSchema = z
  .object({
    updatedAt: z.iso.datetime({ offset: true }),
    id: requiredTextSchema,
  })
  .strict()

export const historyQuerySchema = z
  .object({
    cursor: requiredTextSchema.optional(),
  })
  .strict()

export const historyPageSchema = z
  .object({
    items: z.array(queueItemSchema),
    nextCursor: requiredTextSchema.nullable(),
  })
  .strict()

export const addQueueItemInputSchema = z
  .object({
    track: trackMetadataSchema,
    requestedByUserId: optionalTextSchema,
    requestedByDiscordUserId: optionalTextSchema,
    requestedByDisplayName: optionalTextSchema,
    placement: z.enum(['end', 'next']).optional(),
  })
  .strict()

export const moveQueueItemInputSchema = z
  .object({
    newPosition: z.number().int().nonnegative(),
  })
  .strict()

export const botPlayInputSchema = z
  .object({
    query: requiredTextSchema,
    requestedByDiscordUserId: requiredTextSchema,
    requestedByDisplayName: requiredTextSchema,
  })
  .strict()

export const queueRemovalReceiptSchema = z
  .object({
    queueItemId: requiredTextSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const removeQueueItemResultSchema = z
  .object({
    queue: queueSchema,
    removal: queueRemovalReceiptSchema,
  })
  .strict()

export const restoreQueueItemResultSchema = z
  .object({
    queue: queueSchema,
    restoredItem: queueItemSchema,
  })
  .strict()
