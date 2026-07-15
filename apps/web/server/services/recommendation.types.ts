import type { AutoplaySuggestionStrategy, TrackMetadata } from '@waves/shared'

export type RecommendationProviderName = 'lastfm' | 'youtube_music'

export interface RecommendationCandidate {
  provider: RecommendationProviderName
  identityKey: string
  title: string
  artists: string[]
  score: number
  strategy: AutoplaySuggestionStrategy
  seedTrackKey: string
  sourceTag?: string
}

export interface RecommendationProvider {
  readonly name: RecommendationProviderName
  getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]>
}
