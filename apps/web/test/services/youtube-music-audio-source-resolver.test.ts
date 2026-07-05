import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import type { YouTubeMusicClientPort } from '../../server/clients/youtube-music.client'
import { YouTubeMusicCandidateUnavailableError } from '../../server/clients/youtube-music.errors'
import { YouTubeMusicAudioSourceResolver } from '../../server/services/youtube-music-audio-source-resolver'

const track: TrackMetadata = {
  id: 'spotify:one',
  provider: 'spotify',
  providerTrackId: 'one',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 180_000,
  isrc: 'BRABC1234567',
}

function candidate(videoId: string) {
  return {
    videoId,
    title: 'Track One',
    artists: ['Artist One'],
    durationMs: 180_000,
    isOfficial: true,
    isTopic: false,
  }
}

describe('YouTubeMusicAudioSourceResolver', () => {
  it('resolves the selected candidate and preserves only normalized fields', async () => {
    const searchSongs = vi.fn().mockResolvedValue([candidate('video-1')])
    const resolveAudioFormat = vi.fn().mockResolvedValue({
      videoId: 'video-1',
      streamUrl: 'https://media.example/audio',
      mimeType: 'audio/webm; codecs="opus"',
      expiresAt: '2026-06-20T12:05:00.000Z',
    })
    const client: YouTubeMusicClientPort = {
      searchSongs,
      getUpNextSongs: vi.fn(),
      resolveAudioFormat,
    }

    await expect(new YouTubeMusicAudioSourceResolver(client).resolve(track)).resolves.toEqual({
      provider: 'youtube_music',
      sourceIdentifier: 'video-1',
      streamUrl: 'https://media.example/audio',
      expiresAt: '2026-06-20T12:05:00.000Z',
    })
    expect(searchSongs).toHaveBeenCalledWith('Track One Artist One', 10)
    expect(searchSongs).toHaveBeenCalledWith('BRABC1234567', 10)
  })

  it('refreshes the same video ID before searching again', async () => {
    const searchSongs = vi.fn()
    const client: YouTubeMusicClientPort = {
      searchSongs,
      getUpNextSongs: vi.fn(),
      resolveAudioFormat: vi.fn().mockResolvedValue({
        videoId: 'video-1',
        streamUrl: 'https://media.example/refreshed',
        mimeType: 'audio/webm; codecs="opus"',
        expiresAt: '2026-06-20T12:10:00.000Z',
      }),
    }
    const resolver = new YouTubeMusicAudioSourceResolver(client)

    await expect(
      resolver.resolve(track, {
        preferredSource: { provider: 'youtube_music', sourceIdentifier: 'video-1' },
      }),
    ).resolves.toMatchObject({ sourceIdentifier: 'video-1' })
    expect(searchSongs).not.toHaveBeenCalled()
  })

  it('searches a new candidate when the previous video becomes unavailable', async () => {
    const resolveAudioFormat = vi
      .fn()
      .mockRejectedValueOnce(new YouTubeMusicCandidateUnavailableError())
      .mockResolvedValueOnce({
        videoId: 'video-2',
        streamUrl: 'https://media.example/new',
        mimeType: 'audio/webm; codecs="opus"',
        expiresAt: '2026-06-20T12:10:00.000Z',
      })
    const client: YouTubeMusicClientPort = {
      searchSongs: vi.fn().mockResolvedValue([candidate('video-2')]),
      getUpNextSongs: vi.fn(),
      resolveAudioFormat,
    }

    await expect(
      new YouTubeMusicAudioSourceResolver(client).resolve(track, {
        preferredSource: { provider: 'youtube_music', sourceIdentifier: 'video-1' },
      }),
    ).resolves.toMatchObject({ sourceIdentifier: 'video-2' })
  })
})
