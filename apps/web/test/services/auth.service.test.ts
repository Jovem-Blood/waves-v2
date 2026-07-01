import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { SessionRepository } from '../../server/repositories/session.repository'
import { UserRepository } from '../../server/repositories/user.repository'
import { DiscordLoginTokenRepository } from '../../server/repositories/discord-login-token.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { AuthService } from '../../server/services/auth.service'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

function setup(now: () => Date, token = 'session-token') {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  let nextId = 0
  const service = new AuthService(
    new UserRepository(connection.db),
    new SessionRepository(connection.db),
    new DiscordLoginTokenRepository(connection.db),
    new QueueRepository(connection.db),
    now,
    () => `auth-${++nextId}`,
    () => token,
  )

  return { connection, service }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('AuthService', () => {
  it('creates a guest user and authenticates by session token hash', () => {
    const now = () => new Date('2026-06-18T16:00:00.000Z')
    const { connection, service } = setup(now)

    const created = service.createGuestSession({ displayName: '  Luis  ' })

    expect(created).toMatchObject({
      token: 'session-token',
      user: { id: 'auth-1', kind: 'guest', displayName: 'Luis' },
    })
    expect(connection.sqlite.prepare('select token_hash from sessions').get()).not.toEqual({
      token_hash: 'session-token',
    })
    expect(service.getCurrentSession('session-token')).toMatchObject({
      user: { id: 'auth-1', displayName: 'Luis' },
      renewed: false,
    })
  })

  it('renews a valid session at most after the renewal window', () => {
    let currentTime = new Date('2026-06-18T16:00:00.000Z')
    const { connection, service } = setup(() => currentTime)
    service.createGuestSession({ displayName: 'Luis' })

    currentTime = new Date('2026-06-19T16:00:00.000Z')
    expect(service.getCurrentSession('session-token')).toMatchObject({ renewed: true })
    expect(connection.sqlite.prepare('select last_seen_at from sessions').get()).toEqual({
      last_seen_at: '2026-06-19T16:00:00.000Z',
    })

    currentTime = new Date('2026-06-19T16:30:00.000Z')
    expect(service.getCurrentSession('session-token')).toMatchObject({ renewed: false })
  })

  it('deletes expired sessions and does not authenticate them', () => {
    let currentTime = new Date('2026-06-18T16:00:00.000Z')
    const { connection, service } = setup(() => currentTime)
    service.createGuestSession({ displayName: 'Luis' })

    currentTime = new Date('2026-09-17T16:00:00.000Z')
    expect(service.getCurrentSession('session-token')).toBeUndefined()
    expect(connection.sqlite.prepare('select count(*) as count from sessions').get()).toEqual({
      count: 0,
    })
  })

  it('creates a one-time Discord link and consumes it as a persistent session', () => {
    const now = () => new Date('2026-06-18T16:00:00.000Z')
    const { service } = setup(now, 'discord-link-token')

    const link = service.createDiscordLink(
      {
        discordUserId: 'discord-1',
        discordUsername: 'luis',
        discordGlobalName: 'Luis',
        discordAvatarUrl: 'https://cdn.example/avatar.png',
        guildId: 'guild-1',
      },
      'https://waves.example.com',
    )

    expect(link.url).toBe('https://waves.example.com/auth/discord-link?token=discord-link-token')
    expect(link.expiresAt).toBe('2026-06-18T16:10:00.000Z')

    const consumed = service.consumeDiscordLink('discord-link-token')
    expect(consumed).toMatchObject({
      token: 'discord-link-token',
      user: {
        kind: 'discord',
        displayName: 'Luis',
        avatarUrl: 'https://cdn.example/avatar.png',
        discordUserId: 'discord-1',
      },
      migratedQueueItems: 0,
    })
    expect(() => service.consumeDiscordLink('discord-link-token')).toThrow(
      'Discord link has already been used',
    )
  })

  it('rejects expired and invalid Discord links', () => {
    let currentTime = new Date('2026-06-18T16:00:00.000Z')
    const { service } = setup(() => currentTime, 'expired-link-token')
    service.createDiscordLink(
      { discordUserId: 'discord-1', discordUsername: 'luis' },
      'https://waves.example.com',
    )

    currentTime = new Date('2026-06-18T16:10:01.000Z')
    expect(() => service.consumeDiscordLink('expired-link-token')).toThrow('Discord link expired')
    expect(() => service.consumeDiscordLink('missing-token')).toThrow('Discord link is invalid')
  })

  it('migrates guest queue items to the linked Discord user', () => {
    const now = () => new Date('2026-06-18T16:00:00.000Z')
    const { connection, service } = setup(now, 'shared-token')
    const guest = service.createGuestSession({ displayName: 'Guest Luis' })
    connection.sqlite
      .prepare(
        `
        insert into queue_items (
          id, track_id, provider, provider_track_id, title, artists_json,
          duration_ms, requested_by_user_id, requested_by_display_name,
          status, position, created_at, updated_at
        ) values (?, ?, 'spotify', ?, ?, '["Artist"]', 1000, ?, ?, 'queued', 0, ?, ?)
      `,
      )
      .run(
        'queue-1',
        'spotify:track-1',
        'track-1',
        'Track One',
        guest.user.id,
        guest.user.displayName,
        '2026-06-18T16:00:00.000Z',
        '2026-06-18T16:00:00.000Z',
      )

    service.createDiscordLink(
      { discordUserId: 'discord-1', discordUsername: 'luis' },
      'https://waves.example.com',
    )
    const consumed = service.consumeDiscordLink('shared-token', guest.token)

    expect(consumed.migratedQueueItems).toBe(1)
    expect(connection.sqlite.prepare('select requested_by_user_id from queue_items').get()).toEqual(
      {
        requested_by_user_id: consumed.user.id,
      },
    )
  })
})
