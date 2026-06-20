import { z } from 'zod'

import { playerStateSchema } from './player.schema.js'
import { queueItemSchema, queueSchema } from './queue.schema.js'

export const playbackOutcomeSchema = z.enum(['played', 'failed'])

export const completePlaybackInputSchema = z
  .object({
    queueItemId: z.string().trim().min(1),
    outcome: playbackOutcomeSchema,
  })
  .strict()

export const playbackClaimResultSchema = z
  .object({
    player: playerStateSchema,
    item: queueItemSchema.optional(),
  })
  .strict()

export const playbackTransitionResultSchema = z
  .object({
    completedQueueItemId: z.string().trim().min(1),
    player: playerStateSchema,
    queue: queueSchema,
    nextItem: queueItemSchema.optional(),
  })
  .strict()
