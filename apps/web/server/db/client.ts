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

  return {
    db: drizzle({ client: sqlite, schema }),
    sqlite,
    close: () => sqlite.close(),
  }
}

let runtimeConnection: DatabaseConnection | undefined

export function useDatabase(): WavesDatabase {
  runtimeConnection ??= createDatabaseConnection()
  return runtimeConnection.db
}
