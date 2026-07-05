import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { LastFmUnavailableError } from '../../server/clients/lastfm.errors'
import { YouTubeMusicUnavailableError } from '../../server/clients/youtube-music.errors'
import { LastFmRecommendationProvider } from '../../server/services/lastfm-recommendation.provider'
import { RecommendationProviderUnavailableError } from '../../server/services/recommendation.errors'
import { YouTubeMusicRecommendationProvider } from '../../server/services/youtube-music-recommendation.provider'

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
    const provider = new LastFmRecommendationProvider({ getSimilarTracks })

    const candidates = await provider.getCandidates([seed, { ...seed, id: 'two' }])

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ title: 'Result', score: 0.8 })
    expect(getSimilarTracks).toHaveBeenCalledTimes(2)
  })

  it('reports Last.fm unavailable only when every seed fails', async () => {
    const provider = new LastFmRecommendationProvider({
      getSimilarTracks: vi.fn().mockRejectedValue(new LastFmUnavailableError(503)),
    })
    await expect(provider.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationProviderUnavailableError,
    )
  })

  it('strictly matches a YouTube seed before requesting automix', async () => {
    const getUpNextSongs = vi
      .fn()
      .mockResolvedValue([
        { ...youtubeCandidate, videoId: 'next', title: 'Next', artists: ['Next Artist'] },
      ])
    const provider = new YouTubeMusicRecommendationProvider({
      searchSongs: vi.fn().mockResolvedValue([youtubeCandidate]),
      getUpNextSongs,
      resolveAudioFormat: vi.fn(),
    })

    await expect(provider.getCandidates([seed])).resolves.toEqual([
      {
        provider: 'youtube_music',
        title: 'Next',
        artists: ['Next Artist'],
        score: 1,
      },
    ])
    expect(getUpNextSongs).toHaveBeenCalledWith('seed-video', 10)
  })

  it('maps YouTube automix failures to provider unavailable', async () => {
    const provider = new YouTubeMusicRecommendationProvider({
      searchSongs: vi.fn().mockRejectedValue(new YouTubeMusicUnavailableError()),
      getUpNextSongs: vi.fn(),
      resolveAudioFormat: vi.fn(),
    })
    await expect(provider.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationProviderUnavailableError,
    )
  })
})
