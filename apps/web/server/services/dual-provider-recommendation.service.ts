import type { TrackMetadata } from '@waves/shared'

import type { WavesLogger } from '../utils/logger'
import { useLogger } from '../utils/logger'
import {
  RecommendationMetadataUnavailableError,
  RecommendationProviderUnavailableError,
  RecommendationUnavailableError,
} from './recommendation.errors'
import type { RecommendationProvider } from './recommendation.types'
import type { SpotifyCandidateResolver } from './spotify-candidate-resolver.service'

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
    let unavailableProviders = 0
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
        const resolved = await this.spotifyResolver.resolve(candidates, excludedTrackIds)
        if (resolved) return [resolved]
      } catch (error) {
        if (error instanceof RecommendationMetadataUnavailableError) throw error
        unavailableProviders += 1
        this.logger.warn(
          {
            operation: 'recommendation.provider',
            provider: provider.name,
            outcome: 'unavailable',
            durationMs: this.now() - startedAt,
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
      throw new RecommendationUnavailableError()
    }
    return []
  }
}
