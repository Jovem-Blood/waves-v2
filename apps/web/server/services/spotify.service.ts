import {
  spotifyPlaylistUrlSchema,
  trackMetadataSchema,
  type PlaylistPreview,
  type PlaylistSkippedItem,
  type TrackMetadata,
} from '@waves/shared'

import type { SpotifyClientPort } from '../clients/spotify.client'
import {
  SpotifyInvalidQueryError,
  SpotifyInvalidResponseError,
  SpotifyPlaylistInaccessibleError,
} from '../clients/spotify.errors'
import {
  spotifyTrackSchema,
  spotifyPlaylistEntrySchema,
  spotifyPlaylistItemSummarySchema,
  type SpotifyTrack,
} from '../clients/spotify.schemas'

interface CachedSpotifyToken {
  accessToken: string
  expiresAt: number
}

interface SpotifyServiceOptions {
  tokenRefreshMarginMs?: number
  searchLimit?: number
}

function normalizeTrack(track: SpotifyTrack): TrackMetadata {
  const coverUrl = track.album.images[0]?.url
  const externalUrl = track.external_urls?.spotify
  const isrc = track.external_ids?.isrc

  const result = trackMetadataSchema.safeParse({
    id: `spotify:${track.id}`,
    provider: 'spotify',
    providerTrackId: track.id,
    title: track.name,
    artists: track.artists.map(({ name }) => name),
    ...(track.album.name === undefined ? {} : { albumName: track.album.name }),
    durationMs: track.duration_ms,
    ...(coverUrl === undefined ? {} : { coverUrl }),
    ...(externalUrl === undefined ? {} : { externalUrl }),
    ...(isrc === undefined ? {} : { isrc }),
  })

  if (!result.success) {
    throw new SpotifyInvalidResponseError('search')
  }

  return result.data
}

export class SpotifyService {
  private token: CachedSpotifyToken | undefined
  private readonly tokenRefreshMarginMs: number
  private readonly searchLimit: number

  constructor(
    private readonly client: SpotifyClientPort,
    private readonly now: () => number = Date.now,
    options: SpotifyServiceOptions = {},
  ) {
    this.tokenRefreshMarginMs = options.tokenRefreshMarginMs ?? 60_000
    this.searchLimit = options.searchLimit ?? 10
  }

  async searchTracks(query: string): Promise<TrackMetadata[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      throw new SpotifyInvalidQueryError()
    }

    const accessToken = await this.getAccessToken()
    const tracks = await this.client.searchTracks(normalizedQuery, accessToken, this.searchLimit)

    return tracks.map(normalizeTrack)
  }

  async getPlaylist(url: string, full = false) {
    const parsedUrl = new URL(spotifyPlaylistUrlSchema.parse(url))
    const id = parsedUrl.pathname.split('/').filter(Boolean).at(-1)!
    const playlist = await this.client.getPlaylist(id, await this.getAccessToken(), full)
    const page = playlist.items ?? playlist.tracks
    if (!page) throw new SpotifyPlaylistInaccessibleError()
    const tracks: { position: number; track: TrackMetadata }[] = []
    const skipped: PlaylistSkippedItem[] = []
    const entries = full ? page.items : page.items.slice(0, 5)
    for (const [index, raw] of entries.entries()) {
      const position = index + 1
      const entry = spotifyPlaylistEntrySchema.safeParse(raw)
      const item = entry.success ? (entry.data.item ?? entry.data.track) : undefined
      const metadata = spotifyPlaylistItemSummarySchema.safeParse(item)
      const title = metadata.success
        ? (metadata.data.name ?? `Faixa ${position}`)
        : `Faixa ${position}`
      let reason: PlaylistSkippedItem['reason'] | undefined
      if (!item) reason = 'unavailable'
      else if (
        (entry.success && entry.data.is_local) ||
        (metadata.success && metadata.data.is_local)
      )
        reason = 'local'
      else if (metadata.success && metadata.data.type && metadata.data.type !== 'track')
        reason = 'unsupported'
      else if (metadata.success && metadata.data.is_playable === false) reason = 'unavailable'
      const parsed = spotifyTrackSchema.safeParse(item)
      if (!reason && !parsed.success) reason = 'invalid'
      if (reason) skipped.push({ position, title, reason })
      else if (parsed.success) {
        try {
          tracks.push({ position, track: normalizeTrack(parsed.data) })
        } catch {
          skipped.push({ position, title, reason: 'invalid' })
        }
      }
    }
    const coverUrl = playlist.images?.[0]?.url
    const preview: PlaylistPreview = {
      id: playlist.id,
      name: playlist.name,
      owner: playlist.owner.display_name ?? playlist.owner.id,
      ...(coverUrl ? { coverUrl } : {}),
      total: page.total,
      tracks: tracks.slice(0, 5).map(({ track }) => track),
      skipped,
    }
    return { preview, tracks, skipped }
  }

  private async getAccessToken(): Promise<string> {
    const now = this.now()
    if (this.token && now < this.token.expiresAt - this.tokenRefreshMarginMs) {
      return this.token.accessToken
    }

    const token = await this.client.requestAccessToken()
    this.token = {
      accessToken: token.accessToken,
      expiresAt: now + token.expiresInSeconds * 1000,
    }

    return token.accessToken
  }
}
