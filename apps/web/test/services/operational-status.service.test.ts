import { fileURLToPath } from 'node:url'

import type { RealtimeEvent } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { OperationalStatusRepository } from '../../server/repositories/operational-status.repository'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { OperationalStatusService } from '../../server/services/operational-status.service'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
})

describe('OperationalStatusService', () => {
  it('derives online, offline, connected and reconnecting states', () => {
    let now = new Date('2026-06-22T12:00:00.000Z')
    const connection = createDatabaseConnection({ url: ':memory:' })
    migrate(connection.db, { migrationsFolder })
    connections.push(connection)
    const nowProvider = () => now
    const operationalRepository = new OperationalStatusRepository(connection.db, nowProvider)
    const playerRepository = new PlayerStateRepository(connection.db, nowProvider)
    const service = new OperationalStatusService(
      operationalRepository,
      playerRepository,
      nowProvider,
    )

    expect(service.get()).toMatchObject({
      bot: { status: 'offline' },
      voice: { status: 'disconnected' },
    })

    playerRepository.update({
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
    })
    service.heartbeat({ occurredAt: now.toISOString() })
    expect(service.setVoiceStatus('connected')).toMatchObject({
      bot: { status: 'online' },
      voice: {
        status: 'connected',
        guildName: 'Waves',
        voiceChannelName: 'ondas-da-noite',
      },
    })
    expect(service.setVoiceStatus('reconnecting').voice).toEqual({ status: 'reconnecting' })

    now = new Date('2026-06-22T12:00:15.001Z')
    expect(service.get()).toMatchObject({
      bot: { status: 'offline' },
      voice: { status: 'disconnected' },
    })
  })

  it('publishes realtime status changes after heartbeat and voice updates', () => {
    const published: RealtimeEvent[] = []
    const now = new Date('2026-06-22T12:00:00.000Z')
    const connection = createDatabaseConnection({ url: ':memory:' })
    migrate(connection.db, { migrationsFolder })
    connections.push(connection)
    const nowProvider = () => now
    const operationalRepository = new OperationalStatusRepository(connection.db, nowProvider)
    const playerRepository = new PlayerStateRepository(connection.db, nowProvider)
    const service = new OperationalStatusService(
      operationalRepository,
      playerRepository,
      nowProvider,
      (event) => {
        published.push(event)
        return { id: String(published.length), event }
      },
    )

    service.heartbeat({ occurredAt: now.toISOString() })
    service.setVoiceStatus('reconnecting')

    expect(published.map((event) => event.type)).toEqual(['status.changed', 'status.changed'])
    expect(published[0]?.type === 'status.changed' ? published[0].status.bot : undefined).toEqual({
      status: 'online',
      lastSeenAt: now.toISOString(),
    })
    expect(published[1]?.type === 'status.changed' ? published[1].status.voice : undefined).toEqual(
      { status: 'reconnecting' },
    )
  })
})
