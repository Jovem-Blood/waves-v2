import { resolvedAudioSourceSchema, type ResolvedAudioSource } from '@waves/shared'
import { and, desc, eq, gt } from 'drizzle-orm'

import type { WavesDatabase } from '../db/client'
import { resolvedSources } from '../db/schema'

type ResolvedSourceRow = typeof resolvedSources.$inferSelect

export interface PersistedResolvedSource extends ResolvedAudioSource {
  id: string
  queueItemId: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: ResolvedSourceRow): PersistedResolvedSource {
  if (row.expiresAt === null) {
    throw new Error('Resolved source is missing expires_at')
  }

  return {
    id: row.id,
    queueItemId: row.queueItemId,
    ...resolvedAudioSourceSchema.parse({
      provider: row.sourceProvider,
      sourceIdentifier: row.sourceIdentifier,
      streamUrl: row.streamUrl,
      expiresAt: row.expiresAt,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class ResolvedSourceRepository {
  constructor(private readonly db: WavesDatabase) {}

  findLatest(queueItemId: string): PersistedResolvedSource | undefined {
    const row = this.db
      .select()
      .from(resolvedSources)
      .where(eq(resolvedSources.queueItemId, queueItemId))
      .orderBy(desc(resolvedSources.updatedAt))
      .get()

    return row ? mapRow(row) : undefined
  }

  findReusable(queueItemId: string, nowIso: string): PersistedResolvedSource | undefined {
    const row = this.db
      .select()
      .from(resolvedSources)
      .where(
        and(eq(resolvedSources.queueItemId, queueItemId), gt(resolvedSources.expiresAt, nowIso)),
      )
      .orderBy(desc(resolvedSources.updatedAt))
      .get()

    return row ? mapRow(row) : undefined
  }

  replace(
    source: ResolvedAudioSource & {
      id: string
      queueItemId: string
      createdAt: string
      updatedAt: string
    },
  ): PersistedResolvedSource {
    return this.db.transaction((tx) => {
      tx.delete(resolvedSources).where(eq(resolvedSources.queueItemId, source.queueItemId)).run()
      tx.insert(resolvedSources)
        .values({
          id: source.id,
          queueItemId: source.queueItemId,
          sourceProvider: source.provider,
          sourceIdentifier: source.sourceIdentifier,
          streamUrl: source.streamUrl,
          expiresAt: source.expiresAt,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        })
        .run()

      const row = tx.select().from(resolvedSources).where(eq(resolvedSources.id, source.id)).get()

      if (!row) {
        throw new Error('Resolved source was not persisted')
      }

      return mapRow(row)
    })
  }
}
