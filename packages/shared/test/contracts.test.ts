import { describe, expect, it } from 'vitest'

import {
  autoplayStateSchema,
  queueItemAudioSourceSchema,
  addQueueItemInputSchema,
  apiErrorCodeSchema,
  apiErrorSchema,
  botHeartbeatInputSchema,
  botEventSchema,
  botPlayInputSchema,
  completePlaybackInputSchema,
  historyPageSchema,
  historyQuerySchema,
  moveQueueItemInputSchema,
  operationalStatusSchema,
  playerStateSchema,
  queueItemSchema,
  rejectAutoplaySuggestionInputSchema,
  playbackTransitionResultSchema,
  removeQueueItemResultSchema,
  trackMetadataSchema,
} from '../src/index.js'

const validTrack = {
  id: 'spotify:4uLU6hMCjMI75M1A2tKUQC',
  provider: 'spotify',
  providerTrackId: '4uLU6hMCjMI75M1A2tKUQC',
  title: 'Never Gonna Give You Up',
  artists: ['Rick Astley'],
  albumName: 'Whenever You Need Somebody',
  durationMs: 213_573,
  coverUrl: 'https://i.scdn.co/image/example',
  externalUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  isrc: 'GBARL9300135',
} as const

describe('trackMetadataSchema', () => {
  it('accepts normalized Spotify metadata', () => {
    expect(trackMetadataSchema.parse(validTrack)).toEqual(validTrack)
  })

  it('rejects empty artists, invalid URLs and extra fields', () => {
    expect(
      trackMetadataSchema.safeParse({
        ...validTrack,
        artists: [],
        coverUrl: 'not-a-url',
        secret: 'must-not-pass',
      }).success,
    ).toBe(false)
  })
})

describe('autoplay schemas', () => {
  it('validates ordered suggestions and target rejection input', () => {
    const state = autoplayStateSchema.parse({
      enabled: true,
      failureCode: null,
      suggestions: [
        {
          track: {
            id: 'spotify:first',
            provider: 'spotify',
            providerTrackId: 'first',
            title: 'First',
            artists: ['Artist'],
            durationMs: 120000,
          },
          provider: 'spotify',
          generatedAt: '2026-06-18T12:00:00.000Z',
          seedFingerprint: 'seed',
        },
      ],
      updatedAt: '2026-06-18T12:00:00.000Z',
    })

    expect(state.suggestions).toHaveLength(1)
    expect(rejectAutoplaySuggestionInputSchema.parse({ providerTrackId: 'first' })).toEqual({
      providerTrackId: 'first',
    })
  })
})

describe('round one UX contracts', () => {
  it('accepts queue placement, removal receipts and new domain errors', () => {
    expect(addQueueItemInputSchema.parse({ track: validTrack, placement: 'next' }).placement).toBe(
      'next',
    )
    expect(
      removeQueueItemResultSchema.parse({
        queue: [],
        removal: {
          queueItemId: 'queue-1',
          expiresAt: '2026-06-22T12:00:10.000Z',
        },
      }),
    ).toMatchObject({ removal: { queueItemId: 'queue-1' } })
    expect(apiErrorCodeSchema.parse('DUPLICATE_TRACK')).toBe('DUPLICATE_TRACK')
  })

  it('validates heartbeat and operational status', () => {
    expect(botHeartbeatInputSchema.parse({ occurredAt: '2026-06-22T12:00:00.000Z' })).toBeDefined()
    expect(
      operationalStatusSchema.parse({
        web: { status: 'available', checkedAt: '2026-06-22T12:00:00.000Z' },
        bot: { status: 'offline' },
        voice: { status: 'disconnected' },
      }),
    ).toBeDefined()
  })
})

describe('audio source contracts', () => {
  it.each(['youtube_music', 'audius'] as const)(
    'accepts a normalized %s source response',
    (provider) => {
      expect(
        queueItemAudioSourceSchema.parse({
          queueItemId: 'queue-1',
          source: {
            provider,
            sourceIdentifier: 'source-1',
            streamUrl: 'https://stream.example/signed',
            expiresAt: '2026-06-20T12:05:00.000Z',
          },
        }),
      ).toMatchObject({
        queueItemId: 'queue-1',
        source: { provider },
      })
    },
  )

  it('rejects unsupported providers, invalid URLs and extra fields', () => {
    expect(
      queueItemAudioSourceSchema.safeParse({
        queueItemId: 'queue-1',
        source: {
          provider: 'spotify',
          sourceIdentifier: 'track-1',
          streamUrl: 'not-a-url',
          expiresAt: '2026-06-20T12:05:00.000Z',
          token: 'must-not-pass',
        },
      }).success,
    ).toBe(false)
  })
})

describe('queue contracts', () => {
  it('accepts queue items and add payloads', () => {
    const item = {
      id: 'queue-1',
      track: validTrack,
      requestedByDisplayName: 'Luis',
      status: 'queued',
      position: 0,
      createdAt: '2026-06-18T12:00:00.000Z',
      updatedAt: '2026-06-18T12:00:00.000Z',
    } as const

    expect(queueItemSchema.parse(item)).toEqual(item)
    expect(addQueueItemInputSchema.parse({ track: validTrack })).toEqual({ track: validTrack })
  })

  it('rejects negative and fractional positions', () => {
    expect(moveQueueItemInputSchema.safeParse({ newPosition: -1 }).success).toBe(false)
    expect(moveQueueItemInputSchema.safeParse({ newPosition: 1.5 }).success).toBe(false)
  })

  it('requires all Discord requester fields for bot play', () => {
    expect(
      botPlayInputSchema.safeParse({
        query: 'daft punk',
        requestedByDiscordUserId: '123',
        requestedByDisplayName: 'Luis',
      }).success,
    ).toBe(true)
    expect(botPlayInputSchema.safeParse({ query: 'daft punk' }).success).toBe(false)
  })

  it('validates cursor-paginated playback history', () => {
    const cursor = 'eyJ1cGRhdGVkQXQiOiIyMDI2LTA2LTE4VDEyOjAwOjAwLjAwMFoiLCJpZCI6InEtMSJ9'

    expect(historyQuerySchema.parse({ cursor })).toEqual({ cursor })
    expect(
      historyPageSchema.parse({
        items: [
          {
            ...queueItemSchema.parse({
              id: 'queue-1',
              track: validTrack,
              requestedByDisplayName: 'Luis',
              status: 'played',
              position: 0,
              createdAt: '2026-06-18T12:00:00.000Z',
              updatedAt: '2026-06-18T12:04:00.000Z',
            }),
          },
        ],
        nextCursor: null,
      }).nextCursor,
    ).toBeNull()
    expect(historyQuerySchema.safeParse({ cursor: ['first', 'second'] }).success).toBe(false)
  })
})

describe('player, event and error contracts', () => {
  it('accepts logical player state', () => {
    expect(
      playerStateSchema.safeParse({
        status: 'idle',
        updatedAt: '2026-06-18T12:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  it('accepts validated event envelopes', () => {
    expect(
      botEventSchema.safeParse({
        type: 'command.received',
        occurredAt: '2026-06-18T12:00:00.000Z',
        guildId: 'guild-1',
        payload: { command: 'play' },
      }).success,
    ).toBe(true)
  })

  it('requires guild and channel context for typed voice events', () => {
    expect(
      botEventSchema.safeParse({
        type: 'voice.connected',
        occurredAt: '2026-06-18T12:00:00.000Z',
        guildId: 'guild-1',
        guildName: 'Waves',
        voiceChannelId: 'voice-1',
        voiceChannelName: 'ondas-da-noite',
        payload: {},
      }).success,
    ).toBe(true)
    expect(
      botEventSchema.safeParse({
        type: 'voice.connected',
        occurredAt: '2026-06-18T12:00:00.000Z',
        guildId: 'guild-1',
        guildName: 'Waves',
        payload: {},
      }).success,
    ).toBe(false)
    expect(
      botEventSchema.safeParse({
        type: 'voice.connected',
        occurredAt: '2026-06-18T12:00:00.000Z',
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        payload: {},
      }).success,
    ).toBe(false)
    expect(
      botEventSchema.safeParse({
        type: 'voice.disconnected',
        occurredAt: '2026-06-18T12:00:00.000Z',
        payload: {},
      }).success,
    ).toBe(false)
  })

  it('requires guild and queue item context for playback events', () => {
    expect(
      botEventSchema.safeParse({
        type: 'playback.started',
        occurredAt: '2026-06-20T12:00:00.000Z',
        guildId: 'guild-1',
        payload: { queueItemId: 'queue-1' },
      }).success,
    ).toBe(true)
    expect(
      botEventSchema.safeParse({
        type: 'playback.failed',
        occurredAt: '2026-06-20T12:00:00.000Z',
        payload: {},
      }).success,
    ).toBe(false)
  })

  it('validates playback transition contracts', () => {
    expect(
      completePlaybackInputSchema.safeParse({
        queueItemId: 'queue-1',
        outcome: 'played',
      }).success,
    ).toBe(true)
    expect(
      playbackTransitionResultSchema.safeParse({
        completedQueueItemId: 'queue-1',
        player: {
          status: 'idle',
          updatedAt: '2026-06-20T12:00:00.000Z',
        },
        queue: [],
      }).success,
    ).toBe(true)
  })

  it('rejects unknown API error codes', () => {
    expect(
      apiErrorSchema.safeParse({
        statusCode: 500,
        statusMessage: 'Unexpected error',
        data: { code: 'UNKNOWN_ERROR' },
      }).success,
    ).toBe(false)
  })
})
