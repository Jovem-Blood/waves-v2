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
    const completed = this.playerStateService.completePlayback(input)
    if (completed.nextItem) {
      await this.safeQueueChanged()
      return completed
    }
    if (!this.autoplayService.get().enabled) return completed

    await this.safeQueueChanged()
    const fingerprint = this.seedFingerprint(this.currentSeeds())
    this.promotionInFlight ??= Promise.resolve(
      this.playerStateService.promoteAutoplaySuggestion(fingerprint),
    ).finally(() => {
      this.promotionInFlight = undefined
    })
    const promoted = await this.promotionInFlight
    if (!promoted.item) return completed
    this.autoplayService.clearFailure()
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
    if (active.length !== 1) {
      const existing = this.suggestionRepository.get()
      if (existing) {
        const recentIds = new Set(
          this.queueRepository.listRecentPlayed(20).map((item) => item.track.providerTrackId),
        )
        const isActive = active.some(
          (item) => item.track.providerTrackId === existing.track.providerTrackId,
        )
        if (
          existing.seedFingerprint !== this.seedFingerprint(this.currentSeeds()) ||
          isActive ||
          recentIds.has(existing.track.providerTrackId)
        ) {
          this.suggestionRepository.clear()
        }
      }
      return
    }

    const seeds = this.currentSeeds()
    if (seeds.length === 0) {
      this.autoplayService.recordFailure('no_seeds')
      return
    }
    const fingerprint = this.seedFingerprint(seeds)
    const recent = this.queueRepository.listRecentPlayed(20)
    const excluded = new Set(recent.map((item) => item.track.providerTrackId))
    active.forEach((item) => excluded.add(item.track.providerTrackId))
    this.suggestionRepository
      .listRejected(this.now().toISOString())
      .forEach((trackId) => excluded.add(trackId))

    const existing = this.suggestionRepository.get()
    if (
      existing &&
      existing.seedFingerprint === fingerprint &&
      !excluded.has(existing.track.providerTrackId)
    ) {
      return
    }
    if (existing) this.suggestionRepository.clear()

    const recommendations = await this.recommendationProvider.getRecommendations(seeds, excluded)
    const candidate = recommendations.find(
      (track) =>
        !excluded.has(track.providerTrackId) &&
        !this.queueRepository.findActiveByTrack(track.provider, track.providerTrackId),
    )
    if (!candidate) {
      this.autoplayService.recordFailure('no_candidates')
      return
    }

    const currentSeeds = this.currentSeeds()
    if (
      !this.autoplayService.get().enabled ||
      this.queueService.list().length !== 1 ||
      this.seedFingerprint(currentSeeds) !== fingerprint
    ) {
      return
    }
    this.suggestionRepository.replace({
      track: candidate,
      provider: 'spotify',
      generatedAt: this.now().toISOString(),
      seedFingerprint: fingerprint,
    })
    this.autoplayService.clearFailure()
  }

  private currentSeeds(): TrackMetadata[] {
    const active = this.queueService.list()
    const recent = this.queueRepository.listRecentPlayed(20)
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
