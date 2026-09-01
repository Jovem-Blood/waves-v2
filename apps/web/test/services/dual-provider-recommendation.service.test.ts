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

function candidate(name: string, providerName: RecommendationProvider['name'] = 'lastfm') {
  return {
    provider: providerName,
    identityKey: `${name.toLowerCase()}::a`,
    title: name,
    artists: ['A'],
    score: 1,
    strategy: providerName === 'youtube_music' ? ('fallback' as const) : ('similar' as const),
    seedTrackKey: 'spotify:seed',
  }
}

describe('DualProviderRecommendationService', () => {
  it('aggregates partial provider pools and removes duplicate identities', async () => {
    const duplicate = candidate('Result', 'youtube_music')
    const lastFm = provider('lastfm', [candidate('Result')])
    const youtube = provider('youtube_music', [duplicate, candidate('Fallback', 'youtube_music')])
    const service = new DualProviderRecommendationService([lastFm, youtube], { resolve: vi.fn() })

    await expect(service.getCandidates([seed])).resolves.toEqual([
      candidate('Result'),
      candidate('Fallback', 'youtube_music'),
    ])
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
    await expect(failed.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationUnavailableError,
    )

    const exhausted = new DualProviderRecommendationService(
      [unavailable('lastfm'), provider('youtube_music', [])],
      { resolve: vi.fn().mockResolvedValue(undefined) },
    )
    await expect(exhausted.getCandidates([seed])).resolves.toEqual([])
  })

  it('stops provider aggregation when metadata is unavailable', async () => {
    const youtube = provider('youtube_music', [])
    const service = new DualProviderRecommendationService(
      [provider('lastfm', new RecommendationMetadataUnavailableError()), youtube],
      { resolve: vi.fn() },
    )

    await expect(service.getCandidates([seed])).rejects.toBeInstanceOf(
      RecommendationMetadataUnavailableError,
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).not.toHaveBeenCalled()
  })

  it('delegates candidate resolution without owning recommendation iteration', async () => {
    const resolver = { resolve: vi.fn().mockResolvedValue(resolved) }
    const service = new DualProviderRecommendationService([], resolver)
    const recommendation = candidate('Result')
    const excluded = new Set(['existing'])

    await expect(service.resolveCandidate(recommendation, excluded)).resolves.toEqual(resolved)
    expect(resolver.resolve).toHaveBeenCalledWith([recommendation], excluded)
  })
})
