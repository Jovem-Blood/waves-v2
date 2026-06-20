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
  it('creates all four tables', () => {
    const { sqlite } = createMigratedDatabase()
    const tables = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like '__drizzle%' order by name",
      )
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tables).toEqual(['allowed_users', 'player_state', 'queue_items', 'resolved_sources'])
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
