import type { TrackMetadata } from '@waves/shared'

import type { LastFmConfig } from '../utils/lastfm-config'
import { LastFmInvalidResponseError, LastFmUnavailableError } from './lastfm.errors'
import {
  lastFmErrorResponseSchema,
  lastFmSimilarTracksResponseSchema,
  type LastFmSimilarTrack,
} from './lastfm.schemas'

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/'
const DEFAULT_TIMEOUT_MS = 10_000

export type LastFmFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface LastFmClientPort {
  getSimilarTracks(seed: TrackMetadata, limit?: number): Promise<LastFmSimilarTrack[]>
}

export class LastFmClient implements LastFmClientPort {
  constructor(
    private readonly config: LastFmConfig,
    private readonly request: LastFmFetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async getSimilarTracks(seed: TrackMetadata, limit = 10): Promise<LastFmSimilarTrack[]> {
    const artist = seed.artists[0]
    if (!artist) return []
    const url = new URL(LASTFM_API_URL)
    url.searchParams.set('method', 'track.getSimilar')
    url.searchParams.set('artist', artist)
    url.searchParams.set('track', seed.title)
    url.searchParams.set('api_key', this.config.apiKey)
    url.searchParams.set('autocorrect', '1')
    url.searchParams.set('limit', String(limit))
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

    const apiError = lastFmErrorResponseSchema.safeParse(body)
    if (!response.ok || apiError.success) {
      throw new LastFmUnavailableError(response.status)
    }
    const parsed = lastFmSimilarTracksResponseSchema.safeParse(body)
    if (!parsed.success) throw new LastFmInvalidResponseError({ cause: parsed.error })
    return parsed.data.similartracks.track
  }
}
