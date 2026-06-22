import { playerStateSchema, type PlayerState, type PlayerStatus } from '@waves/shared'
import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { playerState } from '../db/schema'

type PlayerStateRow = typeof playerState.$inferSelect

export interface PlayerStateUpdate {
  status?: PlayerStatus
  currentQueueItemId?: string | null
  voiceChannelId?: string | null
  voiceChannelName?: string | null
  guildId?: string | null
  guildName?: string | null
  volume?: number
  progressMs?: number
  updatedAt?: string
}

function mapRow(row: PlayerStateRow): PlayerState {
  return playerStateSchema.parse({
    status: row.status,
    ...(row.currentQueueItemId === null ? {} : { currentQueueItemId: row.currentQueueItemId }),
    ...(row.voiceChannelId === null ? {} : { voiceChannelId: row.voiceChannelId }),
    ...(row.voiceChannelName === null ? {} : { voiceChannelName: row.voiceChannelName }),
    ...(row.guildId === null ? {} : { guildId: row.guildId }),
    ...(row.guildName === null ? {} : { guildName: row.guildName }),
    volume: row.volume,
    progressMs: row.progressMs,
    updatedAt: row.updatedAt,
  })
}

export class PlayerStateRepository {
  constructor(
    private readonly db: WavesDatabaseExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): PlayerState {
    this.db
      .insert(playerState)
      .values({
        id: 1,
        status: 'idle',
        volume: 100,
        progressMs: 0,
        updatedAt: this.now().toISOString(),
      })
      .onConflictDoNothing({ target: playerState.id })
      .run()

    return mapRow(this.requireRow())
  }

  update(update: PlayerStateUpdate): PlayerState {
    this.get()

    this.db
      .update(playerState)
      .set({
        ...update,
        updatedAt: update.updatedAt ?? this.now().toISOString(),
      })
      .where(eq(playerState.id, 1))
      .run()

    return mapRow(this.requireRow())
  }

  private requireRow(): PlayerStateRow {
    const row = this.db.select().from(playerState).where(eq(playerState.id, 1)).get()

    if (!row) {
      throw new Error('Player state singleton was not persisted')
    }

    return row
  }
}
