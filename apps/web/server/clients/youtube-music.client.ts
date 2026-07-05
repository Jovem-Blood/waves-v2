import { runInNewContext } from 'node:vm'

import { Innertube, Platform, UniversalCache } from 'youtubei.js'

import {
  YouTubeMusicCandidateUnavailableError,
  YouTubeMusicInvalidResponseError,
  YouTubeMusicUnavailableError,
} from './youtube-music.errors'
import {
  youtubeAudioFormatSchema,
  youtubeMusicCandidateSchema,
  youtubeRawAudioFormatSchema,
  type YouTubeAudioFormat,
  type YouTubeMusicCandidate,
  type YouTubeRawAudioFormat,
} from './youtube-music.schemas'
import { YouTubePoTokenProvider } from './youtube-po-token'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_STREAM_TTL_MS = 5 * 60_000
const TARGET_BITRATE = 128_000

Platform.shim.eval = (data, environment) => {
  const context = Object.assign(Object.create(null) as Record<string, unknown>, environment, {
    URL,
    URLSearchParams,
    decodeURIComponent,
    encodeURIComponent,
  })
  const result: unknown = runInNewContext(`(function () {\n${data.output}\n})()`, context, {
    timeout: 250,
    displayErrors: false,
  })
  return typeof result === 'object' && result !== null ? result : undefined
}

export interface YouTubeMusicClientPort {
  searchSongs(query: string, limit?: number): Promise<YouTubeMusicCandidate[]>
  getUpNextSongs(videoId: string, limit?: number): Promise<YouTubeMusicCandidate[]>
  resolveAudioFormat(videoId: string): Promise<YouTubeAudioFormat>
}

export interface YouTubeMusicClientOptions {
  timeoutMs?: number
  streamTtlMs?: number
  now?: () => number
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new YouTubeMusicUnavailableError({ cause: new Error('Operation timed out') })),
      timeoutMs,
    )
    timer.unref?.()
    operation.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function parseExpiry(url: string): string | undefined {
  try {
    const value = new URL(url).searchParams.get('expire')
    if (!value || !/^\d+$/.test(value)) {
      return undefined
    }
    const timestamp = Number(value) * 1000
    return Number.isSafeInteger(timestamp) ? new Date(timestamp).toISOString() : undefined
  } catch {
    return undefined
  }
}

function formatRank(format: YouTubeRawAudioFormat): [number, number] {
  const mime = format.mimeType.toLowerCase()
  const containerRank =
    mime.includes('webm') && mime.includes('opus')
      ? 0
      : mime.includes('mp4') && mime.includes('mp4a')
        ? 1
        : 2
  return [containerRank, Math.abs((format.bitrate ?? TARGET_BITRATE) - TARGET_BITRATE)]
}

export function selectYouTubeAudioFormat(
  videoId: string,
  formats: YouTubeRawAudioFormat[],
  now = Date.now(),
  ttlMs = DEFAULT_STREAM_TTL_MS,
  streamingExpiresAt?: string,
): YouTubeAudioFormat | undefined {
  const selected = formats
    .filter((format) => !format.hasVideo && !format.drmFamilies?.length)
    .sort((left, right) => {
      const [leftContainer, leftBitrate] = formatRank(left)
      const [rightContainer, rightBitrate] = formatRank(right)
      return leftContainer - rightContainer || leftBitrate - rightBitrate
    })[0]

  if (!selected) {
    return undefined
  }

  const expiresAt =
    parseExpiry(selected.streamUrl) ?? streamingExpiresAt ?? new Date(now + ttlMs).toISOString()

  return youtubeAudioFormatSchema.parse({
    videoId,
    streamUrl: selected.streamUrl,
    mimeType: selected.mimeType,
    ...(selected.bitrate === undefined ? {} : { bitrate: selected.bitrate }),
    expiresAt,
  })
}

function safeBadgeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return (value as unknown[]).flatMap((badge) => {
    if (typeof badge !== 'object' || badge === null || !('label' in badge)) {
      return []
    }
    return typeof badge.label === 'string' ? [badge.label] : []
  })
}

export class YouTubeMusicClient implements YouTubeMusicClientPort {
  private session: Promise<Innertube> | undefined
  private sessionGeneration: number | undefined
  private readonly timeoutMs: number
  private readonly streamTtlMs: number
  private readonly now: () => number

  constructor(options: YouTubeMusicClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.streamTtlMs = options.streamTtlMs ?? DEFAULT_STREAM_TTL_MS
    this.now = options.now ?? Date.now
    this.poTokenProvider = new YouTubePoTokenProvider(this.now)
  }

  private readonly poTokenProvider: YouTubePoTokenProvider

  async searchSongs(query: string, limit = 10): Promise<YouTubeMusicCandidate[]> {
    try {
      const innertube = await this.getSession()
      const search = await withTimeout(
        innertube.music.search(query, { type: 'song' }),
        this.timeoutMs,
      )
      const contents = search.songs?.contents ?? []

      return contents.slice(0, limit).flatMap((item) => {
        const labels = safeBadgeLabels(item.badges)
        const channelName = item.author?.name ?? item.authors?.[0]?.name
        const candidate = youtubeMusicCandidateSchema.safeParse({
          videoId: item.id,
          title: item.title,
          artists: item.artists?.map((artist) => artist.name),
          durationMs:
            item.duration?.seconds === undefined ? undefined : item.duration.seconds * 1000,
          ...(item.album?.name ? { albumName: item.album.name } : {}),
          ...(channelName ? { channelName } : {}),
          isOfficial:
            item.item_type === 'song' ||
            Boolean(item.album?.name) ||
            labels.some((label) => /official|verified/i.test(label)),
          isTopic: Boolean(channelName && /-\s*topic$/i.test(channelName)),
        })
        return candidate.success ? [candidate.data] : []
      })
    } catch (error) {
      if (error instanceof YouTubeMusicUnavailableError) {
        throw error
      }
      throw new YouTubeMusicUnavailableError({ cause: error })
    }
  }

  async getUpNextSongs(videoId: string, limit = 10): Promise<YouTubeMusicCandidate[]> {
    try {
      const innertube = await this.getSession()
      const playlist = await withTimeout(innertube.music.getUpNext(videoId, true), this.timeoutMs)
      const seen = new Set<string>([videoId])

      return playlist.contents
        .flatMap((item) => {
          if (!('video_id' in item) || !item.video_id || seen.has(item.video_id)) return []
          const labels = safeBadgeLabels(item.badges)
          if (labels.some((label) => /live/i.test(label))) return []
          const artists = item.artists?.map((artist) => artist.name) ?? [item.author]
          const parsed = youtubeMusicCandidateSchema.safeParse({
            videoId: item.video_id,
            title: item.title.toString(),
            artists,
            durationMs: item.duration.seconds * 1000,
            ...(item.album?.name ? { albumName: item.album.name } : {}),
            ...(item.author ? { channelName: item.author } : {}),
            isOfficial:
              Boolean(item.album?.name) || labels.some((label) => /official|verified/i.test(label)),
            isTopic: /-\s*topic$/i.test(item.author),
          })
          if (!parsed.success) return []
          seen.add(item.video_id)
          return [parsed.data]
        })
        .slice(0, limit)
    } catch (error) {
      if (error instanceof YouTubeMusicUnavailableError) throw error
      throw new YouTubeMusicUnavailableError({ cause: error })
    }
  }

  async resolveAudioFormat(videoId: string): Promise<YouTubeAudioFormat> {
    try {
      const tokens = await withTimeout(this.poTokenProvider.getTokens(videoId), this.timeoutMs)
      const innertube = await this.getSession(tokens)
      const info = await withTimeout(
        innertube.music.getInfo(videoId, { po_token: tokens.contentToken }),
        this.timeoutMs,
      )
      const basicInfo = info.basic_info

      if (
        basicInfo.id !== videoId ||
        basicInfo.is_private ||
        basicInfo.is_live ||
        info.playability_status?.status !== 'OK' ||
        !info.streaming_data
      ) {
        throw new YouTubeMusicCandidateUnavailableError()
      }

      const player = innertube.session.player
      const rawFormats = await Promise.all(
        [...info.streaming_data.adaptive_formats, ...info.streaming_data.formats]
          .filter((format) => format.has_audio)
          .map(async (format) => {
            const streamUrl = new URL(await format.decipher(player))
            streamUrl.searchParams.set('pot', tokens.contentToken)
            return youtubeRawAudioFormatSchema.safeParse({
              streamUrl: streamUrl.toString(),
              mimeType: format.mime_type,
              bitrate: format.average_bitrate ?? format.bitrate,
              hasAudio: format.has_audio,
              hasVideo: format.has_video,
              drmFamilies: format.drm_families,
            })
          }),
      )

      const selected = selectYouTubeAudioFormat(
        videoId,
        rawFormats.flatMap((format) => (format.success ? [format.data] : [])),
        this.now(),
        this.streamTtlMs,
        info.streaming_data.expires.toISOString(),
      )
      if (!selected) {
        throw new YouTubeMusicCandidateUnavailableError()
      }
      return selected
    } catch (error) {
      if (error instanceof YouTubeMusicCandidateUnavailableError) {
        throw error
      }
      if (error instanceof YouTubeMusicInvalidResponseError) {
        throw error
      }
      throw new YouTubeMusicUnavailableError({ cause: error })
    }
  }

  private getSession(tokens?: {
    visitorData: string
    sessionToken: string
    generation: number
  }): Promise<Innertube> {
    if (tokens && this.sessionGeneration !== tokens.generation) {
      this.session = undefined
      this.sessionGeneration = tokens.generation
    }
    this.session ??= withTimeout(
      Innertube.create({
        cache: new UniversalCache(true),
        enable_session_cache: true,
        generate_session_locally: true,
        retrieve_player: true,
        ...(tokens ? { visitor_data: tokens.visitorData, po_token: tokens.sessionToken } : {}),
      }),
      this.timeoutMs,
    )
    return this.session
  }
}
