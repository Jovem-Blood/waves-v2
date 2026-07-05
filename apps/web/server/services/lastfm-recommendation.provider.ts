import type { TrackMetadata } from '@waves/shared'

import {
  LastFmConfigurationError,
  LastFmInvalidResponseError,
  LastFmUnavailableError,
} from '../clients/lastfm.errors'
import type { LastFmClientPort } from '../clients/lastfm.client'
import { normalizeMusicText } from './audio-source-matching'
import { RecommendationProviderUnavailableError } from './recommendation.errors'
import type { RecommendationCandidate, RecommendationProvider } from './recommendation.types'

const SEED_WEIGHTS = [1, 0.85, 0.7] as const

export class LastFmRecommendationProvider implements RecommendationProvider {
  readonly name = 'lastfm' as const

  constructor(private readonly client: LastFmClientPort) {}

  async getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]> {
    const selectedSeeds = seeds.slice(0, SEED_WEIGHTS.length)
    const results = await Promise.allSettled(
      selectedSeeds.map((seed) => this.client.getSimilarTracks(seed, 10)),
    )
    const successful = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<LastFmClientPort['getSimilarTracks']>>
      > => result.status === 'fulfilled',
    )
    if (successful.length === 0 && results.length > 0) {
      const rejected = results.find((result) => result.status === 'rejected')
      const reason: unknown = rejected?.reason as unknown
      if (
        reason instanceof LastFmConfigurationError ||
        reason instanceof LastFmUnavailableError ||
        reason instanceof LastFmInvalidResponseError
      ) {
        throw new RecommendationProviderUnavailableError(this.name, { cause: reason })
      }
      throw new RecommendationProviderUnavailableError(this.name, {
        cause: reason instanceof Error ? reason : undefined,
      })
    }

    const merged = new Map<string, RecommendationCandidate>()
    results.forEach((result, seedIndex) => {
      if (result.status !== 'fulfilled') return
      const weight = SEED_WEIGHTS[seedIndex] ?? 0.5
      result.value.forEach((track) => {
        const key = `${normalizeMusicText(track.name)}::${normalizeMusicText(track.artist.name)}`
        const score = track.match * weight
        const existing = merged.get(key)
        if (!existing || score > existing.score) {
          merged.set(key, {
            provider: this.name,
            title: track.name,
            artists: [track.artist.name],
            score,
          })
        }
      })
    })
    return [...merged.values()].sort((left, right) => right.score - left.score)
  }
}
