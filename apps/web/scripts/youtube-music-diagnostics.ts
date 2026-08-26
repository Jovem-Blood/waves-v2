import type { TrackMetadata } from '@waves/shared'

import { YouTubeMusicClient } from '../server/clients/youtube-music.client'
import { analyzeYouTubeMusicCandidates } from '../server/services/audio-source-matching'

const tracks: TrackMetadata[] = [
  {
    id: 'spotify:73CMRj62VK8nUS4ezD2wvi',
    provider: 'spotify',
    providerTrackId: '73CMRj62VK8nUS4ezD2wvi',
    title: 'Set Fire to the Rain',
    artists: ['Adele'],
    durationMs: 242_973,
    isrc: 'GBBKS1000348',
  },
  {
    id: 'spotify:7B5Npv8NjjTCzk8PLpU66h',
    provider: 'spotify',
    providerTrackId: '7B5Npv8NjjTCzk8PLpU66h',
    title: 'Love In The Dark',
    artists: ['Adele'],
    durationMs: 285_935,
    isrc: 'GBBKS1500221',
  },
  {
    id: 'spotify:2S5LNtRVRPbXk01yRQ14sZ',
    provider: 'spotify',
    providerTrackId: '2S5LNtRVRPbXk01yRQ14sZ',
    title: "I Don't Like It, I Love It (feat. Robin Thicke & Verdine White)",
    artists: ['Flo Rida', 'Robin Thicke', 'Verdine White'],
    durationMs: 224_258,
    isrc: 'USAT21500395',
  },
  {
    id: 'spotify:0eMxgAHmuvoqpLyYQrbKvQ',
    provider: 'spotify',
    providerTrackId: '0eMxgAHmuvoqpLyYQrbKvQ',
    title: 'Happy',
    artists: ['Pharrell Williams', 'Scott Rogers', 'Noteservice Wind Ensemble'],
    durationMs: 123_309,
    isrc: 'NODGN1607240',
  },
  {
    id: 'spotify:7DXGKFjM7GNkJd32oXstGY',
    provider: 'spotify',
    providerTrackId: '7DXGKFjM7GNkJd32oXstGY',
    title: 'ScheiBe',
    artists: ['Lady Gaga'],
    durationMs: 225_466,
    isrc: 'USUM71106448',
  },
  {
    id: 'spotify:2tudvzsrR56uom6smgOcSf',
    provider: 'spotify',
    providerTrackId: '2tudvzsrR56uom6smgOcSf',
    title: 'Like That',
    artists: ['Future', 'Metro Boomin', 'Kendrick Lamar'],
    durationMs: 267_706,
    isrc: 'USSM12402041',
  },
]

const client = new YouTubeMusicClient({ timeoutMs: 20_000 })
const report = []

for (const track of tracks) {
  const query = `${track.title} ${track.artists[0]}`
  const [songs, isrcSongs, alternateArtistSongs, videos] = await Promise.all([
    client.searchSongs(query, 10),
    client.searchSongs(track.isrc!, 10),
    Promise.all(
      track.artists.slice(1).map((artist) => client.searchSongs(`${track.title} ${artist}`, 10)),
    ).then((results) => results.flat()),
    client.searchVideos(query, 10),
  ])
  const candidates = [
    ...new Map(
      [...songs, ...isrcSongs, ...alternateArtistSongs, ...videos].map((candidate) => [
        candidate.videoId,
        candidate,
      ]),
    ).values(),
  ]
  const analysis = analyzeYouTubeMusicCandidates(track, candidates, {
    isrcCandidateIds: new Set(isrcSongs.map((candidate) => candidate.videoId)),
  })
  const details = analysis.diagnostics.candidateDetails
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
    .slice(0, 8)
  let streamCheck: { resolved: boolean; httpStatus?: number; bytes?: number; errorName?: string }
  if (analysis.candidate) {
    try {
      const format = await client.resolveAudioFormat(analysis.candidate.videoId)
      const response = await fetch(format.streamUrl, {
        headers: { Range: 'bytes=0-1023' },
        signal: AbortSignal.timeout(15_000),
      })
      const reader = response.body?.getReader()
      const bytes = (await reader?.read())?.value?.byteLength
      await reader?.cancel()
      streamCheck = {
        resolved: true,
        httpStatus: response.status,
        ...(bytes === undefined ? {} : { bytes }),
      }
    } catch (error) {
      streamCheck = {
        resolved: false,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }
    }
  } else {
    streamCheck = { resolved: false, errorName: 'NoSafeCandidate' }
  }

  report.push({
    track: {
      title: track.title,
      artists: track.artists,
      durationMs: track.durationMs,
      isrc: track.isrc,
    },
    selected: analysis.candidate?.videoId,
    ambiguous: analysis.diagnostics.ambiguous,
    streamCheck,
    rejectionCounts: {
      qualifier: analysis.diagnostics.rejectedByQualifier,
      artist: analysis.diagnostics.rejectedByArtist,
      duration: analysis.diagnostics.rejectedByDuration,
      score: analysis.diagnostics.rejectedByScore,
    },
    candidates: details.map((candidate) => ({
      ...candidate,
      isrcResult: isrcSongs.some((item) => item.videoId === candidate.videoId),
    })),
  })
}

console.log(JSON.stringify(report, null, 2))
