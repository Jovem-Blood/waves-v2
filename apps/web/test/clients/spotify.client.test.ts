import { describe, expect, it, vi } from 'vitest'

import { SpotifyClient, type SpotifyFetch } from '../../server/clients/spotify.client'
import {
  SpotifyAuthenticationError,
  SpotifyInvalidResponseError,
  SpotifyUnavailableError,
  SpotifyPlaylistInaccessibleError,
} from '../../server/clients/spotify.errors'

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('SpotifyClient', () => {
  it.each(['items', 'tracks'] as const)(
    'paginates %s without following arbitrary URLs',
    async (field) => {
      const request = vi
        .fn<SpotifyFetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'playlist',
            name: 'Playlist',
            owner: { id: 'owner' },
            [field]: { items: [{ track: null }], total: 2, next: 'https://untrusted.test/' },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ items: [{ track: null }], total: 2, next: null }))
      const result = await new SpotifyClient(config, request).getPlaylist('playlist', 'token', true)
      expect(result[field]?.items).toHaveLength(2)
      expect(request.mock.calls[1]?.[0]).toBe(
        `https://api.spotify.com/v1/playlists/playlist/${field}?offset=1&limit=50`,
      )
    },
  )

  it('does not mistake inaccessible contents for an empty playlist', async () => {
    const request = vi
      .fn<SpotifyFetch>()
      .mockResolvedValue(jsonResponse({ id: 'playlist', name: 'Playlist', owner: { id: 'owner' } }))
    await expect(
      new SpotifyClient(config, request).getPlaylist('playlist', 'token', false),
    ).rejects.toBeInstanceOf(SpotifyPlaylistInaccessibleError)
  })

  it('rejects incomplete pagination instead of silently importing a partial playlist', async () => {
    const request = vi
      .fn<SpotifyFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'playlist',
          name: 'Playlist',
          owner: { id: 'owner' },
          tracks: { items: [{ track: null }], total: 2, next: 'next' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 2, next: null }))
    await expect(
      new SpotifyClient(config, request).getPlaylist('playlist', 'token', true),
    ).rejects.toBeInstanceOf(SpotifyInvalidResponseError)
  })
  it('requests a token using Basic authorization and form encoding', async () => {
    const request = vi.fn<SpotifyFetch>().mockResolvedValue(
      jsonResponse({
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    )
    const client = new SpotifyClient(config, request)

    await expect(client.requestAccessToken()).resolves.toEqual({
      accessToken: 'access-token',
      expiresInSeconds: 3600,
    })

    expect(request).toHaveBeenCalledOnce()
    const [url, init] = request.mock.calls[0] ?? []
    expect(url).toBe('https://accounts.spotify.com/api/token')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(init?.body).toBeInstanceOf(URLSearchParams)
    expect((init?.body as URLSearchParams).toString()).toBe('grant_type=client_credentials')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends track-only search parameters and bearer authorization', async () => {
    const request = vi.fn<SpotifyFetch>().mockResolvedValue(
      jsonResponse({
        tracks: {
          items: [],
        },
      }),
    )
    const client = new SpotifyClient(config, request)

    await expect(client.searchTracks('daft punk', 'access-token')).resolves.toEqual([])

    const [input, init] = request.mock.calls[0] ?? []
    expect(input).toBeInstanceOf(URL)
    const url = input as URL
    expect(url.origin + url.pathname).toBe('https://api.spotify.com/v1/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'daft punk',
      type: 'track',
      limit: '10',
    })
    expect(init?.headers).toEqual({ Authorization: 'Bearer access-token' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('translates rejected credentials without exposing them', async () => {
    const client = new SpotifyClient(
      config,
      vi.fn<SpotifyFetch>().mockResolvedValue(jsonResponse({ error: 'invalid_client' }, 401)),
    )

    const error = await client.requestAccessToken().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SpotifyAuthenticationError)
    expect(String(error)).not.toContain(config.clientId)
    expect(String(error)).not.toContain(config.clientSecret)
  })

  it('translates network failures and invalid responses', async () => {
    const unavailableClient = new SpotifyClient(
      config,
      vi.fn<SpotifyFetch>().mockRejectedValue(new Error('access-token secret detail')),
    )
    const unavailableError = await unavailableClient
      .requestAccessToken()
      .catch((error: unknown) => error)
    expect(unavailableError).toBeInstanceOf(SpotifyUnavailableError)
    expect((unavailableError as Error).cause).toBeInstanceOf(Error)

    const invalidClient = new SpotifyClient(
      config,
      vi.fn<SpotifyFetch>().mockResolvedValue(jsonResponse({ expires_in: 3600 })),
    )
    await expect(invalidClient.requestAccessToken()).rejects.toBeInstanceOf(
      SpotifyInvalidResponseError,
    )
  })

  it('rejects malformed search responses with an internal error', async () => {
    const client = new SpotifyClient(
      config,
      vi.fn<SpotifyFetch>().mockResolvedValue(jsonResponse({ tracks: { items: [{}] } })),
    )

    await expect(client.searchTracks('query', 'access-token')).rejects.toBeInstanceOf(
      SpotifyInvalidResponseError,
    )
  })
})
