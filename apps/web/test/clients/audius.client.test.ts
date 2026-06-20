import { describe, expect, it, vi } from 'vitest'

import { AudiusClient, type AudiusFetch } from '../../server/clients/audius.client'
import {
  AudiusInvalidResponseError,
  AudiusUnavailableError,
} from '../../server/clients/audius.errors'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AudiusClient', () => {
  it('searches with app_name and validates the external response', async () => {
    const request = vi.fn<AudiusFetch>().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'track-1',
            title: 'Track One',
            duration: 120,
            is_stream_gated: false,
            stream: { url: 'https://stream.example/track-1' },
            user: { name: 'Artist One' },
          },
        ],
      }),
    )
    const client = new AudiusClient(request, {
      apiUrl: 'https://api.example/v1/',
      appName: 'Waves Test',
    })

    await expect(client.searchTracks('Track One Artist One', 5)).resolves.toHaveLength(1)

    const [input, init] = request.mock.calls[0] ?? []
    expect(input).toBeInstanceOf(URL)
    const url = input as URL
    expect(url.pathname).toBe('/v1/tracks/search')
    expect(url.searchParams.get('query')).toBe('Track One Artist One')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('app_name')).toBe('Waves Test')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects malformed and unavailable responses without exposing their body', async () => {
    const malformed = new AudiusClient(
      vi.fn<AudiusFetch>().mockResolvedValue(jsonResponse({ data: [{ stream_url: 'secret' }] })),
    )
    await expect(malformed.searchTracks('track')).rejects.toBeInstanceOf(AudiusInvalidResponseError)

    const unavailable = new AudiusClient(
      vi.fn<AudiusFetch>().mockResolvedValue(jsonResponse({ secret: 'value' }, 503)),
    )
    const error = await unavailable.searchTracks('track').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AudiusUnavailableError)
    expect(String(error)).not.toContain('secret')
    expect(String(error)).not.toContain('value')
  })
})
