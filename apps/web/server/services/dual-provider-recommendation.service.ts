import type { TrackMetadata } from '@waves/shared'

import type { WavesLogger } from '../utils/logger'
import { useLogger } from '../utils/logger'
import {
  RecommendationMetadataUnavailableError,
  RecommendationProviderUnavailableError,
  RecommendationUnavailableError,
} from './recommendation.errors'
import type { RecommendationCandidate, RecommendationProvider } from './recommendation.types'
import type { SpotifyCandidateResolver } from './spotify-candidate-resolver.service'

const TARGET_RECOMMENDATIONS = 6

export class DualProviderRecommendationService {
  constructor(
    private readonly providers: readonly RecommendationProvider[],
    private readonly spotifyResolver: SpotifyCandidateResolver,
    private readonly now: () => number = Date.now,
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async getRecommendations(
    seeds: readonly TrackMetadata[],
    excludedTrackIds: ReadonlySet<string>,
  ): Promise<TrackMetadata[]> {
    const candidates = await this.getCandidates(seeds)
    const resolved: TrackMetadata[] = []
    const excluded = new Set(excludedTrackIds)
    for (const candidate of candidates) {
      if (resolved.length >= TARGET_RECOMMENDATIONS) break
      const track = await this.resolveCandidate(candidate, excluded)
      if (!track) continue
      resolved.push(track)
      excluded.add(track.providerTrackId)
    }
    return resolved
  }

  async getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]> {
    let unavailableProviders = 0
    let lastProviderError: unknown
    const aggregated: RecommendationCandidate[] = []
    for (const provider of this.providers) {
      const startedAt = this.now()
      try {
        const candidates = await provider.getCandidates(seeds)
        this.logger.info(
          {
            operation: 'recommendation.provider',
            provider: provider.name,
            outcome: candidates.length > 0 ? 'candidates' : 'empty',
            candidateCount: candidates.length,
            durationMs: this.now() - startedAt,
          },
          'Recommendation provider completed',
        )
        candidates.forEach((candidate) => {
          if (!aggregated.some((existing) => existing.identityKey === candidate.identityKey)) {
            aggregated.push(candidate)
          }
        })
        if (aggregated.length >= 30) return aggregated.slice(0, 30)
      } catch (error) {
        if (error instanceof RecommendationMetadataUnavailableError) throw error
        unavailableProviders += 1
        lastProviderError = error
        this.logger.warn(
          {
            operation: 'recommendation.provider',
            provider: provider.name,
            outcome: 'unavailable',
            durationMs: this.now() - startedAt,
            err: error,
            errorCode:
              error instanceof RecommendationProviderUnavailableError
                ? error.code
                : 'RECOMMENDATION_PROVIDER_FAILED',
          },
          'Recommendation provider failed safely',
        )
      }
    }

    if (unavailableProviders === this.providers.length) {
      throw new RecommendationUnavailableError({
        ...(lastProviderError === undefined ? {} : { cause: lastProviderError }),
      })
    }
    return aggregated.slice(0, 30)
  }

  async resolveCandidate(
    candidate: RecommendationCandidate,
    excludedTrackIds: ReadonlySet<string>,
  ): Promise<TrackMetadata | undefined> {
    return this.spotifyResolver.resolve([candidate], excludedTrackIds)
  }
}
