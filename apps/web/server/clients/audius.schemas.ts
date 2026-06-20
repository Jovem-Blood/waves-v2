import { z } from 'zod'

const audiusStreamSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
})

export const audiusTrackSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  duration: z.number().int().positive(),
  is_stream_gated: z.boolean().optional().default(false),
  stream: audiusStreamSchema.optional(),
  user: z.object({
    name: z.string().trim().min(1),
  }),
})

export const audiusSearchResponseSchema = z.object({
  data: z.array(audiusTrackSchema),
})

export type AudiusTrack = z.infer<typeof audiusTrackSchema>
