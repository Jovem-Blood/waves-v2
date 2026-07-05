import { describe, expect, it, vi } from 'vitest'

import type { SpotifyAccessToken, SpotifyClientPort } from '../../server/clients/spotify.client'
import {
  SpotifyInvalidQueryError,
  SpotifyInvalidResponseError,
} from '../../server/clients/spotify.errors'
import type { SpotifyTrack } from '../../server/clients/spotify.schemas'
import { SpotifyService } from '../../server/services/spotify.service'

const completeTrack: SpotifyTrack = {
  id: '4uLU6hMCjMI75M1A2tKUQC',
  name: 'Never Gonna Give You Up',
  artists: [{ name: 'Rick Astley' }, { name: 'Guest Artist' }],
  album: {
    name: 'Whenever You Need Somebody',
    images: [
      {
        url: 'https://i.scdn.co/image/large',
        height: 640,
        width: 640,
      },
      {
        url: 'https://i.scdn.co/image/small',
        height: 64,
        width: 64,
      },
    ],
  },
  duration_ms: 213_573,
  external_urls: {
    spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  },
  external_ids: {
    isrc: 'GBARL9300135',
  },
}

function createClient(tracks: SpotifyTrack[] = [completeTrack]): {
  client: SpotifyClientPort
  requestAccessToken: ReturnType<typeof vi.fn<() => Promise<SpotifyAccessToken>>>
  searchTracks: ReturnType<
    typeof vi.fn<(query: string, accessToken: string, limit?: number) => Promise<SpotifyTrack[]>>
  >
} {
  const requestAccessToken = vi.fn<() => Promise<SpotifyAccessToken>>().mockResolvedValue({
    accessToken: 'token-1',
    expiresInSeconds: 3600,
  })
  const searchTracks = vi
    .fn<(query: string, accessToken: string, limit?: number) => Promise<SpotifyTrack[]>>()
    .mockResolvedValue(tracks)
  return {
    client: { requestAccessToken, searchTracks },
    requestAccessToken,
    searchTracks,
  }
}

describe('SpotifyService', () => {
  it('requests a token on the first search and normalizes tracks', async () => {
    const { client, requestAccessToken, searchTracks } = createClient()
    const service = new SpotifyService(client, () => 1_000_000)

    await expect(service.searchTracks('  rick astley  ')).resolves.toEqual([
      {
        id: 'spotify:4uLU6hMCjMI75M1A2tKUQC',
        provider: 'spotify',
        providerTrackId: '4uLU6hMCjMI75M1A2tKUQC',
        title: 'Never Gonna Give You Up',
        artists: ['Rick Astley', 'Guest Artist'],
        albumName: 'Whenever You Need Somebody',
        durationMs: 213_573,
        coverUrl: 'https://i.scdn.co/image/large',
        externalUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
        isrc: 'GBARL9300135',
      },
    ])
    expect(requestAccessToken).toHaveBeenCalledOnce()
    expect(searchTracks).toHaveBeenCalledWith('rick astley', 'token-1', 10)
  })

  it('reuses a valid token across searches', async () => {
    const { client, requestAccessToken } = createClient([])
    let currentTime = 1_000_000
    const service = new SpotifyService(client, () => currentTime)

    await service.searchTracks('first')
    currentTime += 60_000
    await service.searchTracks('second')

    expect(requestAccessToken).toHaveBeenCalledOnce()
  })

  it('renews a token inside the refresh margin', async () => {
    const { client, requestAccessToken } = createClient([])
    requestAccessToken
      .mockResolvedValueOnce({ accessToken: 'token-1', expiresInSeconds: 120 })
      .mockResolvedValueOnce({ accessToken: 'token-2', expiresInSeconds: 3600 })
    let currentTime = 1_000_000
    const service = new SpotifyService(client, () => currentTime, {
      tokenRefreshMarginMs: 60_000,
    })

    await service.searchTracks('first')
    currentTime += 60_001
    await service.searchTracks('second')

    expect(requestAccessToken).toHaveBeenCalledTimes(2)
  })

  it('rejects empty queries before requesting a token', async () => {
    const { client, requestAccessToken, searchTracks } = createClient()
    const service = new SpotifyService(client)

    await expect(service.searchTracks('   ')).rejects.toBeInstanceOf(SpotifyInvalidQueryError)
    expect(requestAccessToken).not.toHaveBeenCalled()
    expect(searchTracks).not.toHaveBeenCalled()
  })

  it('omits unavailable optional fields instead of returning undefined', async () => {
    const { client } = createClient([
      {
        id: 'track-2',
        name: 'Minimal Track',
        artists: [{ name: 'Solo Artist' }],
        album: { images: [] },
        duration_ms: 1000,
      },
    ])
    const service = new SpotifyService(client)

    const [track] = await service.searchTracks('minimal')

    expect(track).toEqual({
      id: 'spotify:track-2',
      provider: 'spotify',
      providerTrackId: 'track-2',
      title: 'Minimal Track',
      artists: ['Solo Artist'],
      durationMs: 1000,
    })
    expect(Object.values(track ?? {}).includes(undefined)).toBe(false)
  })

  it('translates normalized contract violations to an internal response error', async () => {
    const { client } = createClient([
      {
        ...completeTrack,
        external_ids: { isrc: 'invalid-isrc' },
      },
    ])
    const service = new SpotifyService(client)

    await expect(service.searchTracks('invalid')).rejects.toEqual(
      new SpotifyInvalidResponseError('search'),
    )
  })
})
