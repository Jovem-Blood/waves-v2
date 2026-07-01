import { eq } from 'drizzle-orm'

import type { WavesDatabaseExecutor } from '../db/client'
import { sessions, users } from '../db/schema'
import type { UserRow } from './user.repository'

export type SessionRow = typeof sessions.$inferSelect

export interface CreateSessionInput {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export interface AuthenticatedSessionRow {
  session: SessionRow
  user: UserRow
}

export interface RenewSessionInput {
  tokenHash: string
  expiresAt: string
  lastSeenAt: string
  updatedAt: string
}

export class SessionRepository {
  constructor(private readonly db: WavesDatabaseExecutor) {}

  create(input: CreateSessionInput): SessionRow {
    this.db.insert(sessions).values(input).run()
    return this.requireById(input.id)
  }

  findByTokenHash(tokenHash: string): AuthenticatedSessionRow | undefined {
    const row = this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .get()
    return row
  }

  renew(input: RenewSessionInput): void {
    this.db
      .update(sessions)
      .set({
        expiresAt: input.expiresAt,
        lastSeenAt: input.lastSeenAt,
        updatedAt: input.updatedAt,
      })
      .where(eq(sessions.tokenHash, input.tokenHash))
      .run()
  }

  deleteByTokenHash(tokenHash: string): boolean {
    return this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run().changes > 0
  }

  private findById(id: string): SessionRow | undefined {
    return this.db.select().from(sessions).where(eq(sessions.id, id)).get()
  }

  private requireById(id: string): SessionRow {
    const session = this.findById(id)
    if (!session) {
      throw new Error(`Session ${id} was not persisted`)
    }
    return session
  }
}
