import type { z } from 'zod'

import type {
  completePlaybackInputSchema,
  playbackClaimInputSchema,
  playbackAttemptOutcomeSchema,
  playbackAttemptReportSchema,
  playbackClaimResultSchema,
  playbackFailureClassSchema,
  playbackFailureStageSchema,
  playbackOutcomeSchema,
  playbackTransitionResultSchema,
} from '../schemas/playback.schema.js'

export type PlaybackOutcome = z.infer<typeof playbackOutcomeSchema>
export type PlaybackClaimInput = z.infer<typeof playbackClaimInputSchema>
export type PlaybackAttemptOutcome = z.infer<typeof playbackAttemptOutcomeSchema>
export type PlaybackAttemptReport = z.infer<typeof playbackAttemptReportSchema>
export type PlaybackFailureClass = z.infer<typeof playbackFailureClassSchema>
export type PlaybackFailureStage = z.infer<typeof playbackFailureStageSchema>
export type CompletePlaybackInput = z.infer<typeof completePlaybackInputSchema>
export type PlaybackClaimResult = z.infer<typeof playbackClaimResultSchema>
export type PlaybackTransitionResult = z.infer<typeof playbackTransitionResultSchema>
