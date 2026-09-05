import type { TrackMetadata } from '@waves/shared'

import {
  LastFmConfigurationError,
  LastFmInvalidResponseError,
  LastFmUnavailableError,
} from '../../clients/lastfm.errors'
import type { LastFmClientPort } from '../../clients/lastfm.client'
import { normalizeMusicText } from '../audio-source/matching'
import { RecommendationProviderUnavailableError } from './errors'
import type { RecommendationCandidate, RecommendationProvider } from './types'

const SIMILAR_LIMIT = 14
const ADJACENT_LIMIT = 10
const EXPLORE_LIMIT = 6

function trackKey(title: string, artist: string): string {
  return `${normalizeMusicText(title)}::${normalizeMusicText(artist)}`
}

function seedKey(seed: TrackMetadata): string {
  return `${seed.provider}:${seed.providerTrackId}`
}

function providerError(reason: unknown): RecommendationProviderUnavailableError {
  const known =
    reason instanceof LastFmConfigurationError ||
    reason instanceof LastFmUnavailableError ||
    reason instanceof LastFmInvalidResponseError
  return new RecommendationProviderUnavailableError('lastfm', {
    cause: known ? reason : reason instanceof Error ? reason : undefined,
  })
}

export class LastFmRecommendationProvider implements RecommendationProvider {
  readonly name = 'lastfm' as const

  constructor(private readonly client: LastFmClientPort) {}

  async getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]> {
    const selectedSeeds = seeds.slice(0, 2)
    if (selectedSeeds.length === 0) return []
    const candidates = new Map<string, RecommendationCandidate>()
    const failures: unknown[] = []
    let successfulCalls = 0

    const weights = selectedSeeds.length === 1 ? [1] : [0.6, 0.4]
    const directResults = await Promise.allSettled(
      selectedSeeds.map((seed) => this.client.getSimilarTracks(seed, 20)),
    )
    directResults.forEach((result, seedIndex) => {
      if (result.status === 'rejected') {
        failures.push(result.reason)
        return
      }
      successfulCalls += 1
      const seed = selectedSeeds[seedIndex]
      if (!seed) return
      const weight = weights[seedIndex] ?? 0.4
      result.value.forEach((track) => {
        const identityKey = trackKey(track.name, track.artist.name)
        const score = Math.min(1, track.match) * weight
        const existing = candidates.get(identityKey)
        candidates.set(identityKey, {
          provider: this.name,
          identityKey,
          title: existing?.title ?? track.name,
          artists: existing?.artists ?? [track.artist.name],
          score: Math.min(1, (existing?.score ?? 0) + score),
          strategy: 'similar',
          seedTrackKey: seedKey(seed),
        })
      })
    })

    const continuitySeed = selectedSeeds.at(-1)
    const artist = continuitySeed?.artists[0]
    if (continuitySeed && artist) {
      const infoResult = await Promise.allSettled([this.client.getArtistInfo(artist)])
      const info = infoResult[0]
      if (info?.status === 'fulfilled') {
        successfulCalls += 1
        const relatedArtists = (info.value.similar?.artist ?? []).slice(0, 3)
        const adjacentResults = await Promise.allSettled(
          relatedArtists.map((related) => this.client.getArtistTopTracks(related.name, 4)),
        )
        adjacentResults.forEach((result, artistIndex) => {
          if (result.status === 'rejected') {
            failures.push(result.reason)
            return
          }
          successfulCalls += 1
          result.value.forEach((track, trackIndex) => {
            const trackArtist = track.artist?.name ?? relatedArtists[artistIndex]?.name
            if (!trackArtist) return
            const identityKey = trackKey(track.name, trackArtist)
            if (candidates.has(identityKey)) return
            candidates.set(identityKey, {
              provider: this.name,
              identityKey,
              title: track.name,
              artists: [trackArtist],
              score: Math.max(0.35, 0.78 - artistIndex * 0.08 - trackIndex * 0.03),
              strategy: 'adjacent',
              seedTrackKey: seedKey(continuitySeed),
            })
          })
        })

        const primaryTag = info.value.tags?.tag[0]?.name
        if (primaryTag) {
          const similarTagResult = await Promise.allSettled([
            this.client.getSimilarTags(primaryTag),
          ])
          const similarTags = similarTagResult[0]
          if (similarTags?.status === 'fulfilled') {
            successfulCalls += 1
            const sourceTag =
              similarTags.value.find(
                (tag) => normalizeMusicText(tag.name) !== normalizeMusicText(primaryTag),
              )?.name ?? primaryTag
            const tagTracksResult = await Promise.allSettled([
              this.client.getTagTopTracks(sourceTag, 10),
            ])
            const tagTracks = tagTracksResult[0]
            if (tagTracks?.status === 'fulfilled') {
              successfulCalls += 1
              tagTracks.value.forEach((track, index) => {
                const trackArtist = track.artist?.name
                if (!trackArtist) return
                const identityKey = trackKey(track.name, trackArtist)
                if (candidates.has(identityKey)) return
                candidates.set(identityKey, {
                  provider: this.name,
                  identityKey,
                  title: track.name,
                  artists: [trackArtist],
                  score: Math.max(0.25, 0.62 - index * 0.025),
                  strategy: 'explore',
                  seedTrackKey: seedKey(continuitySeed),
                  sourceTag,
                })
              })
            } else if (tagTracks?.status === 'rejected') {
              failures.push(tagTracks.reason)
            }
          } else if (similarTags?.status === 'rejected') {
            failures.push(similarTags.reason)
          }
        }
      } else if (info?.status === 'rejected') {
        failures.push(info.reason)
      }
    }

    if (successfulCalls === 0 && failures.length > 0) throw providerError(failures[0])

    const ranked = [...candidates.values()].sort((left, right) => right.score - left.score)
    const take = (strategy: RecommendationCandidate['strategy'], limit: number) =>
      ranked.filter((candidate) => candidate.strategy === strategy).slice(0, limit)
    return [
      ...take('similar', SIMILAR_LIMIT),
      ...take('adjacent', ADJACENT_LIMIT),
      ...take('explore', EXPLORE_LIMIT),
    ]
  }
}
