import {
  resolvedAudioSourceSchema,
  type ResolvedAudioSource,
  type TrackMetadata,
} from '@waves/shared'

import type { YouTubeMusicClientPort } from '../clients/youtube-music.client'
import {
  YouTubeMusicCandidateUnavailableError,
  YouTubeMusicInvalidResponseError,
  YouTubeMusicUnavailableError,
} from '../clients/youtube-music.errors'
import type { AudioSourceResolveOptions, AudioSourceResolver } from './audio-source-resolver'
import { AudioSourceNotFoundError, AudioSourceUnavailableError } from './audio-source.errors'
import { analyzeYouTubeMusicCandidates } from './audio-source-matching'
import { type WavesLogger, useLogger } from '../utils/logger'
import { classifyExternalError } from '../utils/observability'

const DEFAULT_SEARCH_LIMIT = 10

export class YouTubeMusicAudioSourceResolver implements AudioSourceResolver {
  constructor(
    private readonly client: YouTubeMusicClientPort,
    private readonly searchLimit = DEFAULT_SEARCH_LIMIT,
    private readonly logger: WavesLogger = useLogger(),
  ) {}

  async resolve(
    track: TrackMetadata,
    options: AudioSourceResolveOptions = {},
  ): Promise<ResolvedAudioSource> {
    const preferredVideoId =
      options.preferredSource?.provider === 'youtube_music'
        ? options.preferredSource.sourceIdentifier
        : undefined

    if (preferredVideoId) {
      this.logger.info(
        {
          operation: 'youtube_music.refresh',
          provider: 'youtube_music',
          sourceIdentifier: preferredVideoId,
          outcome: 'started',
        },
        'YouTube Music source refresh started',
      )
      try {
        const refreshed = await this.resolveVideoId(preferredVideoId)
        this.logger.info(
          {
            operation: 'youtube_music.refresh',
            provider: 'youtube_music',
            sourceIdentifier: preferredVideoId,
            outcome: 'resolved',
          },
          'YouTube Music source refresh completed',
        )
        return refreshed
      } catch (error) {
        if (
          !(error instanceof AudioSourceNotFoundError) &&
          !(error instanceof AudioSourceUnavailableError)
        ) {
          throw error
        }
        this.logger.warn(
          {
            operation: 'youtube_music.refresh',
            provider: 'youtube_music',
            sourceIdentifier: preferredVideoId,
            outcome: 'search_required',
            ...classifyExternalError(error),
          },
          'YouTube Music source refresh requires new matching',
        )
      }
    }

    let candidates
    try {
      candidates = await this.client.searchSongs(
        `${track.title} ${track.artists.join(' ')}`,
        this.searchLimit,
      )
      if (track.isrc) {
        const isrcCandidates = await this.client.searchSongs(track.isrc, this.searchLimit)
        candidates = [...candidates, ...isrcCandidates]
      }
    } catch (error) {
      throw this.translateError(error)
    }

    const match = analyzeYouTubeMusicCandidates(track, [
      ...new Map(candidates.map((candidate) => [candidate.videoId, candidate])).values(),
    ])
    const selected = match.candidate
    this.logger.info(
      {
        operation: 'youtube_music.match',
        provider: 'youtube_music',
        outcome: selected ? 'selected' : match.diagnostics.ambiguous ? 'ambiguous' : 'not_found',
        candidateCount: match.diagnostics.candidateCount,
        rejectedByQualifier: match.diagnostics.rejectedByQualifier,
        rejectedByArtist: match.diagnostics.rejectedByArtist,
        rejectedByDuration: match.diagnostics.rejectedByDuration,
        rejectedByScore: match.diagnostics.rejectedByScore,
        ambiguous: match.diagnostics.ambiguous,
        sourceIdentifier: match.diagnostics.selected?.videoId,
        selectedScore: match.diagnostics.selected?.score,
      },
      'YouTube Music candidate matching completed',
    )
    if (!selected) {
      throw new AudioSourceNotFoundError()
    }
    return this.resolveVideoId(selected.videoId)
  }

  private async resolveVideoId(videoId: string): Promise<ResolvedAudioSource> {
    try {
      const format = await this.client.resolveAudioFormat(videoId)
      return resolvedAudioSourceSchema.parse({
        provider: 'youtube_music',
        sourceIdentifier: videoId,
        streamUrl: format.streamUrl,
        expiresAt: format.expiresAt,
      })
    } catch (error) {
      throw this.translateError(error)
    }
  }

  private translateError(error: unknown): Error {
    if (error instanceof YouTubeMusicCandidateUnavailableError) {
      return new AudioSourceNotFoundError()
    }
    if (
      error instanceof YouTubeMusicUnavailableError ||
      error instanceof YouTubeMusicInvalidResponseError
    ) {
      return new AudioSourceUnavailableError()
    }
    return error instanceof Error ? error : new AudioSourceUnavailableError()
  }
}
