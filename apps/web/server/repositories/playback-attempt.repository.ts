import type { PlaybackAttemptReport, QueueItem } from '@waves/shared'
import { and, asc, eq, gte, lte, sql, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import type { WavesDatabaseExecutor } from '../db/client'
import { playbackAttempts } from '../db/schema'

type PlaybackAttemptRow = typeof playbackAttempts.$inferSelect

export interface PlaybackAttemptRecord {
  id: string
  playbackAttemptId: string
  attemptNumber: number
  queueItemId: string
  outcome: PlaybackAttemptRow['outcome']
  terminal: boolean
  failureStage: string | null
  failureClass: string | null
  errorCode: string | null
  httpStatus: number | null
  trackId: string
  trackProvider: string
  providerTrackId: string
  trackTitle: string
  trackArtists: string[]
  sourceProvider: string | null
  sourceIdentifier: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  playbackDurationMs: number | null
  createdAt: string
  updatedAt: string
}

function parseArtists(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in playback_attempts')
  }
  return parsed
}

function mapRow(row: PlaybackAttemptRow): PlaybackAttemptRecord {
  return {
    ...row,
    trackArtists: parseArtists(row.trackArtistsJson),
  }
}

export interface PlaybackAttemptStartInput {
  playbackAttemptId: string
  attemptNumber: number
  queueItem: QueueItem
  startedAt: string
}

export class PlaybackAttemptRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  touchActive(ids: string[], now: string): void {
    if (!ids.length) return
    this.db
      .update(playbackAttempts)
      .set({ updatedAt: now })
      .where(
        and(inArray(playbackAttempts.playbackAttemptId, ids), eq(playbackAttempts.terminal, false)),
      )
      .run()
  }

  listIncomplete(): PlaybackAttemptRecord[] {
    return this.db
      .select()
      .from(playbackAttempts)
      .where(
        and(
          eq(playbackAttempts.terminal, false),
          sql`not exists (select 1 from playback_attempts other where other.playback_attempt_id = ${playbackAttempts.playbackAttemptId} and (other.terminal = 1 or other.attempt_number > ${playbackAttempts.attemptNumber}))`,
        ),
      )
      .all()
      .map(mapRow)
  }

  start(input: PlaybackAttemptStartInput): PlaybackAttemptRecord {
    const timestamp = input.startedAt
    this.db
      .insert(playbackAttempts)
      .values({
        id: randomUUID(),
        playbackAttemptId: input.playbackAttemptId,
        attemptNumber: input.attemptNumber,
        queueItemId: input.queueItem.id,
        outcome: 'pending',
        terminal: false,
        trackId: input.queueItem.track.id,
        trackProvider: input.queueItem.track.provider,
        providerTrackId: input.queueItem.track.providerTrackId,
        trackTitle: input.queueItem.track.title,
        trackArtistsJson: JSON.stringify(input.queueItem.track.artists),
        startedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [playbackAttempts.playbackAttemptId, playbackAttempts.attemptNumber],
      })
      .run()

    const record = this.find(input.playbackAttemptId, input.attemptNumber)
    if (!record) throw new Error('Playback attempt was not persisted')
    return record
  }

  report(input: PlaybackAttemptReport, queueItem: QueueItem, now: string): PlaybackAttemptRecord {
    const existing = this.find(input.playbackAttemptId, input.attempt)
    if (!existing) {
      this.start({
        playbackAttemptId: input.playbackAttemptId,
        attemptNumber: input.attempt,
        queueItem,
        startedAt: now,
      })
    }

    const current = this.find(input.playbackAttemptId, input.attempt)
    if (!current) throw new Error('Playback attempt was not persisted')
    if (current.terminal) return current
    if (current.outcome !== 'pending' && input.outcome === 'pending') return current

    const finished = input.outcome === 'pending' ? undefined : now
    this.db
      .update(playbackAttempts)
      .set({
        outcome: input.outcome,
        terminal: input.terminal,
        failureStage: input.failureStage ?? current.failureStage,
        failureClass: input.failureClass ?? current.failureClass,
        errorCode: input.errorCode ?? current.errorCode,
        httpStatus: input.httpStatus ?? current.httpStatus,
        sourceProvider: input.sourceProvider ?? current.sourceProvider,
        sourceIdentifier: input.sourceIdentifier ?? current.sourceIdentifier,
        finishedAt: finished ?? current.finishedAt,
        durationMs: input.durationMs ?? current.durationMs,
        playbackDurationMs: input.playbackDurationMs ?? current.playbackDurationMs,
        updatedAt: now,
      })
      .where(eq(playbackAttempts.id, current.id))
      .run()

    const updated = this.find(input.playbackAttemptId, input.attempt)
    if (!updated) throw new Error('Playback attempt update was not persisted')
    return updated
  }

  find(playbackAttemptId: string, attemptNumber: number): PlaybackAttemptRecord | undefined {
    const row = this.db
      .select()
      .from(playbackAttempts)
      .where(
        and(
          eq(playbackAttempts.playbackAttemptId, playbackAttemptId),
          eq(playbackAttempts.attemptNumber, attemptNumber),
        ),
      )
      .get()
    return row ? mapRow(row) : undefined
  }

  findLatestForQueueItem(queueItemId: string): PlaybackAttemptRecord | undefined {
    const row = this.db
      .select()
      .from(playbackAttempts)
      .where(eq(playbackAttempts.queueItemId, queueItemId))
      .orderBy(asc(playbackAttempts.startedAt), asc(playbackAttempts.attemptNumber))
      .all()
      .at(-1)
    return row ? mapRow(row) : undefined
  }

  listSince(from: string, to: string): PlaybackAttemptRecord[] {
    return this.db
      .select()
      .from(playbackAttempts)
      .where(and(gte(playbackAttempts.startedAt, from), lte(playbackAttempts.startedAt, to)))
      .orderBy(asc(playbackAttempts.startedAt))
      .limit(10_000)
      .all()
      .map(mapRow)
  }
}
