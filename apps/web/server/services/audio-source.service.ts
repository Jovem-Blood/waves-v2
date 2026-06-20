import {
  queueItemAudioSourceSchema,
  type QueueItemAudioSource,
  type ResolvedAudioSource,
} from '@waves/shared'

import type { QueueRepository } from '../repositories/queue.repository'
import type { ResolvedSourceRepository } from '../repositories/resolved-source.repository'
import type { AudioSourceResolver } from './audio-source-resolver'
import { QueueItemNotFoundError } from './domain-errors'

export class AudioSourceService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly resolvedSourceRepository: ResolvedSourceRepository,
    private readonly resolver: AudioSourceResolver,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async resolve(
    queueItemId: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<QueueItemAudioSource> {
    const queueItem = this.queueRepository.findById(queueItemId)
    if (!queueItem) {
      throw new QueueItemNotFoundError(queueItemId)
    }

    const timestamp = this.now().toISOString()
    const cached = options.forceRefresh
      ? undefined
      : this.resolvedSourceRepository.findReusable(queueItemId, timestamp)
    let source: ResolvedAudioSource

    if (cached) {
      source = {
        provider: cached.provider,
        sourceIdentifier: cached.sourceIdentifier,
        streamUrl: cached.streamUrl,
        expiresAt: cached.expiresAt,
      }
    } else {
      source = await this.resolver.resolve(queueItem.track)
      this.resolvedSourceRepository.replace({
        id: this.createId(),
        queueItemId,
        ...source,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    return queueItemAudioSourceSchema.parse({ queueItemId, source })
  }
}
import { randomUUID } from 'node:crypto'
