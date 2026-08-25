import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  createDiscordLinkInputSchema,
  createGuestSessionInputSchema,
  type CreateDiscordLinkInput,
  type CreateDiscordLinkResponse,
  publicUserSchema,
  type CreateGuestSessionInput,
  type PublicUser,
} from '@waves/shared'

import type { DiscordLoginTokenRepository } from '../repositories/discord-login-token.repository'
import type { QueueRepository } from '../repositories/queue.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { UserRepository, UserRow } from '../repositories/user.repository'

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000
const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000
const DISCORD_LINK_DURATION_MS = 10 * 60 * 1000

export const SESSION_COOKIE_NAME = 'waves_session'

interface CreatedSession {
  token: string
  user: PublicUser
  expiresAt: string
}

interface ConsumedDiscordLinkSession extends CreatedSession {
  migratedQueueItems: number
}

export class DiscordLinkInvalidError extends Error {
  constructor() {
    super('Discord link is invalid')
    this.name = 'DiscordLinkInvalidError'
  }
}

export class DiscordLinkExpiredError extends Error {
  constructor() {
    super('Discord link expired')
    this.name = 'DiscordLinkExpiredError'
  }
}

export class DiscordLinkUsedError extends Error {
  constructor() {
    super('Discord link has already been used')
    this.name = 'DiscordLinkUsedError'
  }
}

interface CurrentSession {
  user: PublicUser
  expiresAt: string
  renewed: boolean
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toPublicUser(user: UserRow): PublicUser {
  return publicUserSchema.parse({
    id: user.id,
    kind: user.kind,
    displayName: user.displayName,
    ...(user.avatarUrl === null ? {} : { avatarUrl: user.avatarUrl }),
    ...(user.discordUserId === null ? {} : { discordUserId: user.discordUserId }),
  })
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly discordLoginTokens: DiscordLoginTokenRepository,
    private readonly queueRepository: QueueRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly generateId: () => string = randomUUID,
    private readonly generateToken: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  getCurrentSession(token: string | undefined): CurrentSession | undefined {
    if (!token) return undefined

    const tokenHash = hashSessionToken(token)
    const row = this.sessions.findByTokenHash(tokenHash)
    if (!row) return undefined

    const now = this.now()
    const expiresAt = new Date(row.session.expiresAt)
    if (expiresAt.getTime() <= now.getTime()) {
      this.sessions.deleteByTokenHash(tokenHash)
      return undefined
    }

    const lastSeenAt = new Date(row.session.lastSeenAt)
    const shouldRenew = now.getTime() - lastSeenAt.getTime() >= SESSION_RENEW_AFTER_MS
    if (shouldRenew) {
      const timestamp = now.toISOString()
      const renewedExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString()
      this.sessions.renew({
        tokenHash,
        expiresAt: renewedExpiresAt,
        lastSeenAt: timestamp,
        updatedAt: timestamp,
      })
      return {
        user: toPublicUser(row.user),
        expiresAt: renewedExpiresAt,
        renewed: true,
      }
    }

    return {
      user: toPublicUser(row.user),
      expiresAt: row.session.expiresAt,
      renewed: false,
    }
  }

  findDiscordUser(discordUserId: string): PublicUser | undefined {
    const user = this.users.findByDiscordUserId(discordUserId)
    return user ? toPublicUser(user) : undefined
  }

  createGuestSession(input: CreateGuestSessionInput, existingToken?: string): CreatedSession {
    const parsed = createGuestSessionInputSchema.parse(input)
    const timestamp = this.now().toISOString()
    const current = this.getCurrentSession(existingToken)

    if (current?.user.kind === 'guest') {
      const updated = this.users.updateDisplayName(current.user.id, parsed.displayName, timestamp)
      if (!updated) {
        throw new Error(`User ${current.user.id} was not found while updating guest session`)
      }
      return {
        token: existingToken ?? this.generateToken(),
        user: toPublicUser(updated),
        expiresAt: current.expiresAt,
      }
    }

    const user = this.users.create({
      id: this.generateId(),
      kind: 'guest',
      displayName: parsed.displayName,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return this.createSessionForUser(user, timestamp)
  }

  createDiscordLink(
    input: CreateDiscordLinkInput,
    publicAppUrl: string,
  ): CreateDiscordLinkResponse {
    const parsed = createDiscordLinkInputSchema.parse(input)
    const timestamp = this.now().toISOString()
    const token = this.generateToken()
    const expiresAt = new Date(this.now().getTime() + DISCORD_LINK_DURATION_MS).toISOString()
    this.discordLoginTokens.create({
      id: this.generateId(),
      tokenHash: hashSessionToken(token),
      discordUserId: parsed.discordUserId,
      discordUsername: parsed.discordUsername,
      ...(parsed.discordGlobalName === undefined
        ? {}
        : { discordGlobalName: parsed.discordGlobalName }),
      ...(parsed.discordAvatarUrl === undefined
        ? {}
        : { discordAvatarUrl: parsed.discordAvatarUrl }),
      ...(parsed.guildId === undefined ? {} : { guildId: parsed.guildId }),
      expiresAt,
      createdAt: timestamp,
    })

    const url = new URL('/auth/discord-link', publicAppUrl)
    url.searchParams.set('token', token)

    return { url: url.toString(), expiresAt }
  }

  validateDiscordLink(token: string): void {
    const tokenHash = hashSessionToken(token)
    this.requireUsableDiscordLink(tokenHash)
  }

  consumeDiscordLink(token: string, existingSessionToken?: string): ConsumedDiscordLinkSession {
    const tokenHash = hashSessionToken(token)
    const link = this.requireUsableDiscordLink(tokenHash)
    const now = this.now()
    const timestamp = now.toISOString()
    const displayName = link.discordGlobalName ?? link.discordUsername
    const user = this.users.upsertDiscordUser({
      id: this.generateId(),
      discordUserId: link.discordUserId,
      discordUsername: link.discordUsername,
      ...(link.discordGlobalName === null ? {} : { discordGlobalName: link.discordGlobalName }),
      ...(link.discordAvatarUrl === null ? {} : { avatarUrl: link.discordAvatarUrl }),
      displayName,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    let migratedQueueItems = 0
    const current = this.getCurrentSession(existingSessionToken)
    if (current?.user.kind === 'guest') {
      migratedQueueItems = this.queueRepository.reassignRequester(
        current.user.id,
        user.id,
        timestamp,
      )
    }

    if (existingSessionToken) {
      this.logout(existingSessionToken)
    }

    const session = this.createSessionForUser(user)
    this.discordLoginTokens.markUsed(tokenHash, timestamp)

    return { ...session, migratedQueueItems }
  }

  logout(token: string | undefined): void {
    if (!token) return
    this.sessions.deleteByTokenHash(hashSessionToken(token))
  }

  private createSessionForUser(
    user: UserRow,
    timestamp = this.now().toISOString(),
  ): CreatedSession {
    const token = this.generateToken()
    const expiresAt = new Date(new Date(timestamp).getTime() + SESSION_DURATION_MS).toISOString()

    this.sessions.create({
      id: this.generateId(),
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      lastSeenAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    return { token, user: toPublicUser(user), expiresAt }
  }

  private requireUsableDiscordLink(tokenHash: string) {
    const link = this.discordLoginTokens.findByTokenHash(tokenHash)
    if (!link) throw new DiscordLinkInvalidError()
    if (link.usedAt !== null) throw new DiscordLinkUsedError()

    const now = this.now()
    if (new Date(link.expiresAt).getTime() <= now.getTime()) {
      throw new DiscordLinkExpiredError()
    }

    return link
  }
}
