import {
  autoplaySuggestionSchema,
  type AutoplaySuggestion,
  type TrackMetadata,
} from '@waves/shared'
import { asc, eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { autoplaySuggestions } from '../db/schema'

const MAX_AUTOPLAY_SUGGESTIONS = 6

export interface StoredAutoplaySuggestion extends AutoplaySuggestion {
  sourceTag?: string
}

type SuggestionRow = typeof autoplaySuggestions.$inferSelect

function parseArtists(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in autoplay_suggestions')
  }
  return parsed
}

export class AutoplaySuggestionRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  list(): StoredAutoplaySuggestion[] {
    return this.db
      .select()
      .from(autoplaySuggestions)
      .orderBy(asc(autoplaySuggestions.position))
      .all()
      .map((row) => this.mapRow(row))
  }

  replaceAll(suggestions: StoredAutoplaySuggestion[]): StoredAutoplaySuggestion[] {
    const parsed = suggestions.slice(0, MAX_AUTOPLAY_SUGGESTIONS).map((suggestion) => ({
      ...autoplaySuggestionSchema.parse(suggestion),
      ...(suggestion.sourceTag === undefined ? {} : { sourceTag: suggestion.sourceTag }),
    }))

    this.clear()
    parsed.forEach((suggestion, position) => {
      const { track } = suggestion
      this.db
        .insert(autoplaySuggestions)
        .values({
          id: position + 1,
          position,
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
          strategy: suggestion.strategy,
          sourceTag: suggestion.sourceTag ?? null,
        })
        .run()
    })
    return this.list()
  }

  clear(): boolean {
    return this.db.delete(autoplaySuggestions).run().changes > 0
  }

  removeByProviderTrackId(providerTrackId: string): boolean {
    return (
      this.db
        .delete(autoplaySuggestions)
        .where(eq(autoplaySuggestions.providerTrackId, providerTrackId))
        .run().changes > 0
    )
  }

  findByProviderTrackId(providerTrackId: string): StoredAutoplaySuggestion | undefined {
    return this.list().find((suggestion) => suggestion.track.providerTrackId === providerTrackId)
  }

  compactPositions(): StoredAutoplaySuggestion[] {
    return this.replaceAll(this.list())
  }

  private mapRow(row: SuggestionRow): StoredAutoplaySuggestion {
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
    const suggestion = autoplaySuggestionSchema.parse({
      track,
      generatedAt: row.generatedAt,
      provider: row.provider,
      seedFingerprint: row.seedFingerprint,
      strategy: row.strategy,
    })
    return { ...suggestion, ...(row.sourceTag === null ? {} : { sourceTag: row.sourceTag }) }
  }
}
