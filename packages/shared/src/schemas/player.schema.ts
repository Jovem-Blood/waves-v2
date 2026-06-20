import { z } from 'zod'

const optionalTextSchema = z.string().trim().min(1).optional()

export const playerStatusSchema = z.enum(['idle', 'playing', 'paused', 'stopped'])
export const playerVolumeSchema = z.number().int().min(0).max(100)
export const playerProgressSchema = z.number().int().nonnegative()

export const playerStateSchema = z
  .object({
    status: playerStatusSchema,
    currentQueueItemId: optionalTextSchema,
    voiceChannelId: optionalTextSchema,
    guildId: optionalTextSchema,
    volume: playerVolumeSchema.default(100),
    progressMs: playerProgressSchema.default(0),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const setPlayerVolumeInputSchema = z.strictObject({ volume: playerVolumeSchema })
export const updatePlayerProgressInputSchema = z.strictObject({
  queueItemId: z.string().trim().min(1),
  progressMs: playerProgressSchema,
})
