import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const connections: DatabaseConnection[] = []

function createMigratedDatabase(): DatabaseConnection {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  connections.push(connection)
  return connection
}

afterEach(() => {
  for (const connection of connections.splice(0)) {
    connection.close()
  }
})

describe('database migrations', () => {
  it('creates all five tables', () => {
    const { sqlite } = createMigratedDatabase()
    const tables = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like '__drizzle%' order by name",
      )
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tables).toEqual([
      'allowed_users',
      'operational_state',
      'player_state',
      'queue_items',
      'resolved_sources',
    ])
  })

  it('deduplicates active tracks and compacts positions before creating the unique index', () => {
    const connection = createDatabaseConnection({ url: ':memory:' })
    connections.push(connection)
    for (const migration of [
      '0000_naive_mystique.sql',
      '0001_player_controls.sql',
      '0002_player_connection_names.sql',
    ]) {
      connection.sqlite.exec(
        readFileSync(`${migrationsFolder}/${migration}`, 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      )
    }
    const insert = connection.sqlite.prepare(`
      insert into queue_items (
        id, track_id, provider, provider_track_id, title, artists_json,
        duration_ms, status, position, created_at, updated_at
      ) values (?, ?, 'spotify', ?, ?, '["Artist"]', 1000, 'queued', ?, ?, ?)
    `)
    insert.run(
      'first',
      'spotify:track-1',
      'track-1',
      'First',
      0,
      '2026-06-22T12:00:00Z',
      '2026-06-22T12:00:00Z',
    )
    insert.run(
      'duplicate',
      'spotify:track-1',
      'track-1',
      'Duplicate',
      1,
      '2026-06-22T12:00:01Z',
      '2026-06-22T12:00:01Z',
    )
    insert.run(
      'other',
      'spotify:track-2',
      'track-2',
      'Other',
      2,
      '2026-06-22T12:00:02Z',
      '2026-06-22T12:00:02Z',
    )

    connection.sqlite.exec(
      readFileSync(`${migrationsFolder}/0003_quick_ux_polish.sql`, 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )

    expect(
      connection.sqlite
        .prepare('select id, status, position from queue_items order by position, id')
        .all(),
    ).toEqual([
      { id: 'first', status: 'queued', position: 0 },
      { id: 'duplicate', status: 'removed', position: 1 },
      { id: 'other', status: 'queued', position: 1 },
    ])
    expect(() =>
      insert.run(
        'again',
        'spotify:track-1',
        'track-1',
        'Again',
        2,
        '2026-06-22T12:00:03Z',
        '2026-06-22T12:00:03Z',
      ),
    ).toThrow()
  })

  it('does not create or change dev.db when using an in-memory database', () => {
    const devDatabase = fileURLToPath(new URL('../../dev.db', import.meta.url))
    const existedBefore = existsSync(devDatabase)
    const contentsBefore = existedBefore ? readFileSync(devDatabase) : undefined

    createMigratedDatabase()

    expect(existsSync(devDatabase)).toBe(existedBefore)
    if (contentsBefore) {
      expect(readFileSync(devDatabase)).toEqual(contentsBefore)
    }
  })
})
