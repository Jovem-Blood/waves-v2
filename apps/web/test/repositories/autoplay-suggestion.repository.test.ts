import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { AutoplaySuggestionRepository } from '../../server/repositories/autoplay-suggestion.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const generatedAt = '2026-06-18T17:00:00.000Z'
let connection: DatabaseConnection

beforeEach(() => {
  connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
})
afterEach(() => connection.close())

describe('AutoplaySuggestionRepository', () => {
  it('persists canonical metadata separately and replaces the singleton atomically', () => {
    const repository = new AutoplaySuggestionRepository(connection.db)
    repository.replace({
      track: {
        id: 'spotify:one',
        provider: 'spotify',
        providerTrackId: 'one',
        title: 'One',
        artists: ['Artist'],
        albumName: 'Album',
        durationMs: 123_000,
        isrc: 'BRABC1234567',
      },
      provider: 'spotify',
      generatedAt,
      seedFingerprint: 'seed-one',
    })

    expect(repository.get()).toMatchObject({
      track: { providerTrackId: 'one', albumName: 'Album', isrc: 'BRABC1234567' },
      generatedAt,
      provider: 'spotify',
      seedFingerprint: 'seed-one',
    })
    expect(repository.clear()).toBe(true)
    expect(repository.get()).toBeUndefined()
  })

  it('returns only unexpired rejected Spotify IDs', () => {
    const repository = new AutoplaySuggestionRepository(connection.db)
    repository.reject('expired', generatedAt, '2026-06-18T17:30:00.000Z')
    repository.reject('active', generatedAt, '2026-06-18T19:00:00.000Z')
    expect(repository.listRejected('2026-06-18T18:00:00.000Z')).toEqual(new Set(['active']))
  })
})
