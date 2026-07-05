import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { DualProviderRecommendationService } from '../../server/services/dual-provider-recommendation.service'
import {
  RecommendationMetadataUnavailableError,
  RecommendationProviderUnavailableError,
  RecommendationUnavailableError,
} from '../../server/services/recommendation.errors'
import type { RecommendationProvider } from '../../server/services/recommendation.types'

const seed: TrackMetadata = {
  id: 'spotify:seed',
  provider: 'spotify',
  providerTrackId: 'seed',
  title: 'Seed',
  artists: ['Artist'],
  durationMs: 180_000,
}
const resolved = { ...seed, id: 'spotify:result', providerTrackId: 'result', title: 'Result' }

function provider(name: RecommendationProvider['name'], result: unknown): RecommendationProvider {
  return {
    name,
    getCandidates:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  }
}

describe('DualProviderRecommendationService', () => {
  it('uses Last.fm without calling YouTube when Spotify resolves it', async () => {
    const lastFm = provider('lastfm', [
      { provider: 'lastfm', title: 'Result', artists: ['A'], score: 1 },
    ])
    const youtube = provider('youtube_music', [])
    const resolver = { resolve: vi.fn().mockResolvedValue(resolved) }
    const service = new DualProviderRecommendationService([lastFm, youtube], resolver)

    await expect(service.getRecommendations([seed], new Set())).resolves.toEqual([resolved])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).not.toHaveBeenCalled()
  })

  it('falls back to YouTube when Last.fm has no usable Spotify match', async () => {
    const lastFm = provider('lastfm', [
      { provider: 'lastfm', title: 'Bad', artists: ['A'], score: 1 },
    ])
    const youtube = provider('youtube_music', [
      { provider: 'youtube_music', title: 'Result', artists: ['A'], score: 1 },
    ])
    const resolver = {
      resolve: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(resolved),
    }
    const service = new DualProviderRecommendationService([lastFm, youtube], resolver)

    await expect(service.getRecommendations([seed], new Set())).resolves.toEqual([resolved])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).toHaveBeenCalledOnce()
  })

  it('distinguishes total provider failure from valid exhaustion', async () => {
    const unavailable = (name: RecommendationProvider['name']) =>
      provider(name, new RecommendationProviderUnavailableError(name))
    const failed = new DualProviderRecommendationService(
      [unavailable('lastfm'), unavailable('youtube_music')],
      { resolve: vi.fn() },
    )
    await expect(failed.getRecommendations([seed], new Set())).rejects.toBeInstanceOf(
      RecommendationUnavailableError,
    )

    const exhausted = new DualProviderRecommendationService(
      [unavailable('lastfm'), provider('youtube_music', [])],
      { resolve: vi.fn().mockResolvedValue(undefined) },
    )
    await expect(exhausted.getRecommendations([seed], new Set())).resolves.toEqual([])
  })

  it('does not try the fallback when Spotify metadata is unavailable', async () => {
    const youtube = provider('youtube_music', [])
    const service = new DualProviderRecommendationService(
      [provider('lastfm', [{ provider: 'lastfm', title: 'X', artists: ['A'], score: 1 }]), youtube],
      { resolve: vi.fn().mockRejectedValue(new RecommendationMetadataUnavailableError()) },
    )
    await expect(service.getRecommendations([seed], new Set())).rejects.toBeInstanceOf(
      RecommendationMetadataUnavailableError,
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).not.toHaveBeenCalled()
  })
})
