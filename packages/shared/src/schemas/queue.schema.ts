import { z } from 'zod'

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

export const queueItemSchema = z
  .object({
    id: requiredTextSchema,
    track: trackMetadataSchema,
    requestedByDiscordUserId: optionalTextSchema,
    requestedByDisplayName: optionalTextSchema,
    status: queueItemStatusSchema,
    position: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const queueSchema = z.array(queueItemSchema)

export const addQueueItemInputSchema = z
  .object({
    track: trackMetadataSchema,
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
