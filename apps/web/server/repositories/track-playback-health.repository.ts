import type { TrackMetadata } from '@waves/shared'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { trackPlaybackHealth } from '../db/schema'

const SUPPRESSION_DAYS = 7
const CONTENT_ERROR_CODES = new Set(['SOURCE_NOT_FOUND', 'SOURCE_GEO_BLOCKED'])

export interface TrackPlaybackHealthRecord {
  trackKey: string
  provider: string
  providerTrackId: string
  trackId: string
  title: string
  artists: string[]
  successes: number
  failures: number
  contentFailures: number
  lastErrorCode: string | null
  lastFailureClass: string | null
  lastFailureStage: string | null
  lastFailedAt: string | null
  lastPlayedAt: string | null
  updatedAt: string
}

interface PlaybackResult {
  track: TrackMetadata
  outcome: 'played' | 'failed'
  errorCode?: string | null
  failureClass?: string | null
  failureStage?: string | null
  occurredAt: string
}

function mapRow(row: typeof trackPlaybackHealth.$inferSelect): TrackPlaybackHealthRecord {
  const artists: unknown = JSON.parse(row.artistsJson)
  if (!Array.isArray(artists) || !artists.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in track_playback_health')
  }
  return { ...row, artists }
}

export function isContentPlaybackFailure(errorCode?: string | null): boolean {
  return Boolean(errorCode && CONTENT_ERROR_CODES.has(errorCode))
}

export class TrackPlaybackHealthRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  record(input: PlaybackResult): TrackPlaybackHealthRecord {
    const { track, outcome, occurredAt } = input
    const trackKey = `${track.provider}:${track.providerTrackId}`
    const existing = this.db
      .select()
      .from(trackPlaybackHealth)
      .where(eq(trackPlaybackHealth.trackKey, trackKey))
      .get()
    const contentFailure = outcome === 'failed' && isContentPlaybackFailure(input.errorCode)
    const values = {
      trackKey,
      provider: track.provider,
      providerTrackId: track.providerTrackId,
      trackId: track.id,
      title: track.title,
      artistsJson: JSON.stringify(track.artists),
      successes: (existing?.successes ?? 0) + (outcome === 'played' ? 1 : 0),
      failures: (existing?.failures ?? 0) + (outcome === 'failed' ? 1 : 0),
      contentFailures:
        outcome === 'played' ? 0 : (existing?.contentFailures ?? 0) + (contentFailure ? 1 : 0),
      lastErrorCode:
        outcome === 'failed' ? (input.errorCode ?? null) : (existing?.lastErrorCode ?? null),
      lastFailureClass:
        outcome === 'failed' ? (input.failureClass ?? null) : (existing?.lastFailureClass ?? null),
      lastFailureStage:
        outcome === 'failed' ? (input.failureStage ?? null) : (existing?.lastFailureStage ?? null),
      lastFailedAt: outcome === 'failed' ? occurredAt : (existing?.lastFailedAt ?? null),
      lastPlayedAt: outcome === 'played' ? occurredAt : (existing?.lastPlayedAt ?? null),
      updatedAt: occurredAt,
    }
    this.db
      .insert(trackPlaybackHealth)
      .values(values)
      .onConflictDoUpdate({
        target: trackPlaybackHealth.trackKey,
        set: values,
      })
      .run()
    return this.get(trackKey)!
  }

  get(trackKey: string): TrackPlaybackHealthRecord | undefined {
    const row = this.db
      .select()
      .from(trackPlaybackHealth)
      .where(eq(trackPlaybackHealth.trackKey, trackKey))
      .get()
    return row ? mapRow(row) : undefined
  }

  listProblematic(limit = 50): TrackPlaybackHealthRecord[] {
    return this.db
      .select()
      .from(trackPlaybackHealth)
      .where(gte(trackPlaybackHealth.failures, 1))
      .orderBy(desc(trackPlaybackHealth.failures), desc(trackPlaybackHealth.lastFailedAt))
      .limit(limit)
      .all()
      .map(mapRow)
  }

  suppressedTracks(now: Date): TrackPlaybackHealthRecord[] {
    const cutoff = new Date(now.getTime() - SUPPRESSION_DAYS * 86_400_000).toISOString()
    return this.db
      .select()
      .from(trackPlaybackHealth)
      .where(
        and(
          eq(trackPlaybackHealth.provider, 'spotify'),
          gte(trackPlaybackHealth.contentFailures, 2),
          gte(trackPlaybackHealth.lastFailedAt, cutoff),
          sql`(${trackPlaybackHealth.lastPlayedAt} is null or ${trackPlaybackHealth.lastPlayedAt} < ${trackPlaybackHealth.lastFailedAt})`,
        ),
      )
      .all()
      .map(mapRow)
  }
}
