import type { z } from 'zod'

import type {
  playbackHealthQuerySchema,
  playbackHealthResponseSchema,
} from '../schemas/playback-health.schema.js'

export type PlaybackHealthQuery = z.infer<typeof playbackHealthQuerySchema>
export type PlaybackHealthResponse = z.infer<typeof playbackHealthResponseSchema>
