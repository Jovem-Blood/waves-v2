import Database from 'better-sqlite3'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLiteTransaction } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

export type WavesDatabase = BetterSQLite3Database<typeof schema>
export type WavesTransaction = BetterSQLiteTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>
export type WavesDatabaseExecutor = WavesDatabase | WavesTransaction

export interface DatabaseConnection {
  db: WavesDatabase
  sqlite: Database.Database
  close: () => void
}

export interface CreateDatabaseConnectionOptions {
  url?: string
  readonly?: boolean
}

function toFilename(url: string): string {
  return url.startsWith('file:') ? url.slice('file:'.length) : url
}

export function createDatabaseConnection(
  options: CreateDatabaseConnectionOptions = {},
): DatabaseConnection {
  const url = options.url ?? process.env.DATABASE_URL ?? 'file:./dev.db'
  const sqlite = new Database(toFilename(url), {
    readonly: options.readonly ?? false,
  })

  sqlite.pragma('foreign_keys = ON')

  if (url !== ':memory:' && !options.readonly) {
    sqlite.pragma('journal_mode = WAL')
  }

  let closed = false
  return {
    db: drizzle({ client: sqlite, schema }),
    sqlite,
    close: () => {
      if (!closed) {
        sqlite.close()
        closed = true
      }
    },
  }
}

let runtimeConnection: DatabaseConnection | undefined

export function useDatabaseConnection(): DatabaseConnection {
  runtimeConnection ??= createDatabaseConnection()
  return runtimeConnection
}

export function useDatabase(): WavesDatabase {
  return useDatabaseConnection().db
}

export function checkRuntimeDatabaseReadiness(
  connection: DatabaseConnection = useDatabaseConnection(),
): void {
  const requiredTables = ['operational_state', 'player_state', 'queue_items'] as const
  const rows = connection.sqlite
    .prepare(
      `select name
       from sqlite_master
       where type = 'table'
         and name in ('operational_state', 'player_state', 'queue_items')`,
    )
    .all() as Array<{ name: string }>
  const available = new Set(rows.map(({ name }) => name))
  const missing = requiredTables.filter((name) => !available.has(name))
  if (missing.length > 0) {
    throw new Error(`Database schema is not ready: ${missing.join(', ')}`)
  }
  connection.sqlite.prepare('select 1').get()
}

export function closeRuntimeDatabase(): void {
  const connection = runtimeConnection
  runtimeConnection = undefined
  connection?.close()
}
