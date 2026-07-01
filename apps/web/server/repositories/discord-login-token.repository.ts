import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { discordLoginTokens } from '../db/schema'

export type DiscordLoginTokenRow = typeof discordLoginTokens.$inferSelect

export interface CreateDiscordLoginTokenInput {
  id: string
  tokenHash: string
  discordUserId: string
  discordUsername: string
  discordGlobalName?: string
  discordAvatarUrl?: string
  guildId?: string
  expiresAt: string
  createdAt: string
}

export class DiscordLoginTokenRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  create(input: CreateDiscordLoginTokenInput): DiscordLoginTokenRow {
    this.db.insert(discordLoginTokens).values(input).run()
    return this.requireById(input.id)
  }

  findByTokenHash(tokenHash: string): DiscordLoginTokenRow | undefined {
    return this.db
      .select()
      .from(discordLoginTokens)
      .where(eq(discordLoginTokens.tokenHash, tokenHash))
      .get()
  }

  markUsed(tokenHash: string, usedAt: string): boolean {
    return (
      this.db
        .update(discordLoginTokens)
        .set({ usedAt })
        .where(eq(discordLoginTokens.tokenHash, tokenHash))
        .run().changes > 0
    )
  }

  private findById(id: string): DiscordLoginTokenRow | undefined {
    return this.db.select().from(discordLoginTokens).where(eq(discordLoginTokens.id, id)).get()
  }

  private requireById(id: string): DiscordLoginTokenRow {
    const token = this.findById(id)
    if (!token) {
      throw new Error(`Discord login token ${id} was not persisted`)
    }
    return token
  }
}
