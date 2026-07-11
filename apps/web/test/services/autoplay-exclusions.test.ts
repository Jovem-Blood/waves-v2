import type { AutoplaySuggestion, QueueItem, TrackMetadata } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import {
  buildAutoplayExcludedTrackIds,
  RECENT_PLAYED_LIMIT,
} from '../../server/services/autoplay-exclusions'

const track = (providerTrackId: string): TrackMetadata => ({
  id: `spotify:${providerTrackId}`,
  provider: 'spotify',
  providerTrackId,
  title: providerTrackId,
  artists: ['Artist'],
  durationMs: 120000,
})

const item = (providerTrackId: string, status: QueueItem['status']): QueueItem => ({
  id: `queue:${providerTrackId}`,
  track: track(providerTrackId),
  status,
  position: 0,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:00:00.000Z',
})

const suggestion = (providerTrackId: string): AutoplaySuggestion => ({
  track: track(providerTrackId),
  provider: 'spotify',
  generatedAt: '2026-06-18T12:00:00.000Z',
  seedFingerprint: 'seed',
})

describe('autoplay exclusions', () => {
  it('combines recent, active, visible, rejected and seed tracks', () => {
    const excluded = buildAutoplayExcludedTrackIds({
      active: [item('active', 'playing')],
      recent: [item('recent', 'played')],
      suggestions: [suggestion('visible')],
      rejected: new Set(['rejected']),
      seeds: [track('seed')],
    })

    expect(RECENT_PLAYED_LIMIT).toBe(20)
    expect([...excluded].sort()).toEqual(['active', 'recent', 'rejected', 'seed', 'visible'])
  })
})
