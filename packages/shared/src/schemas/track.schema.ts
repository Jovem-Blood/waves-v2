import { z } from 'zod'

const requiredTextSchema = z.string().trim().min(1)
const optionalTextSchema = requiredTextSchema.optional()
const optionalUrlSchema = z.url().optional()

export const trackProviderSchema = z.literal('spotify')

export const trackMetadataSchema = z
  .object({
    id: requiredTextSchema,
    provider: trackProviderSchema,
    providerTrackId: requiredTextSchema,
    title: requiredTextSchema,
    artists: z.array(requiredTextSchema).min(1),
    albumName: optionalTextSchema,
    durationMs: z.number().int().nonnegative(),
    coverUrl: optionalUrlSchema,
    externalUrl: optionalUrlSchema,
    isrc: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i)
      .optional(),
  })
  .strict()
