import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import type { YouTubeMusicCandidate } from '../../server/clients/youtube-music.schemas'
import {
  normalizeMusicText,
  selectYouTubeMusicCandidate,
} from '../../server/services/audio-source-matching'

const track: TrackMetadata = {
  id: 'spotify:one',
  provider: 'spotify',
  providerTrackId: 'one',
  title: 'Canção (feat. Artista Dois)',
  artists: ['Artista Um', 'Artista Dois'],
  durationMs: 200_000,
}

function candidate(overrides: Partial<YouTubeMusicCandidate> = {}): YouTubeMusicCandidate {
  return {
    videoId: 'video-1',
    title: 'Cancao featuring Artista Dois',
    artists: ['Artista Um', 'Artista Dois'],
    durationMs: 200_000,
    isOfficial: false,
    isTopic: false,
    ...overrides,
  }
}

describe('YouTube Music matching', () => {
  it('normalizes accents, punctuation and featuring aliases', () => {
    expect(normalizeMusicText('Canção [FT. Alguém]')).toBe('cancao featuring alguem')
    expect(normalizeMusicText('Canção (featuring Alguém)')).toBe('cancao featuring alguem')
  })

  it('accepts duration at the tolerance and rejects beyond it', () => {
    expect(selectYouTubeMusicCandidate(track, [candidate({ durationMs: 212_000 })])).toBeDefined()
    expect(selectYouTubeMusicCandidate(track, [candidate({ durationMs: 216_001 })])).toBeUndefined()
  })

  it('prefers official or Topic candidates', () => {
    const selected = selectYouTubeMusicCandidate(track, [
      candidate({ videoId: 'plain' }),
      candidate({ videoId: 'topic', isTopic: true }),
    ])
    expect(selected?.videoId).toBe('topic')
  })

  it.each(['Cover', 'Remix', 'Live', 'Karaoke', 'Instrumental', 'Slowed + Reverb'])(
    'rejects an unsolicited %s version',
    (qualifier) => {
      expect(
        selectYouTubeMusicCandidate(track, [candidate({ title: `${track.title} ${qualifier}` })]),
      ).toBeUndefined()
    },
  )

  it('rejects candidates without the primary artist', () => {
    expect(
      selectYouTubeMusicCandidate(track, [candidate({ artists: ['Artista Dois'] })]),
    ).toBeUndefined()
  })

  it('does not guess between ambiguous unofficial candidates', () => {
    expect(
      selectYouTubeMusicCandidate(track, [
        candidate({ videoId: 'one' }),
        candidate({ videoId: 'two', durationMs: 200_100 }),
      ]),
    ).toBeUndefined()
  })
})
