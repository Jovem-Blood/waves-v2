import { z } from 'zod'
import { trackMetadataSchema } from './track.schema.js'
import { queueSchema } from './queue.schema.js'

export const spotifyPlaylistUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        url.hostname === 'open.spotify.com' &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^\/(?:intl-[a-z-]+\/)?playlist\/[A-Za-z0-9]{22}\/?$/.test(url.pathname)
      )
    } catch {
      return false
    }
  }, 'Cole um link válido de playlist do Spotify.')

export const playlistInputSchema = z.strictObject({ url: spotifyPlaylistUrlSchema })
export const playlistSkippedItemSchema = z.strictObject({
  position: z.number().int().positive(),
  title: z.string(),
  reason: z.enum(['unavailable', 'local', 'unsupported', 'invalid', 'duplicate']),
})
export const playlistPreviewSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  coverUrl: z.url().optional(),
  total: z.number().int().nonnegative(),
  tracks: z.array(trackMetadataSchema).max(5),
  skipped: z.array(playlistSkippedItemSchema),
})
export const playlistImportResultSchema = z.strictObject({
  queue: queueSchema,
  imported: z.number().int().nonnegative(),
  skipped: z.array(playlistSkippedItemSchema),
})
export const clearQueueResultSchema = z.strictObject({
  queue: queueSchema,
  cleared: z.number().int().nonnegative(),
})

export type PlaylistPreview = z.infer<typeof playlistPreviewSchema>
export type PlaylistSkippedItem = z.infer<typeof playlistSkippedItemSchema>
export type PlaylistImportResult = z.infer<typeof playlistImportResultSchema>
