import { createHash } from 'node:crypto'

import type { CompletePlaybackInput, PlaybackTransitionResult, TrackMetadata } from '@waves/shared'

import type { AutoplaySuggestionRepository } from '../repositories/autoplay-suggestion.repository'
import type { QueueRepository } from '../repositories/queue.repository'
import type { WavesLogger } from '../utils/logger'
import { useLogger } from '../utils/logger'
import type { AutoplayService } from './autoplay.service'
import {
  RecommendationMetadataUnavailableError,
  RecommendationUnavailableError,
} from './recommendation.errors'
import type { PlayerStateService } from './player-state.service'
import type { QueueService } from './queue.service'
import { buildAutoplayExcludedTrackIds, RECENT_PLAYED_LIMIT } from './autoplay-exclusions'

const TARGET_AUTOPLAY_SUGGESTIONS = 3

interface RecommendationProvider {
  getRecommendations(
    seeds: readonly TrackMetadata[],
    excludedTrackIds: ReadonlySet<string>,
  ): Promise<TrackMetadata[]>
}

export class AutoplayOrchestrator {
  private generationInFlight: Promise<void> | undefined
  private promotionInFlight: Promise<ReturnType<PlayerStateService['promoteAutoplaySuggestion']>> | undefined

  constructor(
    private readonly autoplayService: AutoplayService,
    private readonly queueService: QueueService,
    private readonly queueRepository: QueueRepository,
    private readonly suggestionRepository: AutoplaySuggestionRepository,
    private readonly playerStateService: PlayerStateService,
    private readonly recommendationProvider: RecommendationProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async queueChanged(): Promise<void> {
    this.generationInFlight ??= this.generateIfNeeded().finally(() => {
      this.generationInFlight = undefined
    })
    await this.generationInFlight
  }

  async completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult> {
    const wasAutoplayEnabled = this.autoplayService.get().enabled
    if (wasAutoplayEnabled) {
      await this.safeQueueChanged()
    }

    const completed = this.playerStateService.completePlayback(input)
    if (completed.nextItem) {
      await this.safeQueueChanged()
      return completed
    }
    if (!wasAutoplayEnabled || !this.autoplayService.get().enabled) return completed

    const fingerprint = this.seedFingerprint(this.currentSeeds())
    this.promotionInFlight ??= Promise.resolve(
      this.playerStateService.promoteAutoplaySuggestion(fingerprint),
    ).finally(() => {
      this.promotionInFlight = undefined
    })
    const promoted = await this.promotionInFlight
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
    const active = this.queueService.list()
    if (!state.enabled) {
      this.suggestionRepository.clear()
      return
    }

    const existing = this.suggestionRepository.list()
    if (active.length !== 1) {
      const recentIds = new Set(
        this.queueRepository
          .listRecentPlayed(RECENT_PLAYED_LIMIT)
          .map((item) => item.track.providerTrackId),
      )
      const activeIds = new Set(active.map((item) => item.track.providerTrackId))
      const fingerprint = this.seedFingerprint(this.currentSeeds())
      const stillValid = existing.filter(
        (suggestion) =>
          suggestion.seedFingerprint === fingerprint &&
          !activeIds.has(suggestion.track.providerTrackId) &&
          !recentIds.has(suggestion.track.providerTrackId),
      )
      if (stillValid.length !== existing.length) {
        this.suggestionRepository.replaceAll(stillValid)
      }
      return
    }

    const seeds = this.currentSeeds()
    if (seeds.length === 0) {
      this.autoplayService.recordFailure('no_seeds')
      return
    }
    const fingerprint = this.seedFingerprint(seeds)
    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const rejected = this.suggestionRepository.listRejected(this.now().toISOString())
    const activeIds = new Set(active.map((item) => item.track.providerTrackId))
    const recentIds = new Set(recent.map((item) => item.track.providerTrackId))
    const validExisting = existing.filter(
      (suggestion) =>
        !activeIds.has(suggestion.track.providerTrackId) &&
        !recentIds.has(suggestion.track.providerTrackId) &&
        !rejected.has(suggestion.track.providerTrackId) &&
        !seeds.some((seed) => seed.providerTrackId === suggestion.track.providerTrackId),
    )
    const excluded = buildAutoplayExcludedTrackIds({
      active,
      recent,
      suggestions: validExisting,
      rejected,
      seeds,
    })

    if (validExisting.length >= TARGET_AUTOPLAY_SUGGESTIONS) {
      return
    }
    if (validExisting.length !== existing.length) this.suggestionRepository.replaceAll(validExisting)

    const recommendations = await this.recommendationProvider.getRecommendations(seeds, excluded)
    const nextSuggestions = [...validExisting]
    for (const track of recommendations) {
      if (nextSuggestions.length >= TARGET_AUTOPLAY_SUGGESTIONS) break
      if (excluded.has(track.providerTrackId)) continue
      if (this.queueRepository.findActiveByTrack(track.provider, track.providerTrackId)) continue
      nextSuggestions.push({
        track,
        provider: 'spotify',
        generatedAt: this.now().toISOString(),
        seedFingerprint: fingerprint,
      })
      excluded.add(track.providerTrackId)
    }

    const currentSeeds = this.currentSeeds()
    if (
      !this.autoplayService.get().enabled ||
      this.queueService.list().length !== 1 ||
      this.seedFingerprint(currentSeeds) !== fingerprint
    ) {
      return
    }
    this.suggestionRepository.replaceAll(nextSuggestions)
    if (nextSuggestions.length === 0 || nextSuggestions.length === validExisting.length) {
      this.autoplayService.recordFailure('no_candidates')
      return
    }
    this.autoplayService.clearFailure()
  }

  private currentSeeds(): TrackMetadata[] {
    const active = this.queueService.list()
    const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
    const seen = new Set<string>()
    return [...active.slice(0, 1), ...recent]
      .filter((item) => {
        if (seen.has(item.track.providerTrackId)) return false
        seen.add(item.track.providerTrackId)
        return true
      })
      .slice(0, 5)
      .map((item) => item.track)
  }

  private seedFingerprint(seeds: readonly TrackMetadata[]): string {
    return createHash('sha256')
      .update(seeds.map((track) => `${track.provider}:${track.providerTrackId}`).join('|'))
      .digest('hex')
  }
}
