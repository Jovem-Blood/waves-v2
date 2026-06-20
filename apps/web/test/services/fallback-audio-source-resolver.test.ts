import type { ResolvedAudioSource, TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import {
  AudioSourceNotFoundError,
  AudioSourceUnavailableError,
} from '../../server/services/audio-source.errors'
import type { AudioSourceResolver } from '../../server/services/audio-source-resolver'
import { FallbackAudioSourceResolver } from '../../server/services/fallback-audio-source-resolver'
import type { WavesLogger } from '../../server/utils/logger'

const track: TrackMetadata = {
  id: 'spotify:one',
  provider: 'spotify',
  providerTrackId: 'one',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 180_000,
}
const audius: ResolvedAudioSource = {
  provider: 'audius',
  sourceIdentifier: 'audius-1',
  streamUrl: 'https://media.example/audius',
  expiresAt: '2026-06-20T12:05:00.000Z',
}

describe('FallbackAudioSourceResolver', () => {
  it.each([new AudioSourceNotFoundError(), new AudioSourceUnavailableError()])(
    'falls back from YouTube Music for safe failures',
    async (failure) => {
      const primary: AudioSourceResolver = { resolve: vi.fn().mockRejectedValue(failure) }
      const fallback: AudioSourceResolver = { resolve: vi.fn().mockResolvedValue(audius) }
      const warn = vi.fn()
      const info = vi.fn()
      const logger = {
        child: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        info,
        warn,
      } as unknown as WavesLogger

      await expect(
        new FallbackAudioSourceResolver(primary, fallback, logger).resolve(track),
      ).resolves.toBe(audius)
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'youtube_music',
          outcome: 'fallback',
        }),
        'Audio source provider attempt failed safely',
      )
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'audius', outcome: 'resolved' }),
        'Audio source provider attempt completed',
      )
    },
  )

  it('does not mask programming errors', async () => {
    const fallbackResolve = vi.fn().mockResolvedValue(audius)
    const primary: AudioSourceResolver = {
      resolve: vi.fn().mockRejectedValue(new TypeError('contract bug')),
    }
    const fallback: AudioSourceResolver = { resolve: fallbackResolve }

    await expect(new FallbackAudioSourceResolver(primary, fallback).resolve(track)).rejects.toThrow(
      'contract bug',
    )
    expect(fallbackResolve).not.toHaveBeenCalled()
  })

  it('returns a safe error when both providers fail without leaking URLs', async () => {
    const primary: AudioSourceResolver = {
      resolve: vi.fn().mockRejectedValue(new AudioSourceUnavailableError()),
    }
    const fallback: AudioSourceResolver = {
      resolve: vi.fn().mockRejectedValue(new AudioSourceNotFoundError()),
    }

    const error = await new FallbackAudioSourceResolver(primary, fallback)
      .resolve(track)
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'SOURCE_NOT_FOUND' })
    expect(String(error)).not.toContain('http')
  })
})
