import type { TrackMetadata } from '@waves/shared'

import type { LastFmConfig } from '../utils/lastfm-config'
import { LastFmInvalidResponseError, LastFmUnavailableError } from './lastfm.errors'
import {
  lastFmErrorResponseSchema,
  lastFmArtistInfoResponseSchema,
  lastFmArtistTopTracksResponseSchema,
  lastFmSimilarTracksResponseSchema,
  lastFmSimilarTagsResponseSchema,
  lastFmTagTopTracksResponseSchema,
  type LastFmArtistInfo,
  type LastFmSimilarTag,
  type LastFmSimilarTrack,
  type LastFmTopTrack,
} from './lastfm.schemas'

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/'
const DEFAULT_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 15 * 60 * 1000

export type LastFmFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface LastFmClientPort {
  getSimilarTracks(seed: TrackMetadata, limit?: number): Promise<LastFmSimilarTrack[]>
  getArtistInfo(artist: string): Promise<LastFmArtistInfo>
  getArtistTopTracks(artist: string, limit?: number): Promise<LastFmTopTrack[]>
  getSimilarTags(tag: string): Promise<LastFmSimilarTag[]>
  getTagTopTracks(tag: string, limit?: number): Promise<LastFmTopTrack[]>
}

interface CacheEntry {
  expiresAt: number
  value: unknown
}

export class LastFmClient implements LastFmClientPort {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly config: LastFmConfig,
    private readonly request: LastFmFetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async getSimilarTracks(seed: TrackMetadata, limit = 10): Promise<LastFmSimilarTrack[]> {
    const artist = seed.artists[0]
    if (!artist) return []
    const body = await this.get('track.getSimilar', {
      artist,
      track: seed.title,
      autocorrect: '1',
      limit: String(limit),
    })
    const parsed = lastFmSimilarTracksResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.similartracks.track
  }

  async getArtistInfo(artist: string): Promise<LastFmArtistInfo> {
    const body = await this.get('artist.getInfo', { artist, autocorrect: '1' })
    const parsed = lastFmArtistInfoResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.artist
  }

  async getArtistTopTracks(artist: string, limit = 4): Promise<LastFmTopTrack[]> {
    const body = await this.get('artist.getTopTracks', {
      artist,
      autocorrect: '1',
      limit: String(limit),
    })
    const parsed = lastFmArtistTopTracksResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.toptracks.track.map((track) => ({ ...track, artist: { name: artist } }))
  }

  async getSimilarTags(tag: string): Promise<LastFmSimilarTag[]> {
    const body = await this.get('tag.getSimilar', { tag })
    const parsed = lastFmSimilarTagsResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.similartags.tag
  }

  async getTagTopTracks(tag: string, limit = 10): Promise<LastFmTopTrack[]> {
    const body = await this.get('tag.getTopTracks', { tag, limit: String(limit) })
    const parsed = lastFmTagTopTracksResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.tracks.track
  }

  private async get(method: string, params: Readonly<Record<string, string>>): Promise<unknown> {
    const cacheKey = `${method}:${JSON.stringify(params)}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > this.now()) return cached.value

    const url = new URL(LASTFM_API_URL)
    url.searchParams.set('method', method)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    url.searchParams.set('api_key', this.config.apiKey)
    url.searchParams.set('format', 'json')

    let response: Response
    try {
      response = await this.request(url, { signal: AbortSignal.timeout(this.timeoutMs) })
    } catch (error) {
      throw new LastFmUnavailableError(undefined, { cause: error })
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      throw new LastFmInvalidResponseError({ cause: error })
    }
    if (!response.ok || lastFmErrorResponseSchema.safeParse(body).success) {
      throw new LastFmUnavailableError(response.status)
    }
    this.cache.set(cacheKey, { value: body, expiresAt: this.now() + CACHE_TTL_MS })
    return body
  }
}
