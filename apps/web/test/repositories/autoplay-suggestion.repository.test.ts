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
  it('persists ordered suggestions and removes one by provider track id', () => {
    const repository = new AutoplaySuggestionRepository(connection.db)
    repository.replaceAll([
      {
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
        strategy: 'similar',
      },
      {
        track: {
          id: 'spotify:two',
          provider: 'spotify',
          providerTrackId: 'two',
          title: 'Two',
          artists: ['Artist'],
          durationMs: 124_000,
        },
        provider: 'spotify',
        generatedAt,
        seedFingerprint: 'seed-one',
        strategy: 'adjacent',
      },
    ])

    expect(repository.list().map((suggestion) => suggestion.track.providerTrackId)).toEqual([
      'one',
      'two',
    ])
    expect(repository.removeByProviderTrackId('one')).toBe(true)
    expect(repository.list().map((suggestion) => suggestion.track.providerTrackId)).toEqual(['two'])
    expect(repository.removeByProviderTrackId('missing')).toBe(false)
    repository.compactPositions()
    expect(repository.list()).toMatchObject([{ track: { providerTrackId: 'two' } }])
    expect(repository.clear()).toBe(true)
    expect(repository.list()).toEqual([])
  })

  it('persists six suggestions with their strategies', () => {
    const repository = new AutoplaySuggestionRepository(connection.db)
    const suggestions = Array.from({ length: 6 }, (_, index) => ({
      track: {
        id: `spotify:${index}`,
        provider: 'spotify' as const,
        providerTrackId: String(index),
        title: `Track ${index}`,
        artists: ['Artist'],
        durationMs: 120_000,
      },
      provider: 'spotify' as const,
      generatedAt,
      seedFingerprint: 'seed-six',
      strategy: index === 5 ? ('explore' as const) : ('similar' as const),
    }))
    expect(repository.replaceAll(suggestions)).toHaveLength(6)
    expect(repository.list()[5]?.strategy).toBe('explore')
  })
})
