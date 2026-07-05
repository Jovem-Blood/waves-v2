import {
  publicUserSchema,
  queueItemSchema,
  type QueueItem,
  type QueueItemStatus,
  type TrackMetadata,
} from '@waves/shared'
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { queueItems, users } from '../db/schema'
import type { UserRow } from './user.repository'

type QueueItemRow = typeof queueItems.$inferSelect
type QueueItemWithUserRow = { item: QueueItemRow; user: UserRow | null }

export interface QueuePositionUpdate {
  id: string
  position: number
  updatedAt: string
}

export interface QueueStatusAndPositionUpdate {
  status: QueueItemStatus
  position: number
  updatedAt: string
  removedAt?: string | null
}

function parseArtists(artistsJson: string): string[] {
  const parsed: unknown = JSON.parse(artistsJson)

  if (!Array.isArray(parsed) || !parsed.every((artist) => typeof artist === 'string')) {
    throw new Error('Invalid artists JSON stored in queue_items')
  }

  return parsed
}

function mapRow(row: QueueItemRow, user?: UserRow | null): QueueItem {
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

  return queueItemSchema.parse({
    id: row.id,
    track,
    ...(row.requestedByUserId === null ? {} : { requestedByUserId: row.requestedByUserId }),
    ...(user === undefined || user === null
      ? {}
      : {
          requestedByUser: publicUserSchema.parse({
            id: user.id,
            kind: user.kind,
            displayName: user.displayName,
            ...(user.avatarUrl === null ? {} : { avatarUrl: user.avatarUrl }),
            ...(user.discordUserId === null ? {} : { discordUserId: user.discordUserId }),
          }),
        }),
    ...(row.requestedByDiscordUserId === null
      ? {}
      : { requestedByDiscordUserId: row.requestedByDiscordUserId }),
    ...(row.requestedByDisplayName === null
      ? {}
      : { requestedByDisplayName: row.requestedByDisplayName }),
    status: row.status,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function mapJoinedRow(row: QueueItemWithUserRow): QueueItem {
  return mapRow(row.item, row.user)
}

function toInsert(item: QueueItem): typeof queueItems.$inferInsert {
  const parsed = queueItemSchema.parse(item)

  return {
    id: parsed.id,
    trackId: parsed.track.id,
    provider: parsed.track.provider,
    providerTrackId: parsed.track.providerTrackId,
    title: parsed.track.title,
    artistsJson: JSON.stringify(parsed.track.artists),
    ...(parsed.track.albumName === undefined ? {} : { albumName: parsed.track.albumName }),
    durationMs: parsed.track.durationMs,
    ...(parsed.track.coverUrl === undefined ? {} : { coverUrl: parsed.track.coverUrl }),
    ...(parsed.track.externalUrl === undefined ? {} : { externalUrl: parsed.track.externalUrl }),
    ...(parsed.track.isrc === undefined ? {} : { isrc: parsed.track.isrc }),
    ...(parsed.requestedByUserId === undefined
      ? {}
      : { requestedByUserId: parsed.requestedByUserId }),
    ...(parsed.requestedByDiscordUserId === undefined
      ? {}
      : { requestedByDiscordUserId: parsed.requestedByDiscordUserId }),
    ...(parsed.requestedByDisplayName === undefined
      ? {}
      : { requestedByDisplayName: parsed.requestedByDisplayName }),
    status: parsed.status,
    position: parsed.position,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

export class QueueRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  listActive(): QueueItem[] {
    return this.db
      .select({ item: queueItems, user: users })
      .from(queueItems)
      .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
      .where(inArray(queueItems.status, ['queued', 'playing']))
      .orderBy(asc(queueItems.position))
      .all()
      .map(mapJoinedRow)
  }

  listForRecalculation(): QueueItem[] {
    return this.listActive()
  }

  listRecentPlayed(limit: number): QueueItem[] {
    return this.db
      .select({ item: queueItems, user: users })
      .from(queueItems)
      .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
      .where(eq(queueItems.status, 'played'))
      .orderBy(desc(queueItems.updatedAt))
      .limit(limit)
      .all()
      .map(mapJoinedRow)
  }

  findActiveByTrack(
    provider: TrackMetadata['provider'],
    providerTrackId: string,
  ): QueueItem | undefined {
    const row = this.db
      .select({ item: queueItems, user: users })
      .from(queueItems)
      .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
      .where(
        and(
          eq(queueItems.provider, provider),
          eq(queueItems.providerTrackId, providerTrackId),
          inArray(queueItems.status, ['queued', 'playing']),
        ),
      )
      .get()
    return row ? mapJoinedRow(row) : undefined
  }

  findById(id: string): QueueItem | undefined {
    const row = this.db
      .select({ item: queueItems, user: users })
      .from(queueItems)
      .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
      .where(eq(queueItems.id, id))
      .get()
    return row ? mapJoinedRow(row) : undefined
  }

  insert(item: QueueItem): QueueItem {
    this.db.insert(queueItems).values(toInsert(item)).run()
    return this.requireById(item.id)
  }

  updateStatusAndPosition(id: string, update: QueueStatusAndPositionUpdate): QueueItem | undefined {
    this.db
      .update(queueItems)
      .set({
        status: update.status,
        position: update.position,
        updatedAt: update.updatedAt,
        ...(update.removedAt === undefined ? {} : { removedAt: update.removedAt }),
      })
      .where(eq(queueItems.id, id))
      .run()

    return this.findById(id)
  }

  restore(id: string, position: number, updatedAt: string): QueueItem | undefined {
    this.db
      .update(queueItems)
      .set({ status: 'queued', position, removedAt: null, updatedAt })
      .where(eq(queueItems.id, id))
      .run()
    return this.findById(id)
  }

  getRemovedAt(id: string): string | undefined {
    const row = this.db
      .select({ removedAt: queueItems.removedAt })
      .from(queueItems)
      .where(eq(queueItems.id, id))
      .get()
    return row?.removedAt ?? undefined
  }

  updatePositions(updates: readonly QueuePositionUpdate[]): QueueItem[] {
    return this.db.transaction((tx) => {
      const maximumPosition =
        tx
          .select({ value: max(queueItems.position) })
          .from(queueItems)
          .get()?.value ?? -1

      for (const [index, update] of updates.entries()) {
        tx.update(queueItems)
          .set({
            position: maximumPosition + index + 1,
            updatedAt: update.updatedAt,
          })
          .where(eq(queueItems.id, update.id))
          .run()
      }

      for (const update of updates) {
        tx.update(queueItems)
          .set({ position: update.position, updatedAt: update.updatedAt })
          .where(eq(queueItems.id, update.id))
          .run()
      }

      return updates.map(({ id }) => {
        const row = tx
          .select({ item: queueItems, user: users })
          .from(queueItems)
          .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
          .where(eq(queueItems.id, id))
          .get()

        if (!row) {
          throw new Error(`Queue item ${id} was not found while updating positions`)
        }

        return mapJoinedRow(row)
      })
    })
  }

  delete(id: string): boolean {
    return this.db.delete(queueItems).where(eq(queueItems.id, id)).run().changes > 0
  }

  reassignRequester(fromUserId: string, toUserId: string, updatedAt: string): number {
    return this.db
      .update(queueItems)
      .set({ requestedByUserId: toUserId, updatedAt })
      .where(eq(queueItems.requestedByUserId, fromUserId))
      .run().changes
  }

  private requireById(id: string): QueueItem {
    const item = this.findById(id)

    if (!item) {
      throw new Error(`Queue item ${id} was not persisted`)
    }

    return item
  }
}
