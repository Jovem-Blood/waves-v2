import type { SpotifyConfig } from '../utils/spotify-config'
import {
  SpotifyAuthenticationError,
  SpotifyInvalidResponseError,
  SpotifyUnavailableError,
} from './spotify.errors'
import {
  spotifySearchResponseSchema,
  spotifyTokenResponseSchema,
  type SpotifyTrack,
} from './spotify.schemas'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SEARCH_URL = 'https://api.spotify.com/v1/search'

export type SpotifyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface SpotifyAccessToken {
  accessToken: string
  expiresInSeconds: number
}

export interface SpotifyClientPort {
  requestAccessToken(): Promise<SpotifyAccessToken>
  searchTracks(query: string, accessToken: string, limit?: number): Promise<SpotifyTrack[]>
}

async function readJson(
  response: Response,
  operation: 'authenticate' | 'search',
): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new SpotifyInvalidResponseError(operation)
  }
}

export class SpotifyClient implements SpotifyClientPort {
  constructor(
    private readonly config: SpotifyConfig,
    private readonly request: SpotifyFetch = fetch,
  ) {}

  async requestAccessToken(): Promise<SpotifyAccessToken> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      'utf8',
    ).toString('base64')
    let response: Response

    try {
      response = await this.request(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
      })
    } catch {
      throw new SpotifyUnavailableError('authenticate')
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new SpotifyAuthenticationError()
      }

      throw new SpotifyUnavailableError('authenticate')
    }

    const result = spotifyTokenResponseSchema.safeParse(await readJson(response, 'authenticate'))
    if (!result.success) {
      throw new SpotifyInvalidResponseError('authenticate')
    }

    return {
      accessToken: result.data.access_token,
      expiresInSeconds: result.data.expires_in,
    }
  }

  async searchTracks(query: string, accessToken: string, limit = 10): Promise<SpotifyTrack[]> {
    const url = new URL(SEARCH_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('type', 'track')
    url.searchParams.set('limit', String(limit))
    let response: Response

    try {
      response = await this.request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch {
      throw new SpotifyUnavailableError('search')
    }

    if (!response.ok) {
      throw new SpotifyUnavailableError('search')
    }

    const result = spotifySearchResponseSchema.safeParse(await readJson(response, 'search'))
    if (!result.success) {
      throw new SpotifyInvalidResponseError('search')
    }

    return result.data.tracks.items
  }
}
