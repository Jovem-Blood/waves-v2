import type { SpotifyConfig } from '../utils/spotify-config'
import { parseExternalHttpTimeout } from '../utils/external-http-config'
import {
  SpotifyAuthenticationError,
  SpotifyInvalidResponseError,
  SpotifyUnavailableError,
  SpotifyPlaylistInaccessibleError,
} from './spotify.errors'
import {
  spotifySearchResponseSchema,
  spotifyTokenResponseSchema,
  spotifyPlaylistSchema,
  spotifyPlaylistPageSchema,
  type SpotifyPlaylist,
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
  getPlaylist(id: string, accessToken: string, full: boolean): Promise<SpotifyPlaylist>
}

async function readJson(
  response: Response,
  operation: 'authenticate' | 'search' | 'playlist',
): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new SpotifyInvalidResponseError(operation, { cause: error })
  }
}

export class SpotifyClient implements SpotifyClientPort {
  constructor(
    private readonly config: SpotifyConfig,
    private readonly request: SpotifyFetch = fetch,
    private readonly timeoutMs: number = parseExternalHttpTimeout(),
  ) {}

  async getPlaylist(id: string, accessToken: string, full: boolean): Promise<SpotifyPlaylist> {
    const base = `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`
    const read = async (url: string) => {
      let response: Response
      try {
        response = await this.request(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch {
        throw new SpotifyUnavailableError('playlist')
      }
      if (response.status === 403 || response.status === 404)
        throw new SpotifyPlaylistInaccessibleError()
      if (!response.ok) throw new SpotifyUnavailableError('playlist')
      return readJson(response, 'playlist')
    }
    const result = spotifyPlaylistSchema.safeParse(await read(base))
    if (!result.success) throw new SpotifyInvalidResponseError('playlist')
    const playlist = result.data
    const page = playlist.items ?? playlist.tracks
    if (!page) throw new SpotifyPlaylistInaccessibleError()
    if (full) {
      const endpoint = playlist.items ? 'items' : 'tracks'
      let next = page.next
      while (next && page.items.length < page.total) {
        const offset = page.items.length
        const parsed = spotifyPlaylistPageSchema.safeParse(
          await read(`${base}/${endpoint}?offset=${offset}&limit=50`),
        )
        if (!parsed.success || parsed.data.items.length === 0)
          throw new SpotifyInvalidResponseError('playlist')
        page.items.push(...parsed.data.items)
        next = parsed.data.next
      }
      if (page.items.length !== page.total) throw new SpotifyInvalidResponseError('playlist')
    }
    return playlist
  }

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
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new SpotifyUnavailableError('authenticate', { cause: error })
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new SpotifyAuthenticationError()
      }

      throw new SpotifyUnavailableError('authenticate')
    }

    const result = spotifyTokenResponseSchema.safeParse(await readJson(response, 'authenticate'))
    if (!result.success) {
      throw new SpotifyInvalidResponseError('authenticate', { cause: result.error })
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
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new SpotifyUnavailableError('search', { cause: error })
    }

    if (!response.ok) {
      throw new SpotifyUnavailableError('search')
    }

    const result = spotifySearchResponseSchema.safeParse(await readJson(response, 'search'))
    if (!result.success) {
      throw new SpotifyInvalidResponseError('search', { cause: result.error })
    }

    return result.data.tracks.items
  }
}
