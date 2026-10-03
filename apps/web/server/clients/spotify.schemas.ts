import { z } from 'zod'

export const spotifyTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().trim().toLowerCase().pipe(z.literal('bearer')),
  expires_in: z.number().int().positive(),
})

const spotifyImageSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  height: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().nonnegative().nullable().optional(),
})

const spotifyArtistSchema = z.object({
  name: z.string().trim().min(1),
})

export const spotifyTrackSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  artists: z.array(spotifyArtistSchema).min(1),
  album: z.object({
    name: z.string().trim().min(1).optional(),
    images: z.array(spotifyImageSchema).optional().default([]),
  }),
  duration_ms: z.number().int().nonnegative(),
  external_urls: z
    .object({
      spotify: z.url({ protocol: /^https?$/ }).optional(),
    })
    .optional(),
  external_ids: z
    .object({
      isrc: z.string().trim().min(1).optional(),
    })
    .optional(),
})

export const spotifySearchResponseSchema = z.object({
  tracks: z.object({
    items: z.array(spotifyTrackSchema),
  }),
})

export type SpotifyTrack = z.infer<typeof spotifyTrackSchema>

export const spotifyPlaylistPageSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative().max(10000),
  next: z.string().nullable(),
})

export const spotifyPlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  owner: z.object({ display_name: z.string().nullable().optional(), id: z.string() }),
  images: z.array(spotifyImageSchema).nullish(),
  items: spotifyPlaylistPageSchema.optional(),
  tracks: spotifyPlaylistPageSchema.optional(),
})

export type SpotifyPlaylist = z.infer<typeof spotifyPlaylistSchema>

export const spotifyPlaylistEntrySchema = z.object({
  is_local: z.boolean().optional(),
  track: z.unknown().optional(),
  item: z.unknown().optional(),
})

export const spotifyPlaylistItemSummarySchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  is_local: z.boolean().optional(),
  is_playable: z.boolean().optional(),
})
