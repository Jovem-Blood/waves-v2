import type { TrackMetadata } from '@waves/shared'

import { YouTubeMusicClient } from '../server/clients/youtube-music.client'
import { selectYouTubeMusicCandidate } from '../server/services/audio-source-matching'

const catalog: TrackMetadata[] = [
  {
    id: 'smoke:apt',
    provider: 'spotify',
    providerTrackId: 'apt',
    title: 'APT.',
    artists: ['ROSÉ', 'Bruno Mars'],
    durationMs: 169_000,
  },
  {
    id: 'smoke:blinding-lights',
    provider: 'spotify',
    providerTrackId: 'blinding-lights',
    title: 'Blinding Lights',
    artists: ['The Weeknd'],
    durationMs: 200_000,
  },
  {
    id: 'smoke:evidencias',
    provider: 'spotify',
    providerTrackId: 'evidencias',
    title: 'Evidências',
    artists: ['Chitãozinho & Xororó'],
    durationMs: 279_000,
  },
  {
    id: 'smoke:die-with-a-smile',
    provider: 'spotify',
    providerTrackId: 'die-with-a-smile',
    title: 'Die With A Smile',
    artists: ['Lady Gaga', 'Bruno Mars'],
    durationMs: 251_000,
  },
  {
    id: 'smoke:aguas-de-marco',
    provider: 'spotify',
    providerTrackId: 'aguas-de-marco',
    title: 'Águas de Março',
    artists: ['Elis Regina', 'Antônio Carlos Jobim'],
    durationMs: 212_000,
  },
  {
    id: 'smoke:wap',
    provider: 'spotify',
    providerTrackId: 'wap',
    title: 'WAP',
    artists: ['Cardi B', 'Megan Thee Stallion'],
    durationMs: 187_000,
  },
  {
    id: 'smoke:i-will-always-love-you',
    provider: 'spotify',
    providerTrackId: 'i-will-always-love-you',
    title: 'I Will Always Love You',
    artists: ['Whitney Houston'],
    durationMs: 271_000,
  },
  {
    id: 'smoke:espresso',
    provider: 'spotify',
    providerTrackId: 'espresso',
    title: 'Espresso',
    artists: ['Sabrina Carpenter'],
    durationMs: 175_000,
  },
  {
    id: 'smoke:bohemian-rhapsody',
    provider: 'spotify',
    providerTrackId: 'bohemian-rhapsody',
    title: 'Bohemian Rhapsody',
    artists: ['Queen'],
    durationMs: 354_000,
  },
  {
    id: 'smoke:bad-guy',
    provider: 'spotify',
    providerTrackId: 'bad-guy',
    title: 'bad guy',
    artists: ['Billie Eilish'],
    durationMs: 194_000,
  },
]

async function opensStream(streamUrl: string): Promise<boolean> {
  try {
    const response = await fetch(streamUrl, {
      headers: { Range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok && response.status !== 206) {
      return false
    }
    const reader = response.body?.getReader()
    const first = await reader?.read()
    await reader?.cancel()
    return Boolean(first && !first.done && first.value.byteLength > 0)
  } catch {
    return false
  }
}

async function runCatalogSmoke() {
  const client = new YouTubeMusicClient({ timeoutMs: 20_000 })
  const results = []

  for (const track of catalog) {
    try {
      const candidates = await client.searchSongs(`${track.title} ${track.artists.join(' ')}`, 10)
      const selected = selectYouTubeMusicCandidate(track, candidates)
      if (!selected) {
        results.push({
          expected: { title: track.title, artists: track.artists, durationMs: track.durationMs },
          provider: 'youtube_music',
          success: false,
          streamOpened: false,
          reason: 'no_safe_candidate',
        })
        continue
      }
      const format = await client.resolveAudioFormat(selected.videoId)
      results.push({
        expected: { title: track.title, artists: track.artists, durationMs: track.durationMs },
        selected: {
          videoId: selected.videoId,
          title: selected.title,
          artists: selected.artists,
          durationMs: selected.durationMs,
          classification: selected.isTopic ? 'topic' : selected.isOfficial ? 'official' : 'catalog',
        },
        provider: 'youtube_music',
        success: true,
        streamOpened: await opensStream(format.streamUrl),
      })
    } catch {
      results.push({
        expected: { title: track.title, artists: track.artists, durationMs: track.durationMs },
        provider: 'youtube_music',
        success: false,
        streamOpened: false,
        reason: 'safe_provider_error',
      })
    }
  }
  return results
}

const catalogResults = await runCatalogSmoke()
const report = {
  executedAt: new Date().toISOString(),
  youtubeiVersion: '17.0.1',
  catalogResults,
  totals: {
    candidatesCorrect: catalogResults.filter((result) => result.success).length,
    streamsOpened: catalogResults.filter((result) => result.streamOpened).length,
    total: catalogResults.length,
  },
}

console.log(JSON.stringify(report, null, 2))
