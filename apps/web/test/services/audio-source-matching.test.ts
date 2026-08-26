import type { TrackMetadata } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import type { YouTubeMusicCandidate } from '../../server/clients/youtube-music.schemas'
import {
  analyzeYouTubeMusicCandidates,
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
    expect(normalizeMusicText('カワキヲアメク')).toBe('カワキヲアメク')
    expect(normalizeMusicText('ガ')).toBe('ガ')
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

  it.each(['Cover', 'Remix', 'Live', 'Karaoke', 'Instrumental', 'Slowed + Reverb', 'Lyrics'])(
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

  it('prefers an exact upload from the primary artist channel over mirrors', () => {
    const selected = selectYouTubeMusicCandidate(track, [
      candidate({ videoId: 'artist-upload', channelName: 'Artista Um' }),
      candidate({ videoId: 'mirror', channelName: 'Lyrics Channel', durationMs: 200_100 }),
    ])

    expect(selected?.videoId).toBe('artist-upload')
  })

  it('trusts an official ISRC result with a listed artist and matching duration', () => {
    const spotifyTrack: TrackMetadata = {
      id: 'spotify:happy',
      provider: 'spotify',
      providerTrackId: 'happy',
      title: 'Happy',
      artists: ['Pharrell Williams', 'Noteservice Wind Ensemble'],
      durationMs: 123_309,
      isrc: 'NODGN1607240',
    }
    const exactCatalogCandidate = candidate({
      videoId: 'youtube-happy',
      title: 'Happy',
      artists: ['Noteservice Wind Ensemble'],
      durationMs: 124_000,
      isOfficial: true,
    })

    expect(
      analyzeYouTubeMusicCandidates(spotifyTrack, [exactCatalogCandidate], {
        isrcCandidateIds: new Set(['youtube-happy']),
      }).candidate?.videoId,
    ).toBe('youtube-happy')
  })

  it('uses trusted ISRC metadata when catalog title spelling differs', () => {
    const spotifyTrack: TrackMetadata = {
      id: 'spotify:scheibe',
      provider: 'spotify',
      providerTrackId: 'scheibe',
      title: 'ScheiBe',
      artists: ['Lady Gaga'],
      durationMs: 225_466,
      isrc: 'USUM71106448',
    }
    const exactCatalogCandidate = candidate({
      videoId: 'youtube-scheisse',
      title: 'Scheiße',
      artists: ['Lady Gaga'],
      durationMs: 226_000,
      isOfficial: true,
    })

    expect(
      analyzeYouTubeMusicCandidates(spotifyTrack, [exactCatalogCandidate], {
        isrcCandidateIds: new Set(['youtube-scheisse']),
      }).candidate?.videoId,
    ).toBe('youtube-scheisse')
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

  it.each([
    {
      title: 'アイドル',
      artists: ['YOASOBI'],
      durationMs: 213_233,
      candidateTitle: 'アイドル',
      candidateArtists: ['YOASOBI'],
      candidateDurationMs: 214_000,
    },
    {
      title: 'インフェルノ',
      artists: ['Mrs. GREEN APPLE'],
      durationMs: 212_546,
      candidateTitle: 'インフェルノ - Inferno',
      candidateArtists: ['Mrs. GREEN APPLE'],
      candidateDurationMs: 213_000,
    },
    {
      title: 'I I I',
      artists: ['宝鐘マリン', 'Kobo Kanaeru'],
      durationMs: 185_876,
      candidateTitle: 'I I I',
      candidateArtists: ['Kobo Kanaeru', 'Houshou Marine'],
      candidateDurationMs: 186_000,
    },
    {
      title: 'Mayonaka no Door~stay with me',
      artists: ['Miki Matsubara'],
      durationMs: 312_293,
      candidateTitle: '真夜中のドア〜stay with me - Mayonaka no Door~stay with me',
      candidateArtists: ['Miki Matsubara'],
      candidateDurationMs: 312_000,
    },
    {
      title: '光るなら',
      artists: ['Goose house'],
      durationMs: 252_133,
      candidateTitle: '光るなら - Hikarunara',
      candidateArtists: ['Goose house'],
      candidateDurationMs: 255_000,
    },
    {
      title: 'カワキヲアメク',
      artists: ['美波'],
      durationMs: 251_933,
      candidateTitle: 'カワキヲアメク - Kawakiwoameku',
      candidateArtists: ['minami'],
      candidateDurationMs: 252_000,
    },
  ])('matches the observed YouTube Music result for $title', (example) => {
    const observedTrack: TrackMetadata = {
      id: `spotify:${example.title}`,
      provider: 'spotify',
      providerTrackId: example.title,
      title: example.title,
      artists: example.artists,
      durationMs: example.durationMs,
    }
    const selected = selectYouTubeMusicCandidate(observedTrack, [
      candidate({
        videoId: `youtube:${example.title}`,
        title: example.candidateTitle,
        artists: example.candidateArtists,
        durationMs: example.candidateDurationMs,
        isOfficial: true,
      }),
    ])

    expect(selected?.videoId).toBe(`youtube:${example.title}`)
  })

  it('does not treat an ordinary with phrase as a featured artist clause', () => {
    const stayWithMe: TrackMetadata = {
      id: 'spotify:stay-with-me',
      provider: 'spotify',
      providerTrackId: 'stay-with-me',
      title: 'Stay with Me',
      artists: ['Miki Matsubara'],
      durationMs: 312_000,
    }

    expect(
      selectYouTubeMusicCandidate(stayWithMe, [
        candidate({
          title: 'Stay with Me',
          artists: ['Miki Matsubara'],
          durationMs: 312_000,
          isOfficial: true,
        }),
      ]),
    ).toBeDefined()
  })

  it('keeps rejecting unrelated artists when only the primary artist needs transliteration', () => {
    const multilingualTrack: TrackMetadata = {
      id: 'spotify:iii',
      provider: 'spotify',
      providerTrackId: 'iii',
      title: 'I I I',
      artists: ['宝鐘マリン', 'Kobo Kanaeru'],
      durationMs: 185_876,
    }

    expect(
      selectYouTubeMusicCandidate(multilingualTrack, [
        candidate({
          title: 'I I I',
          artists: ['Unrelated Artist'],
          durationMs: 186_000,
          isOfficial: true,
        }),
      ]),
    ).toBeUndefined()
  })

  it('requires a trusted, near-duration result for a transliterated artist', () => {
    const japaneseTrack: TrackMetadata = {
      id: 'spotify:kawakiwoameku',
      provider: 'spotify',
      providerTrackId: 'kawakiwoameku',
      title: 'カワキヲアメク',
      artists: ['美波'],
      durationMs: 251_933,
    }
    const translatedCandidate = {
      title: 'カワキヲアメク - Kawakiwoameku',
      artists: ['minami'],
    }

    expect(
      selectYouTubeMusicCandidate(japaneseTrack, [
        candidate({ ...translatedCandidate, durationMs: 252_000 }),
      ]),
    ).toBeUndefined()
    expect(
      selectYouTubeMusicCandidate(japaneseTrack, [
        candidate({
          ...translatedCandidate,
          durationMs: 260_000,
          isOfficial: true,
        }),
      ]),
    ).toBeUndefined()
  })
})
