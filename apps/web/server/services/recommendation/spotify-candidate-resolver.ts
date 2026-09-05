import type { TrackMetadata } from '@waves/shared'

import {
  SpotifyAuthenticationError,
  SpotifyConfigurationError,
  SpotifyInvalidResponseError,
  SpotifyUnavailableError,
} from '../../clients/spotify.errors'
import { normalizeMusicText } from '../audio-source/matching'
import { RecommendationMetadataUnavailableError } from './errors'
import type { RecommendationCandidate } from './types'
interface SpotifySearchProvider {
  searchTracks(query: string): Promise<TrackMetadata[]>
}

const BLOCKED_QUALIFIERS = [
  'cover',
  'karaoke',
  'tribute',
  'remix',
  'remaster',
  'live',
  'instrumental',
  'slowed',
  'sped up',
] as const

function hasBlockedQualifier(title: string): boolean {
  const normalized = normalizeMusicText(title)
  return BLOCKED_QUALIFIERS.some((qualifier) => normalized.includes(qualifier))
}

function isStrictMatch(candidate: RecommendationCandidate, track: TrackMetadata): boolean {
  const primaryArtist = candidate.artists[0]
  return Boolean(
    primaryArtist &&
    normalizeMusicText(candidate.title) === normalizeMusicText(track.title) &&
    track.artists.some(
      (artist) => normalizeMusicText(primaryArtist) === normalizeMusicText(artist),
    ),
  )
}

export class SpotifyCandidateResolver {
  constructor(private readonly spotifyService: SpotifySearchProvider) {}

  async resolve(
    candidates: readonly RecommendationCandidate[],
    excludedTrackIds: ReadonlySet<string>,
  ): Promise<TrackMetadata | undefined> {
    try {
      for (const candidate of candidates.slice(0, 10)) {
        if (hasBlockedQualifier(candidate.title)) continue
        const results = await this.spotifyService.searchTracks(
          `track:"${candidate.title}" artist:"${candidate.artists[0] ?? ''}"`,
        )
        const exact = results.filter(
          (track) =>
            isStrictMatch(candidate, track) && !excludedTrackIds.has(track.providerTrackId),
        )
        const distinct = new Map(exact.map((track) => [track.providerTrackId, track]))
        if (distinct.size === 1) return distinct.values().next().value
        const exactTracks = [...distinct.values()]
        const isrcs = new Set(exactTracks.flatMap((track) => (track.isrc ? [track.isrc] : [])))
        if (exactTracks.length > 1 && isrcs.size === 1) return exactTracks[0]
      }
      return undefined
    } catch (error) {
      if (
        error instanceof SpotifyConfigurationError ||
        error instanceof SpotifyAuthenticationError ||
        error instanceof SpotifyUnavailableError ||
        error instanceof SpotifyInvalidResponseError
      ) {
        throw new RecommendationMetadataUnavailableError({ cause: error })
      }
      throw error
    }
  }
}
