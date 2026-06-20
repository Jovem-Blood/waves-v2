import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

function setup(): { connection: DatabaseConnection; repository: PlayerStateRepository } {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)

  return {
    connection,
    repository: new PlayerStateRepository(
      connection.db,
      () => new Date('2026-06-18T12:00:00.000Z'),
    ),
  }
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('PlayerStateRepository', () => {
  it('creates the initial idle state only once', () => {
    const { connection, repository } = setup()

    expect(repository.get()).toEqual({
      status: 'idle',
      updatedAt: '2026-06-18T12:00:00.000Z',
    })
    expect(repository.get()).toEqual({
      status: 'idle',
      updatedAt: '2026-06-18T12:00:00.000Z',
    })

    const count = connection.sqlite.prepare('select count(*) as count from player_state').get() as {
      count: number
    }
    expect(count.count).toBe(1)
  })

  it('persists singleton updates', () => {
    const { connection, repository } = setup()

    expect(
      repository.update({
        status: 'playing',
        voiceChannelId: 'voice-1',
        guildId: 'guild-1',
        updatedAt: '2026-06-18T13:00:00.000Z',
      }),
    ).toEqual({
      status: 'playing',
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      updatedAt: '2026-06-18T13:00:00.000Z',
    })

    const secondRepository = new PlayerStateRepository(connection.db)
    expect(secondRepository.get()).toEqual({
      status: 'playing',
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      updatedAt: '2026-06-18T13:00:00.000Z',
    })
  })
})
