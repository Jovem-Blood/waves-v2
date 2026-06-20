import { z } from 'zod'

export const audioSourceProviderSchema = z.literal('audius')

export const resolvedAudioSourceSchema = z
  .object({
    provider: audioSourceProviderSchema,
    sourceIdentifier: z.string().trim().min(1),
    streamUrl: z.url({ protocol: /^https?$/ }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const queueItemAudioSourceSchema = z
  .object({
    queueItemId: z.string().trim().min(1),
    source: resolvedAudioSourceSchema,
  })
  .strict()

export const resolveAudioSourceInputSchema = z
  .object({
    forceRefresh: z.boolean().optional().default(false),
  })
  .strict()
