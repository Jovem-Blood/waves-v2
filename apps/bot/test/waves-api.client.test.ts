import type { BotEvent, BotPlayInput } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { WavesApiClient, type WavesFetch } from '../src/api/waves-api.client.js'
import {
  WavesApiError,
  WavesApiInvalidResponseError,
  WavesApiTimeoutError,
} from '../src/api/waves-api.errors.js'

const config = {
  apiBaseUrl: 'http://localhost:3000/api/',
  internalApiToken: 'internal-token',
}
const track = {
  id: 'spotify:track-1',
  provider: 'spotify' as const,
  providerTrackId: 'track-1',
  title: 'Track One',
  artists: ['Artist'],
  durationMs: 1000,
}
const item = {
  id: 'queue-1',
  track,
  status: 'queued' as const,
  position: 0,
  createdAt: '2026-06-18T18:00:00.000Z',
  updatedAt: '2026-06-18T18:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('WavesApiClient', () => {
  it('applies base URL and bearer centrally and validates queue', async () => {
    const request = vi.fn<WavesFetch>().mockResolvedValue(jsonResponse([item]))
    const client = new WavesApiClient(config, request)

    await expect(client.getQueue()).resolves.toEqual([item])

    const [url, init] = request.mock.calls[0] ?? []
    expect(url).toBe('http://localhost:3000/api/internal/bot/queue')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer internal-token')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('validates play, skip, source, playback and event responses', async () => {
    const request = vi
      .fn<WavesFetch>()
      .mockResolvedValueOnce(jsonResponse({ item, track }))
      .mockResolvedValueOnce(
        jsonResponse({
          player: {
            status: 'playing',
            currentQueueItemId: item.id,
            updatedAt: item.updatedAt,
          },
          queue: [{ ...item, status: 'playing' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          queueItemId: item.id,
          source: {
            provider: 'audius',
            sourceIdentifier: 'audius-1',
            streamUrl: 'https://stream.example/signed',
            expiresAt: '2026-06-20T12:05:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          player: {
            status: 'playing',
            currentQueueItemId: item.id,
            updatedAt: item.updatedAt,
          },
          item: { ...item, status: 'playing' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          completedQueueItemId: item.id,
          player: { status: 'idle', updatedAt: item.updatedAt },
          queue: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ accepted: true }, 202))
      .mockResolvedValueOnce(
        jsonResponse({
          web: { status: 'available', checkedAt: item.updatedAt },
          bot: { status: 'online', lastSeenAt: item.updatedAt },
          voice: { status: 'disconnected' },
        }),
      )
    const client = new WavesApiClient(config, request)
    const playInput: BotPlayInput = {
      query: 'track',
      requestedByDiscordUserId: 'user-1',
      requestedByDisplayName: 'Luis',
    }
    const event: BotEvent = {
      type: 'command.received',
      occurredAt: item.createdAt,
      payload: { command: 'play' },
    }

    await expect(client.play(playInput)).resolves.toMatchObject({ item, track })
    await expect(client.skip()).resolves.toMatchObject({
      player: {
        status: 'playing',
        currentQueueItemId: item.id,
        volume: 100,
        progressMs: 0,
        updatedAt: item.updatedAt,
      },
      queue: [{ ...item, status: 'playing' }],
    })
    await expect(client.resolveSource(item.id, true)).resolves.toMatchObject({
      queueItemId: item.id,
      source: { provider: 'audius', sourceIdentifier: 'audius-1' },
    })
    await expect(client.claimPlayback()).resolves.toMatchObject({
      item: { id: item.id, status: 'playing' },
    })
    await expect(
      client.completePlayback({ queueItemId: item.id, outcome: 'played' }),
    ).resolves.toMatchObject({
      completedQueueItemId: item.id,
      player: { status: 'idle' },
    })
    await expect(client.sendEvent(event)).resolves.toBeUndefined()
    await expect(client.heartbeat(item.updatedAt)).resolves.toMatchObject({
      bot: { status: 'online' },
    })

    const sourceRequest = request.mock.calls[2]?.[1]
    expect(sourceRequest?.body).toBe(JSON.stringify({ forceRefresh: true }))
  })

  it('translates API errors and malformed responses', async () => {
    const apiFailure = new WavesApiClient(
      config,
      vi.fn<WavesFetch>().mockResolvedValue(
        jsonResponse(
          {
            statusCode: 404,
            statusMessage: 'Track not found',
            data: { code: 'TRACK_NOT_FOUND' },
          },
          404,
        ),
      ),
    )
    await expect(apiFailure.getQueue()).rejects.toEqual(new WavesApiError('TRACK_NOT_FOUND', 404))

    const invalid = new WavesApiClient(
      config,
      vi.fn<WavesFetch>().mockResolvedValue(jsonResponse({ invalid: true })),
    )
    await expect(invalid.getQueue()).rejects.toBeInstanceOf(WavesApiInvalidResponseError)
  })

  it('translates timeout without exposing the token', async () => {
    const client = new WavesApiClient(
      config,
      vi.fn<WavesFetch>().mockRejectedValue(new DOMException('internal-token', 'TimeoutError')),
      1,
    )

    const error = await client.getQueue().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WavesApiTimeoutError)
    expect(String(error)).not.toContain(config.internalApiToken)
  })
})
