import { autoplayStateSchema, type AutoplayFailureCode, type AutoplayState } from '@waves/shared'
import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { autoplayState } from '../db/schema'

export class AutoplayRepository {
  constructor(
    private readonly db: WavesDatabaseExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.db
      .insert(autoplayState)
      .values({ id: 1, enabled: false, updatedAt: this.now().toISOString() })
      .onConflictDoNothing({ target: autoplayState.id })
      .run()
  }

  get(): AutoplayState {
    const row = this.db.select().from(autoplayState).where(eq(autoplayState.id, 1)).get()
    if (!row) throw new Error('Autoplay state was not initialized')
    return autoplayStateSchema.parse({
      enabled: row.enabled,
      failureCode: row.failureCode,
      updatedAt: row.updatedAt,
    })
  }

  update(input: { enabled?: boolean; failureCode?: AutoplayFailureCode | null }): AutoplayState {
    this.db
      .update(autoplayState)
      .set({ ...input, updatedAt: this.now().toISOString() })
      .where(eq(autoplayState.id, 1))
      .run()
    return this.get()
  }
}
