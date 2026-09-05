import type { QueueItem, TrackMetadata } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import { AutoplaySessionProfile } from '../../server/services/autoplay/session-profile'

const track: TrackMetadata = {
  id: 'spotify:track',
  provider: 'spotify',
  providerTrackId: 'track',
  title: 'Track',
  artists: ['Artist'],
  durationMs: 120_000,
}

function item(origin: QueueItem['origin']): QueueItem {
  return {
    id: `${origin}-item`,
    track,
    origin,
    status: 'playing',
    position: 0,
    createdAt: '2026-06-18T17:00:00.000Z',
    updatedAt: '2026-06-18T17:00:00.000Z',
  }
}

const candidate = {
  provider: 'lastfm' as const,
  identityKey: 'track::artist',
  title: 'Track',
  artists: ['Artist'],
  score: 1,
  strategy: 'similar' as const,
  seedTrackKey: 'spotify:seed',
}

describe('AutoplaySessionProfile', () => {
  it('penalizes only autoplay skips and resets on session end', () => {
    const profile = new AutoplaySessionProfile()
    profile.begin('guild')
    profile.recordSkip(item('human'))
    expect(profile.score(candidate)).toBe(0)

    profile.recordSkip(item('autoplay'))
    expect(profile.score(candidate)).toBe(-0.3)

    profile.reset()
    expect(profile.score(candidate)).toBe(0)
  })

  it('treats direct ghost removal as a session rejection', () => {
    const profile = new AutoplaySessionProfile()
    profile.reject({
      track,
      provider: 'spotify',
      generatedAt: '2026-06-18T17:00:00.000Z',
      seedFingerprint: 'context',
      strategy: 'explore',
      sourceTag: 'rock',
    })
    expect(profile.isRejected(track)).toBe(true)
    expect(profile.score({ ...candidate, strategy: 'explore', sourceTag: 'rock' })).toBe(-0.3)
  })
})
