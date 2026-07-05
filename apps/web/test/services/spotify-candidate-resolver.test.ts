import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { SpotifyUnavailableError } from '../../server/clients/spotify.errors'
import { RecommendationMetadataUnavailableError } from '../../server/services/recommendation.errors'
import type { RecommendationCandidate } from '../../server/services/recommendation.types'
import { SpotifyCandidateResolver } from '../../server/services/spotify-candidate-resolver.service'

const candidate: RecommendationCandidate = {
  provider: 'lastfm',
  title: 'Exact Song',
  artists: ['Exact Artist'],
  score: 1,
}
const track: TrackMetadata = {
  id: 'spotify:exact',
  provider: 'spotify',
  providerTrackId: 'exact',
  title: 'Exact Song',
  artists: ['Exact Artist'],
  durationMs: 180_000,
}

describe('SpotifyCandidateResolver', () => {
  it('returns a unique strict title and artist match', async () => {
    const searchTracks = vi.fn().mockResolvedValue([track])
    const resolver = new SpotifyCandidateResolver({ searchTracks })

    await expect(resolver.resolve([candidate], new Set())).resolves.toEqual(track)
    expect(searchTracks).toHaveBeenCalledWith('track:"Exact Song" artist:"Exact Artist"')
  })

  it('rejects qualifiers, artist mismatches, ambiguity and recent tracks', async () => {
    const searchTracks = vi
      .fn()
      .mockResolvedValueOnce([track])
      .mockResolvedValueOnce([{ ...track, artists: ['Someone Else'] }])
      .mockResolvedValueOnce([track, { ...track, id: 'spotify:other', providerTrackId: 'other' }])
    const resolver = new SpotifyCandidateResolver({ searchTracks })

    await expect(
      resolver.resolve([{ ...candidate, title: 'Exact Song Remix' }], new Set()),
    ).resolves.toBeUndefined()
    await expect(resolver.resolve([candidate], new Set(['exact']))).resolves.toBeUndefined()
    await expect(resolver.resolve([candidate], new Set())).resolves.toBeUndefined()
    await expect(resolver.resolve([candidate], new Set())).resolves.toBeUndefined()
  })

  it('accepts duplicate Spotify releases only when their ISRC agrees', async () => {
    const duplicate = { ...track, id: 'spotify:duplicate', providerTrackId: 'duplicate' }
    const resolver = new SpotifyCandidateResolver({
      searchTracks: vi.fn().mockResolvedValue([
        { ...track, isrc: 'USAAA1234567' },
        { ...duplicate, isrc: 'USAAA1234567' },
      ]),
    })
    await expect(resolver.resolve([candidate], new Set())).resolves.toMatchObject({
      providerTrackId: 'exact',
    })
  })

  it('maps Spotify outages to metadata unavailable', async () => {
    const resolver = new SpotifyCandidateResolver({
      searchTracks: vi.fn().mockRejectedValue(new SpotifyUnavailableError('search')),
    })
    await expect(resolver.resolve([candidate], new Set())).rejects.toBeInstanceOf(
      RecommendationMetadataUnavailableError,
    )
  })
})
