import { trackMetadataSchema, type TrackMetadata } from '@waves/shared'

import type { SpotifyClientPort } from '../clients/spotify.client'
import { SpotifyInvalidQueryError, SpotifyInvalidResponseError } from '../clients/spotify.errors'
import type { SpotifyTrack } from '../clients/spotify.schemas'

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
