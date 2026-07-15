import { z } from 'zod'

const lastFmSimilarTrackSchema = z.object({
  name: z.string().trim().min(1),
  match: z.coerce.number().finite().nonnegative(),
  artist: z.object({ name: z.string().trim().min(1) }),
})

export const lastFmSimilarTracksResponseSchema = z.object({
  similartracks: z.object({ track: z.array(lastFmSimilarTrackSchema).default([]) }),
})

const lastFmNamedArtistSchema = z.object({
  name: z.string().trim().min(1),
})

const lastFmNamedTagSchema = z.object({
  name: z.string().trim().min(1),
})

const lastFmTopTrackSchema = z.object({
  name: z.string().trim().min(1),
  playcount: z.coerce.number().finite().nonnegative().optional(),
  artist: lastFmNamedArtistSchema.optional(),
})

export const lastFmArtistInfoResponseSchema = z.object({
  artist: z.object({
    name: z.string().trim().min(1),
    similar: z.object({ artist: z.array(lastFmNamedArtistSchema).default([]) }).optional(),
    tags: z.object({ tag: z.array(lastFmNamedTagSchema).default([]) }).optional(),
  }),
})

export const lastFmArtistTopTracksResponseSchema = z.object({
  toptracks: z.object({ track: z.array(lastFmTopTrackSchema).default([]) }),
})

export const lastFmSimilarTagsResponseSchema = z.object({
  similartags: z.object({ tag: z.array(lastFmNamedTagSchema).default([]) }),
})

export const lastFmTagTopTracksResponseSchema = z.object({
  tracks: z.object({ track: z.array(lastFmTopTrackSchema).default([]) }),
})

export const lastFmErrorResponseSchema = z.object({
  error: z.number().int(),
  message: z.string(),
})

export type LastFmSimilarTrack = z.infer<typeof lastFmSimilarTrackSchema>
export type LastFmArtistInfo = z.infer<typeof lastFmArtistInfoResponseSchema>['artist']
export type LastFmTopTrack = z.infer<typeof lastFmTopTrackSchema>
export type LastFmSimilarTag = z.infer<typeof lastFmNamedTagSchema>
