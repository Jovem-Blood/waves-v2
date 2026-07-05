import type { RecommendationProviderName } from './recommendation.types'

export class RecommendationProviderUnavailableError extends Error {
  readonly code = 'RECOMMENDATION_PROVIDER_UNAVAILABLE'

  constructor(
    readonly provider: RecommendationProviderName,
    options?: ErrorOptions,
  ) {
    super(`Recommendation provider ${provider} is unavailable`, options)
    this.name = 'RecommendationProviderUnavailableError'
  }
}

export class RecommendationUnavailableError extends Error {
  readonly code = 'RECOMMENDATION_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('All recommendation providers are unavailable', options)
    this.name = 'RecommendationUnavailableError'
  }
}

export class RecommendationMetadataUnavailableError extends Error {
  readonly code = 'RECOMMENDATION_METADATA_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Recommendation metadata resolution is unavailable', options)
    this.name = 'RecommendationMetadataUnavailableError'
  }
}
