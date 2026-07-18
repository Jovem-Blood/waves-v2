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

  it('accepts a trusted candidate with strong metadata outside the strict duration window', () => {
    const selected = selectYouTubeMusicCandidate(track, [
      candidate({ videoId: 'topic', durationMs: 238_000, isTopic: true }),
    ])

    expect(selected?.videoId).toBe('topic')
  })

  it('keeps rejecting untrusted candidates outside the strict duration window', () => {
    expect(selectYouTubeMusicCandidate(track, [candidate({ durationMs: 238_000 })])).toBeUndefined()
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

  it('matches when track title has feat. artists but candidate title does not', () => {
    const locoTrack: TrackMetadata = {
      id: 'spotify:loco',
      provider: 'spotify',
      providerTrackId: 'loco',
      title: 'Loco Contigo (feat. J. Balvin & Tyga)',
      artists: ['DJ Snake', 'J Balvin', 'Tyga'],
      durationMs: 185_194,
    }
    const selected = selectYouTubeMusicCandidate(locoTrack, [
      candidate({
        videoId: 'clean-title',
        title: 'Loco Contigo',
        artists: ['DJ Snake', 'J Balvin', 'Tyga'],
        isOfficial: true,
      }),
    ])
    expect(selected?.videoId).toBe('clean-title')
  })

  it('matches when candidate title has feat. artists not in its artists array', () => {
    const alterEgoTrack: TrackMetadata = {
      id: 'spotify:alter',
      provider: 'spotify',
      providerTrackId: 'alter',
      title: 'Alter Ego (Precious Remix)[with JT]',
      artists: ['Doechii', 'JT', 'Precious'],
      durationMs: 204_094,
    }
    const selected = selectYouTubeMusicCandidate(alterEgoTrack, [
      candidate({
        videoId: 'feat-in-title',
        title: 'Alter Ego (Precious Remix) (feat. JT)',
        artists: ['Doechii'],
        durationMs: 205_000,
        isOfficial: true,
      }),
    ])
    expect(selected?.videoId).toBe('feat-in-title')
  })

  it('strips feat. clauses from both titles for comparison', () => {
    const trackA: TrackMetadata = {
      id: 'spotify:a',
      provider: 'spotify',
      providerTrackId: 'a',
      title: 'My Song (feat. Someone)',
      artists: ['Main Artist'],
      durationMs: 200_000,
    }
    const selected = selectYouTubeMusicCandidate(trackA, [
      candidate({
        videoId: 'clean',
        title: 'My Song',
        artists: ['Main Artist'],
        isOfficial: true,
      }),
    ])
    expect(selected?.videoId).toBe('clean')
  })
})
