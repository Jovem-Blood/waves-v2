import { z } from 'zod'

import { trackMetadataSchema } from './track.schema.js'

export const autoplayFailureCodeSchema = z.enum([
  'spotify_unavailable',
  'invalid_response',
  'recommendation_unavailable',
  'metadata_unavailable',
  'no_seeds',
  'no_candidates',
])

export const autoplaySuggestionSchema = z
  .object({
    track: trackMetadataSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    provider: z.literal('spotify'),
    seedFingerprint: z.string().min(1),
  })
  .strict()

export const autoplayStateSchema = z
  .object({
    enabled: z.boolean(),
    failureCode: autoplayFailureCodeSchema.nullable(),
    suggestion: autoplaySuggestionSchema.nullable().default(null),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const updateAutoplayInputSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict()

export const rejectAutoplaySuggestionInputSchema = z.object({}).strict()
