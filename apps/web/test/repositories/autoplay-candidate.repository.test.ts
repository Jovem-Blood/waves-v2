import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { AutoplayCandidateRepository } from '../../server/repositories/autoplay-candidate.repository'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
let connection: DatabaseConnection

beforeEach(() => {
  connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
})
afterEach(() => connection.close())

describe('AutoplayCandidateRepository', () => {
  it('persists at most thirty ordered unresolved candidates', () => {
    const repository = new AutoplayCandidateRepository(connection.db)
    repository.replaceAll(
      Array.from({ length: 35 }, (_, index) => ({
        provider: 'lastfm' as const,
        identityKey: `track-${index}::artist`,
        title: `Track ${index}`,
        artists: ['Artist'],
        score: 1 - index / 100,
        baseScore: 1 - index / 100,
        strategy: 'similar' as const,
        seedTrackKey: 'spotify:seed',
        seedFingerprint: 'context',
        generatedAt: '2026-06-18T17:00:00.000Z',
      })),
    )

    expect(repository.list()).toHaveLength(30)
    expect(repository.remove('track-0::artist')).toBe(true)
    expect(repository.list()[0]?.identityKey).toBe('track-1::artist')
  })
})
