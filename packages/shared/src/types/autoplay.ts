import type { z } from 'zod'

import type {
  autoplayFailureCodeSchema,
  autoplaySuggestionStrategySchema,
  autoplaySuggestionSchema,
  autoplayStateSchema,
  rejectAutoplaySuggestionInputSchema,
  updateAutoplayInputSchema,
} from '../schemas/autoplay.schema.js'

export type AutoplayFailureCode = z.infer<typeof autoplayFailureCodeSchema>
export type AutoplaySuggestionStrategy = z.infer<typeof autoplaySuggestionStrategySchema>
export type AutoplayState = z.infer<typeof autoplayStateSchema>
export type UpdateAutoplayInput = z.infer<typeof updateAutoplayInputSchema>
export type RejectAutoplaySuggestionInput = z.infer<typeof rejectAutoplaySuggestionInputSchema>
export type AutoplaySuggestion = z.infer<typeof autoplaySuggestionSchema>
