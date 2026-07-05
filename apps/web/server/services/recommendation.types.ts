import type { TrackMetadata } from '@waves/shared'

export type RecommendationProviderName = 'lastfm' | 'youtube_music'

export interface RecommendationCandidate {
  provider: RecommendationProviderName
  title: string
  artists: string[]
  score: number
}

export interface RecommendationProvider {
  readonly name: RecommendationProviderName
  getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]>
}
