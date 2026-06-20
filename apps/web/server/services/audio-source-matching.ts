import type { TrackMetadata } from '@waves/shared'

import type { YouTubeMusicCandidate } from '../clients/youtube-music.schemas'

const CONFLICTING_QUALIFIERS = [
  'cover',
  'remix',
  'edit',
  'mix',
  'live',
  'karaoke',
  'instrumental',
  'slowed',
  'reverb',
  'sped up',
  'nightcore',
  'acoustic',
  'lyric video',
] as const

export function normalizeMusicText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(feat(?:uring)?|ft)\.?\b/g, ' featuring ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenCoverage(expected: string, candidate: string): number {
  const expectedTokens = new Set(normalizeMusicText(expected).split(' ').filter(Boolean))
  const candidateTokens = new Set(normalizeMusicText(candidate).split(' ').filter(Boolean))
  if (expectedTokens.size === 0) {
    return 0
  }
  return (
    [...expectedTokens].filter((token) => candidateTokens.has(token)).length / expectedTokens.size
  )
}

function hasConflictingQualifier(trackTitle: string, candidateTitle: string): boolean {
  const expected = normalizeMusicText(trackTitle)
  const candidate = normalizeMusicText(candidateTitle)
  return CONFLICTING_QUALIFIERS.some(
    (qualifier) => candidate.includes(qualifier) && !expected.includes(qualifier),
  )
}

function durationScore(expectedMs: number, candidateMs: number): number | undefined {
  const difference = Math.abs(expectedMs - candidateMs)
  const tolerance = Math.max(12_000, expectedMs * 0.08)
  return difference > tolerance ? undefined : 1 - difference / tolerance
}

function scoreCandidate(
  track: TrackMetadata,
  candidate: YouTubeMusicCandidate,
): { score?: number; rejection?: 'qualifier' | 'artist' | 'duration' } {
  if (hasConflictingQualifier(track.title, candidate.title)) {
    return { rejection: 'qualifier' }
  }

  const primaryArtist = track.artists[0]
  if (
    !primaryArtist ||
    !candidate.artists.some((artist) => tokenCoverage(primaryArtist, artist) >= 0.8)
  ) {
    return { rejection: 'artist' }
  }

  const duration = durationScore(track.durationMs, candidate.durationMs)
  if (duration === undefined) {
    return { rejection: 'duration' }
  }

  const title = tokenCoverage(track.title, candidate.title)
  const artists =
    track.artists.reduce(
      (total, artist) =>
        total +
        Math.max(
          ...candidate.artists.map((candidateArtist) => tokenCoverage(artist, candidateArtist)),
        ),
      0,
    ) / track.artists.length
  const official = candidate.isOfficial || candidate.isTopic ? 1 : 0
  return { score: title * 0.4 + artists * 0.35 + duration * 0.2 + official * 0.05 }
}

export interface YouTubeMusicMatchDiagnostics {
  candidateCount: number
  rejectedByQualifier: number
  rejectedByArtist: number
  rejectedByDuration: number
  rejectedByScore: number
  ambiguous: boolean
  selected?: { videoId: string; score: number }
}

export function analyzeYouTubeMusicCandidates(
  track: TrackMetadata,
  candidates: YouTubeMusicCandidate[],
): { candidate?: YouTubeMusicCandidate; diagnostics: YouTubeMusicMatchDiagnostics } {
  const diagnostics: YouTubeMusicMatchDiagnostics = {
    candidateCount: candidates.length,
    rejectedByQualifier: 0,
    rejectedByArtist: 0,
    rejectedByDuration: 0,
    rejectedByScore: 0,
    ambiguous: false,
  }
  const ranked = candidates
    .map((candidate) => {
      const result = scoreCandidate(track, candidate)
      if (result.rejection === 'qualifier') diagnostics.rejectedByQualifier += 1
      if (result.rejection === 'artist') diagnostics.rejectedByArtist += 1
      if (result.rejection === 'duration') diagnostics.rejectedByDuration += 1
      return { candidate, score: result.score }
    })
    .filter(
      (entry): entry is { candidate: YouTubeMusicCandidate; score: number } =>
        entry.score !== undefined,
    )
    .sort((left, right) => right.score - left.score)

  const best = ranked[0]
  if (!best || best.score < 0.75) {
    diagnostics.rejectedByScore = ranked.length
    return { diagnostics }
  }

  const second = ranked[1]
  if (
    second &&
    best.score - second.score < 0.03 &&
    !best.candidate.isOfficial &&
    !best.candidate.isTopic
  ) {
    diagnostics.ambiguous = true
    return { diagnostics }
  }
  diagnostics.selected = { videoId: best.candidate.videoId, score: best.score }
  return { candidate: best.candidate, diagnostics }
}

export function selectYouTubeMusicCandidate(
  track: TrackMetadata,
  candidates: YouTubeMusicCandidate[],
): YouTubeMusicCandidate | undefined {
  return analyzeYouTubeMusicCandidates(track, candidates).candidate
}
