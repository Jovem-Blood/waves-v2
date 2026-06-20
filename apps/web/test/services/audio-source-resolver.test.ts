import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import type { AudiusClientPort } from '../../server/clients/audius.client'
import { AudiusUnavailableError } from '../../server/clients/audius.errors'
import type { AudiusTrack } from '../../server/clients/audius.schemas'
import { AudioSourceNotFoundError } from '../../server/services/audio-source.errors'
import {
  AudiusAudioSourceResolver,
  type AudioSourceResolver,
} from '../../server/services/audio-source-resolver'

const track: TrackMetadata = {
  id: 'spotify:track-1',
  provider: 'spotify',
  providerTrackId: 'track-1',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 120_000,
}

function clientWith(data: AudiusTrack[]): AudiusClientPort {
  return {
    searchTracks: vi.fn().mockResolvedValue(data),
  }
}

describe('AudiusAudioSourceResolver', () => {
  it('selects a conservative title, artist and duration match', async () => {
    const searchTracks = vi.fn().mockResolvedValue([
      {
        id: 'cover',
        title: 'Track One Cover',
        duration: 120,
        is_stream_gated: false,
        stream: { url: 'https://stream.example/cover' },
        user: { name: 'Artist One' },
      },
      {
        id: 'match',
        title: 'Track One',
        duration: 121,
        is_stream_gated: false,
        stream: { url: 'https://stream.example/match' },
        user: { name: 'Artist One' },
      },
    ])
    const client: AudiusClientPort = { searchTracks }
    const resolver: AudioSourceResolver = new AudiusAudioSourceResolver(
      client,
      () => Date.parse('2026-06-20T12:00:00.000Z'),
      { ttlMs: 300_000 },
    )

    await expect(resolver.resolve(track)).resolves.toEqual({
      provider: 'audius',
      sourceIdentifier: 'match',
      streamUrl: 'https://stream.example/match',
      expiresAt: '2026-06-20T12:05:00.000Z',
    })
    expect(searchTracks).toHaveBeenCalledWith('Track One Artist One', 10)
  })

  it('rejects artist mismatches, altered versions, gated streams and duration drift', async () => {
    const resolver = new AudiusAudioSourceResolver(
      clientWith([
        {
          id: 'wrong-artist',
          title: 'Track One',
          duration: 120,
          stream: { url: 'https://stream.example/one' },
          user: { name: 'Different Artist' },
        },
        {
          id: 'remix',
          title: 'Track One Remix',
          duration: 120,
          stream: { url: 'https://stream.example/two' },
          user: { name: 'Artist One' },
        },
        {
          id: 'gated',
          title: 'Track One',
          duration: 120,
          is_stream_gated: true,
          stream: { url: 'https://stream.example/three' },
          user: { name: 'Artist One' },
        },
        {
          id: 'too-long',
          title: 'Track One',
          duration: 180,
          stream: { url: 'https://stream.example/four' },
          user: { name: 'Artist One' },
        },
      ]),
    )

    await expect(resolver.resolve(track)).rejects.toBeInstanceOf(AudioSourceNotFoundError)
  })

  it('translates provider failures to a safe source error', async () => {
    const client: AudiusClientPort = {
      searchTracks: vi.fn().mockRejectedValue(new AudiusUnavailableError()),
    }
    const resolver = new AudiusAudioSourceResolver(client)

    const error = await resolver.resolve(track).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(String(error)).not.toContain('stream')
  })
})
