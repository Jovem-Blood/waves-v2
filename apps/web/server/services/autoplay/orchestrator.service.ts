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
} from '../../repositories/autoplay-candidate.repository'
import type {
  AutoplaySuggestionRepository,
  StoredAutoplaySuggestion,
} from '../../repositories/autoplay-suggestion.repository'
import type { QueueRepository } from '../../repositories/queue.repository'
import type { TrackPlaybackHealthRepository } from '../../repositories/track-playback-health.repository'
import type { WavesLogger } from '../../utils/logger'
import { useLogger } from '../../utils/logger'
import { normalizeMusicText } from '../audio-source/matching'
import { RECENT_PLAYED_LIMIT } from '../playback/constants'
import type { PlayerStateService, SkipResult } from '../playback/player-state.service'
import {
  RecommendationMetadataUnavailableError,
  RecommendationUnavailableError,
} from '../recommendation/errors'
import type { RecommendationCandidate } from '../recommendation/types'
import type { QueueService } from '../queue/service'
import { buildAutoplayExcludedTrackIds } from './exclusions'
import type { AutoplayService } from './service'
import { AutoplaySessionProfile } from './session-profile'

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
  private recoveryPending = false
  private nextRetryAt = 0
  private retryCount = 0

  constructor(
    private readonly autoplayService: AutoplayService,
    private readonly queueService: QueueService,
    private readonly queueRepository: QueueRepository,
    private readonly suggestionRepository: AutoplaySuggestionRepository,
    private readonly candidateRepository: AutoplayCandidateRepository,
    private readonly trackHealthRepository: TrackPlaybackHealthRepository,
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

  async refresh(): Promise<void> {
    await this.safeQueueChanged()
  }

  async retryIfNeeded(): Promise<void> {
    const state = this.autoplayService.get()
    if (
      state.enabled &&
      !this.recoveryPending &&
      state.failureCode &&
      this.queueService.list().length === 0 &&
      this.queueRepository.listRecentTerminal(1).length > 0
    ) {
      this.recoveryPending = true
    }
    if (
      !state.enabled ||
      (!this.recoveryPending && state.suggestions.length >= TARGET_SUGGESTIONS)
    ) {
      return
    }
    if (!this.recoveryPending && this.queueService.list().length === 0) return
    const now = this.now().getTime()
    if (now < this.nextRetryAt) return
    this.nextRetryAt = now + 30_000
    await this.safeQueueChanged()
    const refreshed = this.autoplayService.get()
    if (this.recoveryPending && refreshed.suggestions.length > 0) {
      const context = this.context(this.queueService.list())
      if (context) {
        const promoted = await this.promote(context.fingerprint)
        if (promoted.item) {
          this.recoveryPending = false
          await this.safeQueueChanged()
        }
      }
    }
    this.retryCount = refreshed.suggestions.length > 0 ? 0 : Math.min(this.retryCount + 1, 4)
    this.nextRetryAt = now + Math.min(600_000, 30_000 * 2 ** this.retryCount)
  }

  async completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult> {
    const activeBefore = this.queueService.list()
    const current = this.queueRepository.findById(input.queueItemId)
    if (current?.status === 'played' || current?.status === 'failed') {
      return this.playerStateService.completePlayback(input)
    }
    const contextBefore = this.context(activeBefore)
    const wasEnabled = this.autoplayService.get().enabled
    if (wasEnabled) await this.safeQueueChanged()

    const latest = this.queueRepository.findById(input.queueItemId)
    if (latest?.status === 'played' || latest?.status === 'failed') {
      return this.playerStateService.completePlayback(input)
    }

    const completed = this.playerStateService.completePlayback(input)
    if (input.outcome === 'played' && current) this.profile.recordCompleted(current)
    if (completed.nextItem) {
      this.recoveryPending = false
      await this.safeQueueChanged()
      return completed
    }
    if (!wasEnabled || !this.autoplayService.get().enabled || !contextBefore) return completed

    const promoted = await this.promote(contextBefore.fingerprint)
    if (!promoted.item) {
      this.recoveryPending = true
      return completed
    }
    this.recoveryPending = false
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
    if (!promoted.item) {
      this.recoveryPending = true
      return skipped
    }
    this.recoveryPending = false
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
      this.recoveryPending = false
      this.retryCount = 0
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
      this.candidateRepository.clear()
      this.recoveryPending = false
      return
    }

    const active = this.queueService.list()
    if (active.some((item) => item.origin === 'human')) this.recoveryPending = false
    const context = this.context(active)
    if (!context) {
      this.suggestionRepository.clear()
      if (active.length > 0) this.autoplayService.recordFailure('no_seeds')
      return
    }
    const storedSuggestions = this.suggestionRepository.list()
    const storedCandidates = this.candidateRepository.list()
    if (context.humanAnchor) {
      const humanAnchor = context.humanAnchor
      const previousHuman = this.profile.latestHumanAnchor()
      const newIdentity = this.trackIdentityKey(humanAnchor)
      const matchingCandidates = storedCandidates.filter(
        (candidate) => candidate.identityKey === newIdentity,
      )
      const samePreviousArtist = Boolean(
        previousHuman &&
        normalizeMusicText(previousHuman.artists[0] ?? '') ===
          normalizeMusicText(humanAnchor.artists[0] ?? ''),
      )
      this.profile.observeHumanDirection(humanAnchor, {
        relatedToCurrent:
          samePreviousArtist ||
          storedSuggestions.some((suggestion) => this.isSameTrack(suggestion.track, humanAnchor)) ||
          matchingCandidates.length > 0,
        relatedToDrift:
          (samePreviousArtist &&
            previousHuman !== undefined &&
            this.profile.isDriftSeed(
              `${previousHuman.provider}:${previousHuman.providerTrackId}`,
            )) ||
          storedSuggestions.some(
            (suggestion) =>
              this.isSameTrack(suggestion.track, humanAnchor) &&
              this.profile.isDriftSeed(suggestion.seedTrackKey),
          ) ||
          matchingCandidates.some((candidate) => this.profile.isDriftSeed(candidate.seedTrackKey)),
      })
      this.profile.observeHumanInput(humanAnchor)
    }

    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const blockedTracks = [...active, ...recent].map((item) => item.track)
    const suppressedTracks = this.trackHealthRepository.suppressedTracks(this.now())
    const suppressedIds = new Set(suppressedTracks.map((track) => track.providerTrackId))
    const suppressedIdentities = new Set(
      suppressedTracks.map((track) =>
        this.trackIdentityKey({ title: track.title, artists: track.artists }),
      ),
    )
    const existing = this.validSuggestions(
      storedSuggestions,
      context.fingerprint,
      blockedTracks,
      suppressedIds,
    )
    if (this.suggestionsChanged(storedSuggestions, existing)) {
      this.suggestionRepository.replaceAll(existing)
    }

    let bank = storedCandidates.filter(
      (candidate) =>
        candidate.seedFingerprint === context.fingerprint &&
        !this.candidateBlocked(candidate, blockedTracks, existing, suppressedIdentities),
    )
    const continuityKey = `${context.continuitySeed.provider}:${context.continuitySeed.providerTrackId}`
    const needsEnrichment =
      bank.length < REFILL_THRESHOLD ||
      !bank.some((candidate) => candidate.seedTrackKey === continuityKey)

    if (needsEnrichment) {
      let primaryError: Error | undefined
      try {
        const fresh = await this.recommendationEngine.getCandidates(context.seeds)
        bank = this.mergeAndRankCandidates(
          bank,
          fresh,
          context,
          recent,
          blockedTracks,
          existing,
          suppressedIdentities,
        )
      } catch (error) {
        primaryError =
          error instanceof Error
            ? error
            : new Error('Recommendation provider failed', { cause: error })
      }
      if (bank.length < REFILL_THRESHOLD) {
        const alternateSeeds = recent
          .map((item) => item.track)
          .filter((track) => !context.seeds.some((seed) => this.isSameTrack(seed, track)))
          .slice(0, 3)
        for (const seed of alternateSeeds) {
          try {
            const alternatives = await this.recommendationEngine.getCandidates([seed])
            bank = this.mergeAndRankCandidates(
              bank,
              alternatives,
              context,
              recent,
              blockedTracks,
              existing,
              suppressedIdentities,
            )
            if (bank.length >= REFILL_THRESHOLD) break
          } catch {
            // A failed alternate seed does not discard candidates already found.
          }
        }
      }
      if (primaryError) {
        if (bank.length === 0 && existing.length === 0) throw primaryError
        this.logger.warn(
          {
            operation: 'autoplay.candidates',
            outcome: 'retained_existing',
            errorName: primaryError.name,
          },
          'Candidate enrichment failed; retaining current reservoir',
        )
      }
    } else {
      bank = this.rankCandidates(bank, context, recent)
    }
    this.candidateRepository.replaceAll(bank.slice(0, TARGET_CANDIDATES))

    const retained = this.retainedSuggestions(existing)
    if (retained.length >= TARGET_SUGGESTIONS) {
      this.autoplayService.clearFailure()
      return
    }
    const filled = await this.fillSuggestions(
      retained,
      bank,
      context,
      active,
      recent,
      suppressedIds,
    )
    for (const suggestion of existing) {
      if (filled.suggestions.length >= TARGET_SUGGESTIONS) break
      if (filled.suggestions.some((item) => this.isSameTrack(item.track, suggestion.track)))
        continue
      filled.suggestions.push(suggestion)
    }
    this.suggestionRepository.replaceAll(filled.suggestions)
    this.candidateRepository.replaceAll(filled.remainingCandidates)
    if (filled.suggestions.length === 0) {
      this.autoplayService.recordFailure('no_candidates')
      return
    }
    this.autoplayService.clearFailure()
  }

  private context(active: readonly QueueItem[]): RecommendationContext | undefined {
    const player = this.playerStateService.get()
    if (!player.guildId) return undefined
    this.profile.begin(player.guildId)
    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const humanAnchor =
      [...active, ...recent]
        .filter((item) => item.origin === 'human')
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.position - left.position,
        )[0]?.track ?? this.profile.latestHumanAnchor()
    const continuitySeed =
      active.at(-1)?.track ??
      this.queueRepository.listRecentTerminal(1)[0]?.track ??
      recent[0]?.track
    if (!continuitySeed) return undefined
    const seeds = [humanAnchor, continuitySeed]
      .filter((track): track is TrackMetadata => Boolean(track))
      .filter(
        (track, index, all) => all.findIndex((other) => this.isSameTrack(track, other)) === index,
      )
    return {
      ...(humanAnchor === undefined ? {} : { humanAnchor }),
      continuitySeed,
      seeds,
      fingerprint: createHash('sha256')
        .update(`${player.guildId}|${player.voiceChannelId ?? ''}`)
        .digest('hex'),
    }
  }

  private validSuggestions(
    suggestions: readonly StoredAutoplaySuggestion[],
    fingerprint: string,
    blockedTracks: readonly TrackMetadata[],
    suppressedIds: ReadonlySet<string>,
  ): StoredAutoplaySuggestion[] {
    const valid: StoredAutoplaySuggestion[] = []
    for (const suggestion of suggestions) {
      if (suggestion.seedFingerprint !== fingerprint) continue
      if (this.profile.isRejected(suggestion.track)) continue
      if (suppressedIds.has(suggestion.track.providerTrackId)) continue
      if (blockedTracks.some((track) => this.isSameTrack(track, suggestion.track))) continue
      if (valid.some((item) => this.isSameTrack(item.track, suggestion.track))) continue
      valid.push(suggestion)
    }
    return valid
  }

  private retainedSuggestions(
    suggestions: readonly StoredAutoplaySuggestion[],
  ): StoredAutoplaySuggestion[] {
    const driftSlots = this.profile.driftSuggestionSlots()
    if (driftSlots === 0) return [...suggestions]
    const established = suggestions.filter(
      (suggestion) => !this.profile.isDriftSeed(suggestion.seedTrackKey),
    )
    const drift = suggestions.filter((suggestion) =>
      this.profile.isDriftSeed(suggestion.seedTrackKey),
    )
    return [...established.slice(0, TARGET_SUGGESTIONS - driftSlots), ...drift.slice(0, driftSlots)]
  }

  private mergeAndRankCandidates(
    current: readonly StoredRecommendationCandidate[],
    fresh: readonly RecommendationCandidate[],
    context: RecommendationContext,
    recent: readonly QueueItem[],
    blockedTracks: readonly TrackMetadata[],
    suggestions: readonly StoredAutoplaySuggestion[],
    suppressedIdentities: ReadonlySet<string>,
  ): StoredRecommendationCandidate[] {
    const merged = new Map<string, StoredRecommendationCandidate>()
    current.forEach((candidate) => merged.set(candidate.identityKey, candidate))
    fresh.forEach((candidate) => {
      if (this.candidateBlocked(candidate, blockedTracks, suggestions, suppressedIdentities)) return
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
                this.profile.score(candidate) +
                (this.profile.isDriftSeed(candidate.seedTrackKey) ? 0.08 : 0) -
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
    suppressedIds: ReadonlySet<string>,
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
    suppressedIds.forEach((id) => excluded.add(id))
    const slots = this.remainingSlots(suggestions)
    let attempts = 0

    while (
      suggestions.length < TARGET_SUGGESTIONS &&
      remaining.length > 0 &&
      attempts < RESOLUTION_BUDGET
    ) {
      const batch: StoredRecommendationCandidate[] = []
      while (
        batch.length < Math.min(RESOLUTION_CONCURRENCY, TARGET_SUGGESTIONS - suggestions.length) &&
        remaining.length > 0 &&
        attempts < RESOLUTION_BUDGET
      ) {
        const needsDrift =
          this.profile.driftSuggestionSlots() >
          suggestions.filter((suggestion) => this.profile.isDriftSeed(suggestion.seedTrackKey))
            .length
        const pool = needsDrift
          ? remaining.filter((candidate) => this.profile.isDriftSeed(candidate.seedTrackKey))
          : remaining
        if (pool.length === 0) break
        const slot = slots.shift()
        const picked = this.pickCandidate(pool, slot)
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
          suppressedIds.has(track.providerTrackId) ||
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
          seedTrackKey: candidate.seedTrackKey,
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
    suppressedIdentities: ReadonlySet<string>,
  ): boolean {
    if (this.profile.rejectedIds().has(candidate.identityKey)) return true
    if (suppressedIdentities.has(candidate.identityKey)) return true
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
