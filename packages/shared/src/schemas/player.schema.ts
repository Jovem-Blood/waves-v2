import { z } from 'zod'

const optionalTextSchema = z.string().trim().min(1).optional()

export const playerStatusSchema = z.enum(['idle', 'playing', 'paused', 'stopped'])

export const playerStateSchema = z
  .object({
    status: playerStatusSchema,
    currentQueueItemId: optionalTextSchema,
    voiceChannelId: optionalTextSchema,
    guildId: optionalTextSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
