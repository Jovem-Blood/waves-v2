import { autoplaySuggestionSchema, type AutoplaySuggestion, type TrackMetadata } from '@waves/shared'
import { eq, gt, lte } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { autoplayRejections, autoplaySuggestions } from '../db/schema'

function parseArtists(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in autoplay_suggestions')
  }
  return parsed
}

export class AutoplaySuggestionRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  get(): AutoplaySuggestion | undefined {
    const row = this.db.select().from(autoplaySuggestions).where(eq(autoplaySuggestions.id, 1)).get()
    if (!row) return undefined
    const track: TrackMetadata = {
      id: row.trackId,
      provider: row.provider,
      providerTrackId: row.providerTrackId,
      title: row.title,
      artists: parseArtists(row.artistsJson),
      ...(row.albumName === null ? {} : { albumName: row.albumName }),
      durationMs: row.durationMs,
      ...(row.coverUrl === null ? {} : { coverUrl: row.coverUrl }),
      ...(row.externalUrl === null ? {} : { externalUrl: row.externalUrl }),
      ...(row.isrc === null ? {} : { isrc: row.isrc }),
    }
    return autoplaySuggestionSchema.parse({
      track,
      generatedAt: row.generatedAt,
      provider: row.provider,
      seedFingerprint: row.seedFingerprint,
    })
  }

  replace(suggestion: AutoplaySuggestion): AutoplaySuggestion {
    const { track } = autoplaySuggestionSchema.parse(suggestion)
    this.db
      .insert(autoplaySuggestions)
      .values({
        id: 1,
        trackId: track.id,
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        title: track.title,
        artistsJson: JSON.stringify(track.artists),
        albumName: track.albumName ?? null,
        durationMs: track.durationMs,
        coverUrl: track.coverUrl ?? null,
        externalUrl: track.externalUrl ?? null,
        isrc: track.isrc ?? null,
        generatedAt: suggestion.generatedAt,
        seedFingerprint: suggestion.seedFingerprint,
      })
      .onConflictDoUpdate({
        target: autoplaySuggestions.id,
        set: {
          trackId: track.id,
          provider: track.provider,
          providerTrackId: track.providerTrackId,
          title: track.title,
          artistsJson: JSON.stringify(track.artists),
          albumName: track.albumName ?? null,
          durationMs: track.durationMs,
          coverUrl: track.coverUrl ?? null,
          externalUrl: track.externalUrl ?? null,
          isrc: track.isrc ?? null,
          generatedAt: suggestion.generatedAt,
          seedFingerprint: suggestion.seedFingerprint,
        },
      })
      .run()
    const persisted = this.get()
    if (!persisted) throw new Error('Autoplay suggestion was not persisted')
    return persisted
  }

  clear(): boolean {
    return this.db.delete(autoplaySuggestions).where(eq(autoplaySuggestions.id, 1)).run().changes > 0
  }

  reject(spotifyTrackId: string, createdAt: string, expiresAt: string): void {
    this.db
      .insert(autoplayRejections)
      .values({ spotifyTrackId, createdAt, expiresAt })
      .onConflictDoUpdate({ target: autoplayRejections.spotifyTrackId, set: { createdAt, expiresAt } })
      .run()
  }

  listRejected(now: string): Set<string> {
    this.db.delete(autoplayRejections).where(lte(autoplayRejections.expiresAt, now)).run()
    return new Set(
      this.db
        .select({ id: autoplayRejections.spotifyTrackId })
        .from(autoplayRejections)
        .where(gt(autoplayRejections.expiresAt, now))
        .all()
        .map(({ id }) => id),
    )
  }
}
