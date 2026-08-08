import Database from 'better-sqlite3'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

const backupRoot = resolve(process.argv[2] ?? '/backups')
const databaseUrl = process.env.DATABASE_URL ?? 'file:/data/waves.db'
const databasePath = databaseUrl.startsWith('file:')
  ? databaseUrl.slice('file:'.length)
  : databaseUrl
const now = new Date()
const date = now.toISOString().slice(0, 10)
const dailyRoot = join(backupRoot, 'daily')
const weeklyRoot = join(backupRoot, 'weekly')

function isoWeek(input) {
  const value = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

async function prune(directory, keep) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
    .map((entry) => entry.name)
    .sort()
    .reverse()
  for (const entry of entries.slice(keep)) {
    const path = resolve(directory, entry)
    if (resolve(path, '..') !== resolve(directory)) {
      throw new Error(`Refusing to prune outside ${directory}`)
    }
    await unlink(path)
  }
}

await mkdir(dailyRoot, { recursive: true })
await mkdir(weeklyRoot, { recursive: true })

const database = new Database(databasePath, { readonly: true })
try {
  const dailyPath = join(dailyRoot, `waves-${date}.db`)
  await database.backup(dailyPath)
  if (now.getUTCDay() === 0) {
    await database.backup(join(weeklyRoot, `waves-${isoWeek(now)}.db`))
  }
  await prune(dailyRoot, 14)
  await prune(weeklyRoot, 4)
  process.stdout.write(
    `${JSON.stringify({ operation: 'database.backup', outcome: 'completed', file: basename(dailyPath) })}\n`,
  )
} finally {
  database.close()
}
