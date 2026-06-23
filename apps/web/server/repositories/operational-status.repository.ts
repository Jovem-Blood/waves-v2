import type { VoiceOperationalStatus } from '@waves/shared'
import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { operationalState } from '../db/schema'

export interface PersistedOperationalState {
  botLastSeenAt?: string
  voiceStatus: VoiceOperationalStatus
  updatedAt: string
}

export class OperationalStatusRepository {
  constructor(
    private readonly db: WavesDatabaseExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): PersistedOperationalState {
    this.db
      .insert(operationalState)
      .values({
        id: 1,
        voiceStatus: 'disconnected',
        updatedAt: this.now().toISOString(),
      })
      .onConflictDoNothing({ target: operationalState.id })
      .run()

    const row = this.db.select().from(operationalState).where(eq(operationalState.id, 1)).get()
    if (!row) throw new Error('Operational state singleton was not persisted')

    return {
      ...(row.botLastSeenAt === null ? {} : { botLastSeenAt: row.botLastSeenAt }),
      voiceStatus: row.voiceStatus,
      updatedAt: row.updatedAt,
    }
  }

  update(update: {
    botLastSeenAt?: string
    voiceStatus?: VoiceOperationalStatus
    updatedAt: string
  }): PersistedOperationalState {
    this.get()
    this.db.update(operationalState).set(update).where(eq(operationalState.id, 1)).run()
    return this.get()
  }
}
