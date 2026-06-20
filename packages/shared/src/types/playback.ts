import type { z } from 'zod'

import type {
  completePlaybackInputSchema,
  playbackClaimResultSchema,
  playbackOutcomeSchema,
  playbackTransitionResultSchema,
} from '../schemas/playback.schema.js'

export type PlaybackOutcome = z.infer<typeof playbackOutcomeSchema>
export type CompletePlaybackInput = z.infer<typeof completePlaybackInputSchema>
export type PlaybackClaimResult = z.infer<typeof playbackClaimResultSchema>
export type PlaybackTransitionResult = z.infer<typeof playbackTransitionResultSchema>
