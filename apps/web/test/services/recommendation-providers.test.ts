import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { LastFmUnavailableError } from '../../server/clients/lastfm.errors'
import { YouTubeMusicUnavailableError } from '../../server/clients/youtube-music.errors'
import { RecommendationProviderUnavailableError } from '../../server/services/recommendation/errors'
import { LastFmRecommendationProvider } from '../../server/services/recommendation/lastfm.provider'
import { YouTubeMusicRecommendationProvider } from '../../server/services/recommendation/youtube-music.provider'

const seed: TrackMetadata = {
  id: 'spotify:seed',
  provider: 'spotify',
  providerTrackId: 'seed',
  title: 'Seed',
  artists: ['Seed Artist'],
  durationMs: 180_000,
}

const youtubeCandidate = {
  videoId: 'seed-video',
  title: 'Seed',
  artists: ['Seed Artist'],
  durationMs: 180_000,
  isOfficial: true,
  isTopic: false,
}

describe('recommendation providers', () => {
  it('merges Last.fm candidates by normalized identity and seed weight', async () => {
    const getSimilarTracks = vi
      .fn()
      .mockResolvedValueOnce([{ name: 'Result', match: 0.8, artist: { name: 'Artist' } }])
      .mockResolvedValueOnce([{ name: 'RESULT', match: 0.9, artist: { name: 'ARTIST' } }])
    const provider = new LastFmRecommendationProvider({
      getSimilarTracks,
      getArtistInfo: vi.fn().mockResolvedValue({ name: 'Seed Artist' }),
      getArtistTopTracks: vi.fn(),
      getSimilarTags: vi.fn(),
      getTagTopTracks: vi.fn(),
    })

    const candidates = await provider.getCandidates([seed, { ...seed, id: 'two' }])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ title: 'Result', strategy: 'similar' })
    expect(candidates[0]?.score).toBeCloseTo(0.84)
    expect(getSimilarTracks).toHaveBeenCalledTimes(2)
  })

  it('reports Last.fm unavailable only when every seed fails', async () => {
    const provider = new LastFmRecommendationProvider({
      getSimilarTracks: vi.fn().mockRejectedValue(new LastFmUnavailableError(503)),
      getArtistInfo: vi.fn().mockRejectedValue(new LastFmUnavailableError(503)),
      getArtistTopTracks: vi.fn(),
      getSimilarTags: vi.fn(),
      getTagTopTracks: vi.fn(),
    })
    await expect(provider.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationProviderUnavailableError,
    )
  })

  it('builds adjacent and exploratory candidates when one discovery route is available', async () => {
    const provider = new LastFmRecommendationProvider({
      getSimilarTracks: vi.fn().mockResolvedValue([]),
      getArtistInfo: vi.fn().mockResolvedValue({
        name: 'Seed Artist',
        similar: { artist: [{ name: 'Related Artist' }] },
        tags: { tag: [{ name: 'rock' }] },
      }),
      getArtistTopTracks: vi
        .fn()
        .mockResolvedValue([{ name: 'Adjacent', artist: { name: 'Related Artist' } }]),
      getSimilarTags: vi.fn().mockResolvedValue([{ name: 'alternative rock' }]),
      getTagTopTracks: vi
        .fn()
        .mockResolvedValue([{ name: 'Explore', artist: { name: 'New Artist' } }]),
    })

    const candidates = await provider.getCandidates([seed])

    expect(candidates.map((entry) => entry.strategy)).toEqual(['adjacent', 'explore'])
    expect(candidates[1]).toMatchObject({ sourceTag: 'alternative rock' })
  })

  it('strictly matches a YouTube seed before requesting automix', async () => {
    const getUpNextSongs = vi
      .fn()
      .mockResolvedValue([
        { ...youtubeCandidate, videoId: 'next', title: 'Next', artists: ['Next Artist'] },
      ])
    const provider = new YouTubeMusicRecommendationProvider({
      searchSongs: vi.fn().mockResolvedValue([youtubeCandidate]),
      searchVideos: vi.fn(),
      getUpNextSongs,
      resolveAudioFormat: vi.fn(),
    })

    await expect(provider.getCandidates([seed])).resolves.toEqual([
      {
        provider: 'youtube_music',
        identityKey: 'next::next artist',
        title: 'Next',
        artists: ['Next Artist'],
        score: 1,
        strategy: 'fallback',
        seedTrackKey: 'spotify:seed',
      },
    ])
    expect(getUpNextSongs).toHaveBeenCalledWith('seed-video', 10)
  })

  it('maps YouTube automix failures to provider unavailable', async () => {
    const provider = new YouTubeMusicRecommendationProvider({
      searchSongs: vi.fn().mockRejectedValue(new YouTubeMusicUnavailableError()),
      searchVideos: vi.fn(),
      getUpNextSongs: vi.fn(),
      resolveAudioFormat: vi.fn(),
    })
    await expect(provider.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationProviderUnavailableError,
    )
  })
})
