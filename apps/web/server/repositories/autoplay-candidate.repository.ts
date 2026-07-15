import { asc, eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { autoplayCandidates } from '../db/schema'
import type { RecommendationCandidate } from '../services/recommendation.types'

const MAX_AUTOPLAY_CANDIDATES = 30

export interface StoredRecommendationCandidate extends RecommendationCandidate {
  baseScore: number
  seedFingerprint: string
  generatedAt: string
}

type CandidateRow = typeof autoplayCandidates.$inferSelect

function parseArtists(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in autoplay_candidates')
  }
  return parsed
}

function clampScore(score: number): number {
  return Math.max(-1, Math.min(1, score))
}

export class AutoplayCandidateRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  list(): StoredRecommendationCandidate[] {
    return this.db
      .select()
      .from(autoplayCandidates)
      .orderBy(asc(autoplayCandidates.position))
      .all()
      .map((row) => this.mapRow(row))
  }

  replaceAll(
    candidates: readonly StoredRecommendationCandidate[],
  ): StoredRecommendationCandidate[] {
    const selected = candidates.slice(0, MAX_AUTOPLAY_CANDIDATES)
    this.clear()
    selected.forEach((candidate, position) => {
      this.db
        .insert(autoplayCandidates)
        .values({
          id: position + 1,
          position,
          identityKey: candidate.identityKey,
          title: candidate.title,
          artistsJson: JSON.stringify(candidate.artists),
          strategy: candidate.strategy,
          score: Math.round(clampScore(candidate.score) * 1000),
          baseScore: Math.round(clampScore(candidate.baseScore) * 1000),
          seedTrackKey: candidate.seedTrackKey,
          sourceTag: candidate.sourceTag ?? null,
          seedFingerprint: candidate.seedFingerprint,
          generatedAt: candidate.generatedAt,
        })
        .run()
    })
    return this.list()
  }

  remove(identityKey: string): boolean {
    const changed =
      this.db
        .delete(autoplayCandidates)
        .where(eq(autoplayCandidates.identityKey, identityKey))
        .run().changes > 0
    if (changed) this.replaceAll(this.list())
    return changed
  }

  clear(): boolean {
    return this.db.delete(autoplayCandidates).run().changes > 0
  }

  private mapRow(row: CandidateRow): StoredRecommendationCandidate {
    return {
      provider: row.strategy === 'fallback' ? 'youtube_music' : 'lastfm',
      identityKey: row.identityKey,
      title: row.title,
      artists: parseArtists(row.artistsJson),
      score: row.baseScore / 1000,
      baseScore: row.baseScore / 1000,
      strategy: row.strategy,
      seedTrackKey: row.seedTrackKey,
      ...(row.sourceTag === null ? {} : { sourceTag: row.sourceTag }),
      seedFingerprint: row.seedFingerprint,
      generatedAt: row.generatedAt,
    }
  }
}
