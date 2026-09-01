import { createHash } from 'node:crypto'

import type {
  AutoplayState,
  AutoplaySuggestionStrategy,
  CompletePlaybackInput,
  PlaybackTransitionResult,
  PlayerState,
  QueueItem,
  TrackMetadata,
} from '@waves/shared'

import type {
  AutoplayCandidateRepository,
  StoredRecommendationCandidate,
} from '../repositories/autoplay-candidate.repository'
import type {
  AutoplaySuggestionRepository,
  StoredAutoplaySuggestion,
} from '../repositories/autoplay-suggestion.repository'
import type { QueueRepository } from '../repositories/queue.repository'
import type { WavesLogger } from '../utils/logger'
import { useLogger } from '../utils/logger'
import { normalizeMusicText } from './audio-source-matching'
import { buildAutoplayExcludedTrackIds, RECENT_PLAYED_LIMIT } from './autoplay-exclusions'
import { AutoplaySessionProfile } from './autoplay-session-profile'
import type { AutoplayService } from './autoplay.service'
import {
  RecommendationMetadataUnavailableError,
  RecommendationUnavailableError,
} from './recommendation.errors'
import type { RecommendationCandidate } from './recommendation.types'
import type { PlayerStateService, SkipResult } from './player-state.service'
import type { QueueService } from './queue.service'

const TARGET_SUGGESTIONS = 6
const TARGET_CANDIDATES = 30
const REFILL_THRESHOLD = 12
const RESOLUTION_BUDGET = 12
const RESOLUTION_CONCURRENCY = 2
const STRATEGY_SLOTS: readonly AutoplaySuggestionStrategy[] = [
  'similar',
  'similar',
  'similar',
  'adjacent',
  'adjacent',
  'explore',
]

interface RecommendationEngine {
  getCandidates(seeds: readonly TrackMetadata[]): Promise<RecommendationCandidate[]>
  resolveCandidate(
    candidate: RecommendationCandidate,
    excludedTrackIds: ReadonlySet<string>,
  ): Promise<TrackMetadata | undefined>
}

interface RecommendationContext {
  humanAnchor?: TrackMetadata
  continuitySeed: TrackMetadata
  seeds: TrackMetadata[]
  fingerprint: string
}

export class AutoplayOrchestrator {
  private generationInFlight: Promise<void> | undefined
  private promotionInFlight:
    | Promise<ReturnType<PlayerStateService['promoteAutoplaySuggestion']>>
    | undefined
  private readonly profile = new AutoplaySessionProfile()

  constructor(
    private readonly autoplayService: AutoplayService,
    private readonly queueService: QueueService,
    private readonly queueRepository: QueueRepository,
    private readonly suggestionRepository: AutoplaySuggestionRepository,
    private readonly candidateRepository: AutoplayCandidateRepository,
    private readonly playerStateService: PlayerStateService,
    private readonly recommendationEngine: RecommendationEngine,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async queueChanged(): Promise<void> {
    this.generationInFlight ??= this.generateIfNeeded().finally(() => {
      this.generationInFlight = undefined
    })
    await this.generationInFlight
  }

  async completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult> {
    const activeBefore = this.queueService.list()
    const current = this.queueRepository.findById(input.queueItemId)
    const contextBefore = this.context(activeBefore)
    const wasEnabled = this.autoplayService.get().enabled
    if (wasEnabled) await this.safeQueueChanged()

    const completed = this.playerStateService.completePlayback(input)
    if (input.outcome === 'played' && current) this.profile.recordCompleted(current)
    if (completed.nextItem) {
      await this.safeQueueChanged()
      return completed
    }
    if (!wasEnabled || !this.autoplayService.get().enabled || !contextBefore) return completed

    const promoted = await this.promote(contextBefore.fingerprint)
    if (!promoted.item) return completed
    this.autoplayService.clearFailure()
    await this.safeQueueChanged()
    return {
      completedQueueItemId: completed.completedQueueItemId,
      player: promoted.player,
      queue: this.queueService.list(),
      nextItem: promoted.item,
    }
  }

  async skip(): Promise<SkipResult> {
    const activeBefore = this.queueService.list()
    const current = activeBefore.find(
      (item) => item.id === this.playerStateService.get().currentQueueItemId,
    )
    const contextBefore = this.context(activeBefore)
    if (this.autoplayService.get().enabled) await this.safeQueueChanged()

    const skipped = this.playerStateService.skip()
    if (current) this.profile.recordSkip(current)
    if (skipped.queue.length > 0 || !this.autoplayService.get().enabled || !contextBefore) {
      await this.safeQueueChanged()
      return skipped
    }

    const promoted = await this.promote(contextBefore.fingerprint)
    if (!promoted.item) return skipped
    await this.safeQueueChanged()
    return { player: promoted.player, queue: this.queueService.list() }
  }

  async rejectSuggestion(providerTrackId: string): Promise<AutoplayState> {
    const suggestion = this.suggestionRepository.findByProviderTrackId(providerTrackId)
    if (suggestion) {
      this.profile.reject(suggestion)
      this.suggestionRepository.removeByProviderTrackId(providerTrackId)
      this.suggestionRepository.compactPositions()
    }
    await this.safeQueueChanged()
    return this.autoplayService.get()
  }

  voiceDisconnected(guildId: string): PlayerState {
    const previousGuild = this.playerStateService.get().guildId
    const player = this.playerStateService.voiceDisconnected(guildId)
    if (!previousGuild || previousGuild === guildId) {
      this.profile.reset()
      this.suggestionRepository.clear()
      this.candidateRepository.clear()
    }
    return player
  }

  private async promote(fingerprint: string) {
    const suggestion = this.suggestionRepository.list()[0]
    this.promotionInFlight ??= Promise.resolve(
      this.playerStateService.promoteAutoplaySuggestion(fingerprint),
    ).finally(() => {
      this.promotionInFlight = undefined
    })
    const promoted = await this.promotionInFlight
    if (promoted.item && suggestion) this.profile.recordPromotion(suggestion)
    return promoted
  }

  private async safeQueueChanged(): Promise<void> {
    try {
      await this.queueChanged()
    } catch (error) {
      const failureCode =
        error instanceof RecommendationMetadataUnavailableError
          ? 'metadata_unavailable'
          : error instanceof RecommendationUnavailableError
            ? 'recommendation_unavailable'
            : 'invalid_response'
      this.autoplayService.recordFailure(failureCode)
      this.logger.warn(
        {
          operation: 'autoplay.suggestion',
          failureCode,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Autoplay recommendation failed',
      )
    }
  }

  private async generateIfNeeded(): Promise<void> {
    const state = this.autoplayService.get()
    if (!state.enabled) {
      this.suggestionRepository.clear()
      return
    }

    const active = this.queueService.list()
    const context = this.context(active)
    if (!context) {
      this.suggestionRepository.clear()
      if (active.length > 0) this.autoplayService.recordFailure('no_seeds')
      return
    }
    if (context.humanAnchor) this.profile.observeHumanInput(context.humanAnchor)

    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const blockedTracks = [...active, ...recent].map((item) => item.track)
    const storedSuggestions = this.suggestionRepository.list()
    const existing = this.validSuggestions(storedSuggestions, context.fingerprint, blockedTracks)
    if (this.suggestionsChanged(storedSuggestions, existing)) {
      this.suggestionRepository.replaceAll(existing)
    }

    let bank = this.candidateRepository
      .list()
      .filter(
        (candidate) =>
          candidate.seedFingerprint === context.fingerprint &&
          !this.candidateBlocked(candidate, blockedTracks, existing),
      )
    const continuityKey = `${context.continuitySeed.provider}:${context.continuitySeed.providerTrackId}`
    const needsEnrichment =
      bank.length < REFILL_THRESHOLD ||
      !bank.some((candidate) => candidate.seedTrackKey === continuityKey)

    if (needsEnrichment) {
      try {
        const fresh = await this.recommendationEngine.getCandidates(context.seeds)
        bank = this.mergeAndRankCandidates(bank, fresh, context, recent, blockedTracks, existing)
      } catch (error) {
        if (bank.length === 0 && existing.length === 0) throw error
        this.logger.warn(
          {
            operation: 'autoplay.candidates',
            outcome: 'retained_existing',
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
          'Candidate enrichment failed; retaining current reservoir',
        )
      }
    } else {
      bank = this.rankCandidates(bank, context, recent)
    }
    this.candidateRepository.replaceAll(bank.slice(0, TARGET_CANDIDATES))

    if (existing.length >= TARGET_SUGGESTIONS) {
      this.autoplayService.clearFailure()
      return
    }
    const filled = await this.fillSuggestions(existing, bank, context, active, recent)
    this.suggestionRepository.replaceAll(filled.suggestions)
    this.candidateRepository.replaceAll(filled.remainingCandidates)
    if (filled.suggestions.length === 0) {
      this.autoplayService.recordFailure('no_candidates')
      return
    }
    this.autoplayService.clearFailure()
  }

  private context(active: readonly QueueItem[]): RecommendationContext | undefined {
    if (active.length === 0) return undefined
    const player = this.playerStateService.get()
    if (!player.guildId) return undefined
    this.profile.begin(player.guildId)
    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const humanAnchor =
      [...active, ...recent]
        .filter((item) => item.origin === 'human')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.track ??
      this.profile.latestHumanAnchor()
    const continuitySeed = active.at(-1)?.track
    if (!continuitySeed) return undefined
    const seeds = [humanAnchor, continuitySeed]
      .filter((track): track is TrackMetadata => Boolean(track))
      .filter(
        (track, index, all) => all.findIndex((other) => this.isSameTrack(track, other)) === index,
      )
    const stableAnchor = humanAnchor ?? continuitySeed
    return {
      ...(humanAnchor === undefined ? {} : { humanAnchor }),
      continuitySeed,
      seeds,
      fingerprint: createHash('sha256')
        .update(`${player.guildId}|${this.trackIdentityKey(stableAnchor)}`)
        .digest('hex'),
    }
  }

  private validSuggestions(
    suggestions: readonly StoredAutoplaySuggestion[],
    fingerprint: string,
    blockedTracks: readonly TrackMetadata[],
  ): StoredAutoplaySuggestion[] {
    const valid: StoredAutoplaySuggestion[] = []
    for (const suggestion of suggestions) {
      if (suggestion.seedFingerprint !== fingerprint) continue
      if (this.profile.isRejected(suggestion.track)) continue
      if (blockedTracks.some((track) => this.isSameTrack(track, suggestion.track))) continue
      if (valid.some((item) => this.isSameTrack(item.track, suggestion.track))) continue
      valid.push(suggestion)
    }
    return valid
  }

  private mergeAndRankCandidates(
    current: readonly StoredRecommendationCandidate[],
    fresh: readonly RecommendationCandidate[],
    context: RecommendationContext,
    recent: readonly QueueItem[],
    blockedTracks: readonly TrackMetadata[],
    suggestions: readonly StoredAutoplaySuggestion[],
  ): StoredRecommendationCandidate[] {
    const merged = new Map<string, StoredRecommendationCandidate>()
    current.forEach((candidate) => merged.set(candidate.identityKey, candidate))
    fresh.forEach((candidate) => {
      if (this.candidateBlocked(candidate, blockedTracks, suggestions)) return
      const existing = merged.get(candidate.identityKey)
      const stored: StoredRecommendationCandidate = {
        ...candidate,
        score: Math.max(candidate.score, existing?.baseScore ?? -1),
        baseScore: Math.max(candidate.score, existing?.baseScore ?? -1),
        seedFingerprint: context.fingerprint,
        generatedAt: this.now().toISOString(),
      }
      merged.set(candidate.identityKey, stored)
    })
    return this.rankCandidates([...merged.values()], context, recent).slice(0, TARGET_CANDIDATES)
  }

  private rankCandidates(
    candidates: readonly StoredRecommendationCandidate[],
    context: RecommendationContext,
    recent: readonly QueueItem[],
  ): StoredRecommendationCandidate[] {
    const currentArtist = normalizeMusicText(context.continuitySeed.artists[0] ?? '')
    const recentArtists = recent
      .slice(0, 3)
      .map((item) => normalizeMusicText(item.track.artists[0] ?? ''))
    return candidates
      .map((candidate) => {
        const artist = normalizeMusicText(candidate.artists[0] ?? '')
        const sameArtistPenalty = artist && artist === currentArtist ? 0.08 : 0
        const recentPenalty = Math.min(
          0.16 - sameArtistPenalty,
          recentArtists.filter((recentArtist) => recentArtist === artist).length * 0.04,
        )
        return {
          ...candidate,
          score: Math.max(
            -1,
            Math.min(
              1,
              candidate.baseScore +
                this.profile.score(candidate) -
                sameArtistPenalty -
                recentPenalty,
            ),
          ),
        }
      })
      .sort((left, right) => right.score - left.score)
  }

  private async fillSuggestions(
    existing: readonly StoredAutoplaySuggestion[],
    candidates: readonly StoredRecommendationCandidate[],
    context: RecommendationContext,
    active: readonly QueueItem[],
    recent: readonly QueueItem[],
  ): Promise<{
    suggestions: StoredAutoplaySuggestion[]
    remainingCandidates: StoredRecommendationCandidate[]
  }> {
    const suggestions = [...existing]
    const remaining = [...candidates]
    const excluded = buildAutoplayExcludedTrackIds({
      active,
      recent,
      suggestions,
      rejected: this.profile.rejectedIds(),
      seeds: context.seeds,
    })
    const slots = this.remainingSlots(suggestions)
    let attempts = 0

    while (
      suggestions.length < TARGET_SUGGESTIONS &&
      remaining.length > 0 &&
      attempts < RESOLUTION_BUDGET
    ) {
      const batch: StoredRecommendationCandidate[] = []
      while (
        batch.length < RESOLUTION_CONCURRENCY &&
        remaining.length > 0 &&
        attempts < RESOLUTION_BUDGET
      ) {
        const slot = slots.shift()
        const picked = this.pickCandidate(remaining, slot)
        if (!picked) break
        remaining.splice(remaining.indexOf(picked), 1)
        batch.push(picked)
        attempts += 1
      }
      if (batch.length === 0) break

      const results = await Promise.allSettled(
        batch.map((candidate) => this.recommendationEngine.resolveCandidate(candidate, excluded)),
      )
      let resolvedAny = false
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value) return
        const candidate = batch[index]
        if (!candidate) return
        const track = result.value
        if (
          this.profile.isRejected(track) ||
          context.seeds.some((seed) => this.isSameTrack(seed, track)) ||
          [...active, ...recent].some((item) => this.isSameTrack(item.track, track)) ||
          suggestions.some((suggestion) => this.isSameTrack(suggestion.track, track))
        ) {
          return
        }
        suggestions.push({
          track,
          provider: 'spotify',
          generatedAt: this.now().toISOString(),
          seedFingerprint: context.fingerprint,
          strategy: candidate.strategy,
          ...(candidate.sourceTag === undefined ? {} : { sourceTag: candidate.sourceTag }),
        })
        excluded.add(track.providerTrackId)
        resolvedAny = true
      })
      const rejected = results.find((result) => result.status === 'rejected')
      if (!resolvedAny && rejected?.status === 'rejected' && remaining.length === 0) {
        throw rejected.reason
      }
    }
    return { suggestions, remainingCandidates: remaining }
  }

  private remainingSlots(
    suggestions: readonly StoredAutoplaySuggestion[],
  ): AutoplaySuggestionStrategy[] {
    const slots = [...STRATEGY_SLOTS]
    suggestions.forEach((suggestion) => {
      const index = slots.indexOf(suggestion.strategy)
      if (index >= 0) slots.splice(index, 1)
    })
    return slots
  }

  private pickCandidate(
    candidates: readonly StoredRecommendationCandidate[],
    strategy: AutoplaySuggestionStrategy | undefined,
  ): StoredRecommendationCandidate | undefined {
    const matching = strategy
      ? candidates.filter((candidate) => candidate.strategy === strategy)
      : []
    const pool = (matching.length > 0 ? matching : candidates)
      .slice()
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
    if (pool.length === 0) return undefined
    const minimum = Math.min(...pool.map((candidate) => candidate.score))
    const weighted = pool.map((candidate) => ({
      candidate,
      weight: candidate.score - minimum + 0.05,
    }))
    const total = weighted.reduce((sum, item) => sum + item.weight, 0)
    let cursor = this.random() * total
    for (const item of weighted) {
      cursor -= item.weight
      if (cursor <= 0) return item.candidate
    }
    return weighted.at(-1)?.candidate
  }

  private candidateBlocked(
    candidate: RecommendationCandidate,
    blockedTracks: readonly TrackMetadata[],
    suggestions: readonly StoredAutoplaySuggestion[],
  ): boolean {
    if (this.profile.rejectedIds().has(candidate.identityKey)) return true
    const candidateTrack = { title: candidate.title, artists: candidate.artists }
    return (
      blockedTracks.some((track) => this.trackIdentityKey(track) === candidate.identityKey) ||
      suggestions.some(
        (suggestion) => this.trackIdentityKey(suggestion.track) === candidate.identityKey,
      ) ||
      candidateTrack.artists.length === 0
    )
  }

  private suggestionsChanged(
    previous: readonly StoredAutoplaySuggestion[],
    next: readonly StoredAutoplaySuggestion[],
  ): boolean {
    if (previous.length !== next.length) return true
    return previous.some((suggestion, index) => {
      const replacement = next[index]
      return (
        !replacement ||
        suggestion.track.providerTrackId !== replacement.track.providerTrackId ||
        suggestion.seedFingerprint !== replacement.seedFingerprint ||
        suggestion.strategy !== replacement.strategy
      )
    })
  }

  private isSameTrack(left: TrackMetadata, right: TrackMetadata): boolean {
    if (left.providerTrackId === right.providerTrackId) return true
    if (left.isrc && right.isrc && left.isrc === right.isrc) return true
    return this.trackIdentityKey(left) === this.trackIdentityKey(right)
  }

  private trackIdentityKey(track: Pick<TrackMetadata, 'title' | 'artists'>): string {
    return `${normalizeMusicText(track.title)}::${normalizeMusicText(track.artists[0] ?? '')}`
  }
}
