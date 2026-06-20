import {
  resolvedAudioSourceSchema,
  type ResolvedAudioSource,
  type TrackMetadata,
} from '@waves/shared'

import type { AudiusClientPort } from '../clients/audius.client'
import { AudiusInvalidResponseError, AudiusUnavailableError } from '../clients/audius.errors'
import type { AudiusTrack } from '../clients/audius.schemas'
import { AudioSourceNotFoundError, AudioSourceUnavailableError } from './audio-source.errors'

const DEFAULT_TTL_MS = 5 * 60_000
const DEFAULT_SEARCH_LIMIT = 10

export interface AudioSourceResolver {
  resolve(track: TrackMetadata, options?: AudioSourceResolveOptions): Promise<ResolvedAudioSource>
}

export interface AudioSourceResolveOptions {
  preferredSource?: Pick<ResolvedAudioSource, 'provider' | 'sourceIdentifier'>
}

export interface AudiusAudioSourceResolverOptions {
  searchLimit?: number
  ttlMs?: number
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter(Boolean))
}

function coverage(expected: string, candidate: string): number {
  const expectedTokens = tokens(expected)
  const candidateTokens = tokens(candidate)
  if (expectedTokens.size === 0) {
    return 0
  }

  let matches = 0
  for (const token of expectedTokens) {
    if (candidateTokens.has(token)) {
      matches += 1
    }
  }
  return matches / expectedTokens.size
}

function durationMatches(expectedMs: number, candidateSeconds: number): boolean {
  const differenceMs = Math.abs(expectedMs - candidateSeconds * 1000)
  return differenceMs <= Math.max(10_000, expectedMs * 0.08)
}

function isAlteredVersion(targetTitle: string, candidateTitle: string): boolean {
  const markers = ['cover', 'remix', 'edit', 'mashup', 'sped up', 'slowed']
  const normalizedTarget = normalize(targetTitle)
  const normalizedCandidate = normalize(candidateTitle)
  return markers.some(
    (marker) => normalizedCandidate.includes(marker) && !normalizedTarget.includes(marker),
  )
}

function matchScore(track: TrackMetadata, candidate: AudiusTrack): number | undefined {
  if (candidate.is_stream_gated || !candidate.stream) {
    return undefined
  }
  if (isAlteredVersion(track.title, candidate.title)) {
    return undefined
  }

  const titleCoverage = coverage(track.title, candidate.title)
  const artistCoverage = Math.max(
    ...track.artists.map((artist) => coverage(artist, candidate.user.name)),
  )
  if (
    titleCoverage < 0.8 ||
    artistCoverage < 0.8 ||
    !durationMatches(track.durationMs, candidate.duration)
  ) {
    return undefined
  }

  const durationDifference = Math.abs(track.durationMs - candidate.duration * 1000)
  const durationScore = 1 - durationDifference / Math.max(track.durationMs, 1)
  return titleCoverage * 0.45 + artistCoverage * 0.4 + durationScore * 0.15
}

export class AudiusAudioSourceResolver implements AudioSourceResolver {
  private readonly searchLimit: number
  private readonly ttlMs: number

  constructor(
    private readonly client: AudiusClientPort,
    private readonly now: () => number = Date.now,
    options: AudiusAudioSourceResolverOptions = {},
  ) {
    this.searchLimit = options.searchLimit ?? DEFAULT_SEARCH_LIMIT
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  }

  async resolve(track: TrackMetadata): Promise<ResolvedAudioSource> {
    let candidates: AudiusTrack[]
    try {
      candidates = await this.client.searchTracks(
        `${track.title} ${track.artists.join(' ')}`,
        this.searchLimit,
      )
    } catch (error) {
      if (error instanceof AudiusUnavailableError || error instanceof AudiusInvalidResponseError) {
        throw new AudioSourceUnavailableError()
      }
      throw error
    }

    const selected = candidates
      .map((candidate) => ({ candidate, score: matchScore(track, candidate) }))
      .filter(
        (entry): entry is { candidate: AudiusTrack; score: number } => entry.score !== undefined,
      )
      .sort((left, right) => right.score - left.score)[0]?.candidate

    if (!selected?.stream) {
      throw new AudioSourceNotFoundError()
    }

    return resolvedAudioSourceSchema.parse({
      provider: 'audius',
      sourceIdentifier: selected.id,
      streamUrl: selected.stream.url,
      expiresAt: new Date(this.now() + this.ttlMs).toISOString(),
    })
  }
}
