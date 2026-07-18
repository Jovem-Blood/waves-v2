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

function stripFeatClause(text: string): string {
  return normalizeMusicText(text)
    .replace(/\bfeaturing\b.*/g, '')
    .replace(/(?<!^)\bwith\b.*/g, '')
    .trim()
}

function titleTokenCoverage(expected: string, candidate: string): number {
  const expectedTokens = new Set(stripFeatClause(expected).split(' ').filter(Boolean))
  const candidateTokens = new Set(stripFeatClause(candidate).split(' ').filter(Boolean))
  if (expectedTokens.size === 0) {
    return 0
  }
  return (
    [...expectedTokens].filter((token) => candidateTokens.has(token)).length / expectedTokens.size
  )
}

function effectiveCandidateArtists(candidate: YouTubeMusicCandidate): string[] {
  const normalized = normalizeMusicText(candidate.title)
  const featMatch = normalized.match(/\bfeaturing\s+(.+)$/)
  const withMatch = normalized.match(/(?<!^)\bwith\s+(.+)$/)
  const featTokens = (featMatch?.[1] ?? withMatch?.[1])?.trim().split(/\s+/).filter(Boolean)
  if (!featTokens || featTokens.length === 0) {
    return candidate.artists
  }
  return [...candidate.artists, ...featTokens]
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

function relaxedDurationScore(expectedMs: number, candidateMs: number): number | undefined {
  const difference = Math.abs(expectedMs - candidateMs)
  const tolerance = Math.max(45_000, expectedMs * 0.25)
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

  const title = titleTokenCoverage(track.title, candidate.title)
  const effectiveArtists = effectiveCandidateArtists(candidate)
  const artists =
    track.artists.reduce(
      (total, artist) =>
        total +
        Math.max(
          ...effectiveArtists.map((candidateArtist) => tokenCoverage(artist, candidateArtist)),
        ),
      0,
    ) / track.artists.length
  const official = candidate.isOfficial || candidate.isTopic ? 1 : 0
  return { score: title * 0.4 + artists * 0.35 + duration * 0.2 + official * 0.05 }
}

function relaxedScoreCandidate(
  track: TrackMetadata,
  candidate: YouTubeMusicCandidate,
): { score?: number } {
  if (hasConflictingQualifier(track.title, candidate.title)) {
    return {}
  }

  const title = titleTokenCoverage(track.title, candidate.title)
  if (title < 0.85) {
    return {}
  }

  const effectiveArtists = effectiveCandidateArtists(candidate)
  const primaryArtist = track.artists[0]
  const primaryArtistCoverage = primaryArtist
    ? Math.max(...effectiveArtists.map((artist) => tokenCoverage(primaryArtist, artist)))
    : 0
  const artists =
    track.artists.reduce(
      (total, artist) =>
        total +
        Math.max(
          0,
          ...effectiveArtists.map((candidateArtist) => tokenCoverage(artist, candidateArtist)),
        ),
      0,
    ) / track.artists.length
  const trustedSurface = candidate.isOfficial || candidate.isTopic
  if (!trustedSurface || (primaryArtistCoverage < 0.55 && artists < 0.55)) {
    return {}
  }

  const duration = relaxedDurationScore(track.durationMs, candidate.durationMs)
  if (duration === undefined) {
    return {}
  }

  const official = trustedSurface ? 1 : 0
  return { score: title * 0.45 + artists * 0.25 + duration * 0.2 + official * 0.1 }
}

export interface YouTubeMusicCandidateDiagnostic {
  videoId: string
  title: string
  artists: string[]
  durationMs: number
  isOfficial: boolean
  isTopic: boolean
  rejection?: 'qualifier' | 'artist' | 'duration'
  score?: number
}

export interface YouTubeMusicMatchDiagnostics {
  candidateCount: number
  rejectedByQualifier: number
  rejectedByArtist: number
  rejectedByDuration: number
  rejectedByScore: number
  ambiguous: boolean
  selected?: { videoId: string; score: number }
  candidateDetails: YouTubeMusicCandidateDiagnostic[]
}

export function analyzeYouTubeMusicCandidates(
  track: TrackMetadata,
  candidates: YouTubeMusicCandidate[],
): {
  candidate?: YouTubeMusicCandidate
  ranked: YouTubeMusicCandidate[]
  diagnostics: YouTubeMusicMatchDiagnostics
} {
  const diagnostics: YouTubeMusicMatchDiagnostics = {
    candidateCount: candidates.length,
    rejectedByQualifier: 0,
    rejectedByArtist: 0,
    rejectedByDuration: 0,
    rejectedByScore: 0,
    ambiguous: false,
    candidateDetails: [],
  }
  const ranked = candidates
    .map((candidate) => {
      const result = scoreCandidate(track, candidate)
      diagnostics.candidateDetails.push({
        videoId: candidate.videoId,
        title: candidate.title,
        artists: candidate.artists,
        durationMs: candidate.durationMs,
        isOfficial: candidate.isOfficial,
        isTopic: candidate.isTopic,
        rejection: result.rejection,
        score: result.score,
      })
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
  if (best && best.score >= 0.75) {
    const second = ranked[1]
    if (
      second &&
      best.score - second.score < 0.03 &&
      !best.candidate.isOfficial &&
      !best.candidate.isTopic
    ) {
      diagnostics.ambiguous = true
      return { ranked: ranked.map((e) => e.candidate), diagnostics }
    }
    diagnostics.selected = { videoId: best.candidate.videoId, score: best.score }
    return {
      candidate: best.candidate,
      ranked: ranked.map((e) => e.candidate),
      diagnostics,
    }
  }

  if (ranked.length > 0) {
    diagnostics.rejectedByScore = ranked.length
  }

  const relaxedRanked = candidates
    .map((candidate) => ({ candidate, score: relaxedScoreCandidate(track, candidate).score }))
    .filter(
      (entry): entry is { candidate: YouTubeMusicCandidate; score: number } =>
        entry.score !== undefined,
    )
    .sort((left, right) => right.score - left.score)

  const relaxedBest = relaxedRanked[0]
  if (!relaxedBest || relaxedBest.score < 0.78) {
    return { ranked: [], diagnostics }
  }

  const allRanked = [...ranked.map((e) => e.candidate), ...relaxedRanked.map((e) => e.candidate)]

  const relaxedSecond = relaxedRanked[1]
  if (
    relaxedSecond &&
    relaxedBest.score - relaxedSecond.score < 0.05 &&
    !relaxedBest.candidate.isOfficial &&
    !relaxedBest.candidate.isTopic
  ) {
    diagnostics.ambiguous = true
    return { ranked: allRanked, diagnostics }
  }

  diagnostics.selected = { videoId: relaxedBest.candidate.videoId, score: relaxedBest.score }
  return { candidate: relaxedBest.candidate, ranked: allRanked, diagnostics }
}

export function selectYouTubeMusicCandidate(
  track: TrackMetadata,
  candidates: YouTubeMusicCandidate[],
): YouTubeMusicCandidate | undefined {
  return analyzeYouTubeMusicCandidates(track, candidates).candidate
}
