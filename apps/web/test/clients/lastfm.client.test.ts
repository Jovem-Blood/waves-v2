import { describe, expect, it, vi } from 'vitest'

import { LastFmClient, type LastFmFetch } from '../../server/clients/lastfm.client'
import {
  LastFmInvalidResponseError,
  LastFmUnavailableError,
} from '../../server/clients/lastfm.errors'

const seed = {
  id: 'spotify:seed',
  provider: 'spotify' as const,
  providerTrackId: 'seed',
  title: 'Seed Track',
  artists: ['Seed Artist'],
  durationMs: 180_000,
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('LastFmClient', () => {
  it('requests similar tracks without exposing the shared secret', async () => {
    const request = vi.fn<LastFmFetch>().mockResolvedValue(
      response({
        similartracks: {
          track: [{ name: 'Result', match: '0.91', artist: { name: 'Result Artist' } }],
        },
      }),
    )
    const client = new LastFmClient({ apiKey: 'api-key' }, request)

    await expect(client.getSimilarTracks(seed, 10)).resolves.toEqual([
      { name: 'Result', match: 0.91, artist: { name: 'Result Artist' } },
    ])
    const [input] = request.mock.calls[0] ?? []
    const url = input as URL
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      method: 'track.getSimilar',
      artist: 'Seed Artist',
      track: 'Seed Track',
      api_key: 'api-key',
      autocorrect: '1',
      limit: '10',
      format: 'json',
    })
    expect(url.searchParams.has('api_sig')).toBe(false)
  })

  it('maps rate limits and API errors to unavailable', async () => {
    const client = new LastFmClient(
      { apiKey: 'api-key' },
      vi.fn<LastFmFetch>().mockResolvedValue(response({ error: 29, message: 'Rate limit' }, 429)),
    )
    await expect(client.getSimilarTracks(seed)).rejects.toEqual(new LastFmUnavailableError(429))
  })

  it('rejects malformed successful responses', async () => {
    const client = new LastFmClient(
      { apiKey: 'api-key' },
      vi.fn<LastFmFetch>().mockResolvedValue(response({ similartracks: { track: [{}] } })),
    )
    await expect(client.getSimilarTracks(seed)).rejects.toBeInstanceOf(LastFmInvalidResponseError)
  })

  it('validates discovery routes and caches repeated session requests', async () => {
    const request = vi.fn<LastFmFetch>().mockImplementation((input) => {
      const method = (input as URL).searchParams.get('method')
      if (method === 'artist.getInfo') {
        return Promise.resolve(
          response({
            artist: {
              name: 'Seed Artist',
              similar: { artist: [{ name: 'Related Artist' }] },
              tags: { tag: [{ name: 'rock' }] },
            },
          }),
        )
      }
      if (method === 'artist.getTopTracks') {
        return Promise.resolve(
          response({ toptracks: { track: [{ name: 'Related Track', playcount: '10' }] } }),
        )
      }
      if (method === 'tag.getSimilar') {
        return Promise.resolve(response({ similartags: { tag: [{ name: 'alternative rock' }] } }))
      }
      return Promise.resolve(
        response({
          tracks: {
            track: [{ name: 'Tag Track', artist: { name: 'Tag Artist' }, playcount: '5' }],
          },
        }),
      )
    })
    const client = new LastFmClient({ apiKey: 'api-key' }, request)

    await expect(client.getArtistInfo('Seed Artist')).resolves.toMatchObject({
      similar: { artist: [{ name: 'Related Artist' }] },
    })
    await client.getArtistInfo('Seed Artist')
    await expect(client.getArtistTopTracks('Related Artist')).resolves.toMatchObject([
      { name: 'Related Track', artist: { name: 'Related Artist' } },
    ])
    await expect(client.getSimilarTags('rock')).resolves.toEqual([{ name: 'alternative rock' }])
    await expect(client.getTagTopTracks('alternative rock')).resolves.toMatchObject([
      { name: 'Tag Track', artist: { name: 'Tag Artist' } },
    ])
    expect(request).toHaveBeenCalledTimes(4)
  })
})
