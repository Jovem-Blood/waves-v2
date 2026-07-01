import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { users } from '../db/schema'

export type UserRow = typeof users.$inferSelect

export interface CreateUserInput {
  id: string
  kind: 'guest' | 'discord'
  displayName: string
  avatarUrl?: string
  discordUserId?: string
  discordUsername?: string
  discordGlobalName?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertDiscordUserInput {
  id: string
  discordUserId: string
  discordUsername: string
  discordGlobalName?: string
  avatarUrl?: string
  displayName: string
  createdAt: string
  updatedAt: string
}

export class UserRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  create(input: CreateUserInput): UserRow {
    this.db.insert(users).values(input).run()
    return this.requireById(input.id)
  }

  findById(id: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get()
  }

  findByDiscordUserId(discordUserId: string): UserRow | undefined {
    return this.db.select().from(users).where(eq(users.discordUserId, discordUserId)).get()
  }

  upsertDiscordUser(input: UpsertDiscordUserInput): UserRow {
    const existing = this.findByDiscordUserId(input.discordUserId)
    if (existing) {
      this.db
        .update(users)
        .set({
          kind: 'discord',
          displayName: input.displayName,
          discordUsername: input.discordUsername,
          discordGlobalName: input.discordGlobalName ?? null,
          avatarUrl: input.avatarUrl ?? null,
          updatedAt: input.updatedAt,
        })
        .where(eq(users.id, existing.id))
        .run()
      return this.requireById(existing.id)
    }

    return this.create({
      id: input.id,
      kind: 'discord',
      displayName: input.displayName,
      discordUserId: input.discordUserId,
      discordUsername: input.discordUsername,
      ...(input.discordGlobalName === undefined
        ? {}
        : { discordGlobalName: input.discordGlobalName }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
  }

  updateDisplayName(id: string, displayName: string, updatedAt: string): UserRow | undefined {
    this.db.update(users).set({ displayName, updatedAt }).where(eq(users.id, id)).run()
    return this.findById(id)
  }

  private requireById(id: string): UserRow {
    const user = this.findById(id)
    if (!user) {
      throw new Error(`User ${id} was not persisted`)
    }
    return user
  }
}
