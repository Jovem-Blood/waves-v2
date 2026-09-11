import {
  resolvedAudioSourceSchema,
  type ResolvedAudioSource,
  type TrackMetadata,
} from '@waves/shared'

import type { YouTubeMusicClientPort } from '../../clients/youtube-music.client'
import {
  YouTubeMusicCandidateUnavailableError,
  YouTubeMusicInvalidResponseError,
  YouTubeMusicUnavailableError,
} from '../../clients/youtube-music.errors'
import { type WavesLogger, useLogger } from '../../utils/logger'
import { classifyExternalError } from '../../utils/observability'
import { AudioSourceNotFoundError, AudioSourceUnavailableError } from './errors'
import { analyzeYouTubeMusicCandidates } from './matching'
import type { AudioSourceResolveOptions, AudioSourceResolver } from './resolver'

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
    const preferredVideoId = options.preferredSource?.sourceIdentifier

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
            err: error,
            ...classifyExternalError(error),
          },
          'YouTube Music source refresh requires new matching',
        )
      }
    }

    const query = `${track.title} ${track.artists[0]}`
    let candidates
    const isrcCandidateIds = new Set<string>()
    try {
      candidates = await this.client.searchSongs(query, this.searchLimit)
      if (track.isrc) {
        const isrcCandidates = await this.client.searchSongs(track.isrc, this.searchLimit)
        for (const candidate of isrcCandidates) isrcCandidateIds.add(candidate.videoId)
        candidates = [...candidates, ...isrcCandidates]
      }
    } catch (error) {
      throw this.translateError(error)
    }

    let searchSurface = 'songs'
    let match = analyzeYouTubeMusicCandidates(
      track,
      [...new Map(candidates.map((candidate) => [candidate.videoId, candidate])).values()],
      { isrcCandidateIds },
    )

    if (!match.candidate && track.artists.length > 1) {
      try {
        const alternateArtistCandidates = (
          await Promise.all(
            track.artists
              .slice(1)
              .map((artist) =>
                this.client.searchSongs(`${track.title} ${artist}`, this.searchLimit),
              ),
          )
        ).flat()
        candidates = [...candidates, ...alternateArtistCandidates]
        searchSurface = 'songs_artist_fallback'
        match = analyzeYouTubeMusicCandidates(
          track,
          [...new Map(candidates.map((candidate) => [candidate.videoId, candidate])).values()],
          { isrcCandidateIds },
        )
      } catch (error) {
        throw this.translateError(error)
      }
    }

    if (!match.candidate) {
      try {
        const videoCandidates = await this.client.searchVideos(query, this.searchLimit)
        searchSurface = `${searchSurface}_videos`
        match = analyzeYouTubeMusicCandidates(
          track,
          [
            ...new Map(
              [...candidates, ...videoCandidates].map((candidate) => [
                candidate.videoId,
                candidate,
              ]),
            ).values(),
          ],
          { isrcCandidateIds },
        )
      } catch (error) {
        throw this.translateError(error)
      }
    }

    const selected = match.candidate
    this.logger.info(
      {
        operation: 'youtube_music.match',
        provider: 'youtube_music',
        searchSurface,
        hasIsrc: track.isrc !== undefined,
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

    let lastError: Error | undefined
    for (const candidate of match.ranked) {
      try {
        return await this.resolveVideoId(candidate.videoId)
      } catch (error) {
        if (
          !(error instanceof AudioSourceNotFoundError) &&
          !(error instanceof AudioSourceUnavailableError)
        ) {
          throw error
        }
        lastError = error
        this.logger.warn(
          {
            operation: 'youtube_music.resolve_candidate',
            provider: 'youtube_music',
            sourceIdentifier: candidate.videoId,
            outcome: 'unavailable',
            err: error,
            ...classifyExternalError(error),
          },
          'YouTube Music candidate unavailable, trying next',
        )
      }
    }
    throw lastError ?? new AudioSourceNotFoundError()
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
      return new AudioSourceNotFoundError({ cause: error })
    }
    if (
      error instanceof YouTubeMusicUnavailableError ||
      error instanceof YouTubeMusicInvalidResponseError
    ) {
      return new AudioSourceUnavailableError({ cause: error })
    }
    return error instanceof Error
      ? error
      : new AudioSourceUnavailableError({ cause: new Error('Non-Error provider failure') })
  }
}
