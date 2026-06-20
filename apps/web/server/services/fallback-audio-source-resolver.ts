import type { ResolvedAudioSource, TrackMetadata } from '@waves/shared'

import type { AudioSourceResolveOptions, AudioSourceResolver } from './audio-source-resolver'
import { AudioSourceNotFoundError, AudioSourceUnavailableError } from './audio-source.errors'
import { type WavesLogger, useLogger } from '../utils/logger'
import { classifyExternalError } from '../utils/observability'

export class FallbackAudioSourceResolver implements AudioSourceResolver {
  constructor(
    private readonly primary: AudioSourceResolver,
    private readonly fallback: AudioSourceResolver,
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async resolve(
    track: TrackMetadata,
    options: AudioSourceResolveOptions = {},
  ): Promise<ResolvedAudioSource> {
    const resolvers: Array<{
      provider: 'youtube_music' | 'audius'
      resolver: AudioSourceResolver
    }> =
      options.preferredSource?.provider === 'audius'
        ? [
            { provider: 'audius', resolver: this.fallback },
            { provider: 'youtube_music', resolver: this.primary },
          ]
        : [
            { provider: 'youtube_music', resolver: this.primary },
            { provider: 'audius', resolver: this.fallback },
          ]
    let lastSafeError: AudioSourceNotFoundError | AudioSourceUnavailableError | undefined

    for (const [index, entry] of resolvers.entries()) {
      const startedAt = Date.now()
      this.logger.info(
        {
          operation: 'audio_source.fallback',
          provider: entry.provider,
          attempt: index + 1,
          outcome: 'started',
        },
        'Audio source provider attempt started',
      )
      try {
        const source = await entry.resolver.resolve(track, options)
        this.logger.info(
          {
            operation: 'audio_source.fallback',
            provider: source.provider,
            sourceIdentifier: source.sourceIdentifier,
            attempt: index + 1,
            outcome: 'resolved',
            durationMs: Date.now() - startedAt,
          },
          'Audio source provider attempt completed',
        )
        return source
      } catch (error) {
        if (
          error instanceof AudioSourceNotFoundError ||
          error instanceof AudioSourceUnavailableError
        ) {
          lastSafeError = error
          this.logger.warn(
            {
              operation: 'audio_source.fallback',
              provider: entry.provider,
              attempt: index + 1,
              outcome: index < resolvers.length - 1 ? 'fallback' : 'failed',
              durationMs: Date.now() - startedAt,
              ...classifyExternalError(error),
            },
            'Audio source provider attempt failed safely',
          )
          continue
        }
        throw error
      }
    }

    this.logger.error(
      {
        operation: 'audio_source.fallback',
        outcome: 'all_providers_failed',
        ...classifyExternalError(lastSafeError),
      },
      'All audio source providers failed',
    )
    throw lastSafeError ?? new AudioSourceNotFoundError()
  }
}
