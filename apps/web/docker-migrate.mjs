import Database from 'better-sqlite3'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const url = process.env.DATABASE_URL ?? 'file:/data/waves.db'
const filename = url.startsWith('file:') ? url.slice('file:'.length) : url
const sqlite = new Database(filename)

try {
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  migrate(drizzle(sqlite), { migrationsFolder: '/app/apps/web/drizzle' })
} finally {
  sqlite.close()
}
