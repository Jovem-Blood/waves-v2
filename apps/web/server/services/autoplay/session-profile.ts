import type { AutoplaySuggestionStrategy, QueueItem, TrackMetadata } from '@waves/shared'

import type { StoredAutoplaySuggestion } from '../../repositories/autoplay-suggestion.repository'
import { normalizeMusicText } from '../audio-source/matching'
import type { RecommendationCandidate } from '../recommendation/types'

const MIN_COMPLETIONS = 20
const MIN_UNIQUE_ARTISTS = 8
const MIN_HUMAN_INPUTS = 5

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

function identity(track: Pick<TrackMetadata, 'title' | 'artists'>): string {
  return `${normalizeMusicText(track.title)}::${normalizeMusicText(track.artists[0] ?? '')}`
}

export class AutoplaySessionProfile {
  private guildId: string | undefined
  private readonly trackScores = new Map<string, number>()
  private readonly artistScores = new Map<string, number>()
  private readonly tagScores = new Map<string, number>()
  private readonly strategyScores = new Map<AutoplaySuggestionStrategy, number>()
  private readonly completionArtistCounts = new Map<string, number>()
  private readonly humanArtistCounts = new Map<string, number>()
  private readonly completionTagCounts = new Map<string, number>()
  private readonly rejectedTracks = new Set<string>()
  private readonly completedArtists = new Set<string>()
  private readonly observedHumanTracks = new Set<string>()
  private readonly promotedMetadata = new Map<
    string,
    { strategy: AutoplaySuggestionStrategy; sourceTag?: string }
  >()
  private humanAnchor: TrackMetadata | undefined
  private completions = 0

  begin(guildId: string | null): void {
    if (!guildId) return
    if (this.guildId && this.guildId !== guildId) this.reset()
    this.guildId = guildId
  }

  reset(): void {
    this.guildId = undefined
    this.trackScores.clear()
    this.artistScores.clear()
    this.tagScores.clear()
    this.strategyScores.clear()
    this.completionArtistCounts.clear()
    this.humanArtistCounts.clear()
    this.completionTagCounts.clear()
    this.rejectedTracks.clear()
    this.completedArtists.clear()
    this.observedHumanTracks.clear()
    this.promotedMetadata.clear()
    this.humanAnchor = undefined
    this.completions = 0
  }

  observeHumanInput(track: TrackMetadata): void {
    this.humanAnchor = track
    const trackIdentity = identity(track)
    if (this.observedHumanTracks.has(trackIdentity)) return
    this.observedHumanTracks.add(trackIdentity)
    this.increment(this.humanArtistCounts, normalizeMusicText(track.artists[0] ?? ''))
  }

  latestHumanAnchor(): TrackMetadata | undefined {
    return this.humanAnchor
  }

  recordCompleted(item: QueueItem): void {
    this.completions += 1
    const artist = normalizeMusicText(item.track.artists[0] ?? '')
    if (artist) this.completedArtists.add(artist)
    this.increment(this.completionArtistCounts, artist)
    if (item.origin !== 'autoplay') return
    const promoted = this.promotedMetadata.get(identity(item.track))
    this.adjust(this.trackScores, identity(item.track), 0.1)
    this.adjust(this.artistScores, artist, 0.05)
    const sourceTag = promoted?.sourceTag
    const strategy = promoted?.strategy
    if (sourceTag) {
      const normalizedTag = normalizeMusicText(sourceTag)
      this.adjust(this.tagScores, normalizedTag, 0.03)
      this.increment(this.completionTagCounts, normalizedTag)
    }
    if (strategy) this.adjust(this.strategyScores, strategy, 0.03)
    this.promotedMetadata.delete(identity(item.track))
  }

  recordPromotion(suggestion: StoredAutoplaySuggestion): void {
    this.promotedMetadata.set(identity(suggestion.track), {
      strategy: suggestion.strategy,
      ...(suggestion.sourceTag === undefined ? {} : { sourceTag: suggestion.sourceTag }),
    })
  }

  recordSkip(item: QueueItem): void {
    if (item.origin !== 'autoplay') return
    this.adjust(this.trackScores, identity(item.track), -0.35)
    this.adjust(this.artistScores, normalizeMusicText(item.track.artists[0] ?? ''), -0.08)
  }

  reject(suggestion: StoredAutoplaySuggestion): void {
    const trackIdentity = identity(suggestion.track)
    this.rejectedTracks.add(trackIdentity)
    this.rejectedTracks.add(suggestion.track.providerTrackId)
    this.adjust(this.artistScores, normalizeMusicText(suggestion.track.artists[0] ?? ''), -0.15)
    if (suggestion.sourceTag) {
      this.adjust(this.tagScores, normalizeMusicText(suggestion.sourceTag), -0.1)
    }
    this.adjust(this.strategyScores, suggestion.strategy, -0.05)
  }

  isRejected(track: TrackMetadata): boolean {
    return (
      this.rejectedTracks.has(track.providerTrackId) || this.rejectedTracks.has(identity(track))
    )
  }

  rejectedIds(): ReadonlySet<string> {
    return this.rejectedTracks
  }

  score(candidate: RecommendationCandidate): number {
    const trackScore = this.trackScores.get(candidate.identityKey) ?? 0
    const artistScore = this.artistScores.get(normalizeMusicText(candidate.artists[0] ?? '')) ?? 0
    const tagScore = candidate.sourceTag
      ? (this.tagScores.get(normalizeMusicText(candidate.sourceTag)) ?? 0)
      : 0
    const strategyScore = this.strategyScores.get(candidate.strategy) ?? 0
    const aggregateScore = this.aggregateActive()
      ? Math.min(
          0.15,
          ((this.completionArtistCounts.get(normalizeMusicText(candidate.artists[0] ?? '')) ?? 0) /
            Math.max(this.completions, 1)) *
            0.1 +
            ((this.humanArtistCounts.get(normalizeMusicText(candidate.artists[0] ?? '')) ?? 0) /
              Math.max(this.observedHumanTracks.size, 1)) *
              0.1 +
            (candidate.sourceTag
              ? ((this.completionTagCounts.get(normalizeMusicText(candidate.sourceTag)) ?? 0) /
                  Math.max(this.completions, 1)) *
                0.05
              : 0),
        )
      : 0
    const raw = trackScore + artistScore + tagScore + strategyScore + aggregateScore
    return Math.max(-0.3, Math.min(0.2, raw))
  }

  private aggregateActive(): boolean {
    return (
      this.completions >= MIN_COMPLETIONS &&
      this.completedArtists.size >= MIN_UNIQUE_ARTISTS &&
      this.observedHumanTracks.size >= MIN_HUMAN_INPUTS
    )
  }

  private adjust<K>(scores: Map<K, number>, key: K, delta: number): void {
    if (typeof key === 'string' && key.length === 0) return
    scores.set(key, clamp((scores.get(key) ?? 0) + delta))
  }

  private increment(scores: Map<string, number>, key: string): void {
    if (!key) return
    scores.set(key, (scores.get(key) ?? 0) + 1)
  }
}
