import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'TRACK_NOT_FOUND',
  'DUPLICATE_TRACK',
  'QUEUE_ITEM_NOT_FOUND',
  'QUEUE_ITEM_NOT_REMOVABLE',
  'QUEUE_ITEM_NOT_RESTORABLE',
  'QUEUE_RESTORE_EXPIRED',
  'SOURCE_NOT_FOUND',
  'SOURCE_UNAVAILABLE',
  'PLAYBACK_CONFLICT',
  'SPOTIFY_UNAVAILABLE',
  'INTERNAL_ERROR',
])

export const apiErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    statusMessage: z.string().trim().min(1),
    data: z
      .object({
        code: apiErrorCodeSchema,
        details: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
