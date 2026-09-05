import type { TrackMetadata } from '@waves/shared'

import type { YouTubeMusicClientPort } from '../../clients/youtube-music.client'
import { YouTubeMusicUnavailableError } from '../../clients/youtube-music.errors'
import { analyzeYouTubeMusicCandidates, normalizeMusicText } from '../audio-source/matching'
import { RecommendationProviderUnavailableError } from './errors'
import type { RecommendationCandidate, RecommendationProvider } from './types'

export class YouTubeMusicRecommendationProvider implements RecommendationProvider {
  readonly name = 'youtube_music' as const

  constructor(private readonly client: YouTubeMusicClientPort) {}

  async getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]> {
    const seed = seeds[0]
    if (!seed) return []
    try {
      const searchResults = await this.client.searchSongs(
        `${seed.title} ${seed.artists[0] ?? ''}`,
        10,
      )
      const matched = analyzeYouTubeMusicCandidates(seed, searchResults).candidate
      if (!matched) return []
      const automix = await this.client.getUpNextSongs(matched.videoId, 10)
      return automix.map((track, index) => ({
        provider: this.name,
        identityKey: `${normalizeMusicText(track.title)}::${normalizeMusicText(track.artists[0] ?? '')}`,
        title: track.title,
        artists: track.artists,
        score: 1 - index / Math.max(automix.length, 1),
        strategy: 'fallback' as const,
        seedTrackKey: `${seed.provider}:${seed.providerTrackId}`,
      }))
    } catch (error) {
      throw new RecommendationProviderUnavailableError(this.name, {
        cause:
          error instanceof Error
            ? error
            : new YouTubeMusicUnavailableError({ cause: new Error('Non-Error provider failure') }),
      })
    }
  }
}
