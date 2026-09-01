import { randomUUID } from 'node:crypto'

import {
  queueItemAudioSourceSchema,
  type QueueItemAudioSource,
  type ResolvedAudioSource,
} from '@waves/shared'

import type { QueueRepository } from '../repositories/queue.repository'
import type { ResolvedSourceRepository } from '../repositories/resolved-source.repository'
import type { AudioSourceResolver } from './audio-source-resolver'
import { QueueItemNotFoundError } from './domain-errors'
import { type WavesLogger, useLogger } from '../utils/logger'
import { classifyExternalError } from '../utils/observability'

const SOURCE_EXPIRY_REFRESH_MARGIN_MS = 60_000

export class AudioSourceService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly resolvedSourceRepository: ResolvedSourceRepository,
    private readonly resolver: AudioSourceResolver,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async resolve(
    queueItemId: string,
    options: { forceRefresh?: boolean; playbackAttemptId?: string; attempt?: number } = {},
  ): Promise<QueueItemAudioSource> {
    const startedAt = Date.now()
    const log = this.logger.child({
      service: 'web',
      event: 'playback',
      operation: 'audio_source.resolve',
      queueItemId,
      forceRefresh: options.forceRefresh ?? false,
      ...(options.playbackAttemptId === undefined
        ? {}
        : { playbackAttemptId: options.playbackAttemptId }),
      ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
    })
    const queueItem = this.queueRepository.findById(queueItemId)
    if (!queueItem) {
      log.warn({ outcome: 'queue_item_not_found' }, 'Audio source resolution rejected')
      throw new QueueItemNotFoundError(queueItemId)
    }

    const now = this.now()
    const timestamp = now.toISOString()
    const reusableUntil = new Date(now.getTime() + SOURCE_EXPIRY_REFRESH_MARGIN_MS).toISOString()
    const cached = options.forceRefresh
      ? undefined
      : this.resolvedSourceRepository.findReusable(queueItemId, reusableUntil)
    let source: ResolvedAudioSource

    if (cached) {
      log.info(
        {
          outcome: 'cache_hit',
          provider: cached.provider,
          sourceIdentifier: cached.sourceIdentifier,
          expiresAt: cached.expiresAt,
          durationMs: Date.now() - startedAt,
        },
        'Audio source cache hit',
      )
      source = {
        provider: cached.provider,
        sourceIdentifier: cached.sourceIdentifier,
        streamUrl: cached.streamUrl,
        expiresAt: cached.expiresAt,
      }
    } else {
      const previous = this.resolvedSourceRepository.findLatest(queueItemId)
      log.info(
        {
          outcome: previous
            ? options.forceRefresh
              ? 'force_refresh'
              : 'cache_expired'
            : 'cache_miss',
          ...(previous
            ? {
                provider: previous.provider,
                sourceIdentifier: previous.sourceIdentifier,
                expiresAt: previous.expiresAt,
              }
            : {}),
        },
        'Audio source cache requires resolution',
      )
      try {
        source = await this.resolver.resolve(queueItem.track, {
          ...(previous
            ? {
                preferredSource: {
                  sourceIdentifier: previous.sourceIdentifier,
                },
              }
            : {}),
        })
      } catch (error) {
        log.error(
          {
            outcome: 'failed',
            failureStage: 'resolve',
            failureClass: 'operational',
            durationMs: Date.now() - startedAt,
            ...classifyExternalError(error),
          },
          'Audio source resolution failed',
        )
        throw error
      }
      this.resolvedSourceRepository.replace({
        id: this.createId(),
        queueItemId,
        ...source,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      log.info(
        {
          outcome: previous ? 'replaced' : 'resolved',
          provider: source.provider,
          sourceIdentifier: source.sourceIdentifier,
          expiresAt: source.expiresAt,
          previousProvider: previous?.provider,
          previousSourceIdentifier: previous?.sourceIdentifier,
          durationMs: Date.now() - startedAt,
        },
        'Audio source resolution persisted',
      )
    }

    return queueItemAudioSourceSchema.parse({ queueItemId, source })
  }
}
