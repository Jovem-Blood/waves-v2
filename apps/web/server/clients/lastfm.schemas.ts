import { z } from 'zod'

const lastFmSimilarTrackSchema = z.object({
  name: z.string().trim().min(1),
  match: z.coerce.number().finite().nonnegative(),
  artist: z.object({ name: z.string().trim().min(1) }),
})

export const lastFmSimilarTracksResponseSchema = z.object({
  similartracks: z.object({ track: z.array(lastFmSimilarTrackSchema).default([]) }),
})

export const lastFmErrorResponseSchema = z.object({
  error: z.number().int(),
  message: z.string(),
})

export type LastFmSimilarTrack = z.infer<typeof lastFmSimilarTrackSchema>
