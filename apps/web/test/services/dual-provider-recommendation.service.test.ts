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
  it('uses a partial Last.fm pool and asks YouTube for fallback candidates', async () => {
    const lastFm = provider('lastfm', [candidate('Result')])
    const youtube = provider('youtube_music', [])
    const resolver = {
      resolve: vi.fn().mockResolvedValueOnce(resolved).mockResolvedValueOnce(undefined),
    }
    const service = new DualProviderRecommendationService([lastFm, youtube], resolver)

    await expect(service.getRecommendations([seed], new Set())).resolves.toEqual([resolved])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).toHaveBeenCalledOnce()
  })

  it('falls back to YouTube when Last.fm has no usable Spotify match', async () => {
    const lastFm = provider('lastfm', [candidate('Bad')])
    const youtube = provider('youtube_music', [candidate('Result', 'youtube_music')])
    const resolver = {
      resolve: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(resolved)
        .mockResolvedValueOnce(undefined),
    }
    const service = new DualProviderRecommendationService([lastFm, youtube], resolver)

    await expect(service.getRecommendations([seed], new Set())).resolves.toEqual([resolved])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).toHaveBeenCalledOnce()
  })

  it('returns resolved Spotify recommendations from one provider', async () => {
    const first = resolved
    const second = { ...seed, id: 'spotify:second', providerTrackId: 'second', title: 'Second' }
    const third = { ...seed, id: 'spotify:third', providerTrackId: 'third', title: 'Third' }
    const lastFm = provider('lastfm', [
      candidate('Result'),
      candidate('Second'),
      candidate('Third'),
    ])
    const resolver = {
      resolve: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
        .mockResolvedValueOnce(third),
    }
    const service = new DualProviderRecommendationService([lastFm], resolver)

    await expect(service.getRecommendations([seed], new Set())).resolves.toEqual([
      first,
      second,
      third,
    ])
    expect(resolver.resolve).toHaveBeenCalledTimes(3)
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
      [provider('lastfm', [candidate('X')]), youtube],
      { resolve: vi.fn().mockRejectedValue(new RecommendationMetadataUnavailableError()) },
    )
    await expect(service.getRecommendations([seed], new Set())).rejects.toBeInstanceOf(
      RecommendationMetadataUnavailableError,
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(youtube.getCandidates).toHaveBeenCalledOnce()
  })
})
