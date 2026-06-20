import {
  apiErrorSchema,
  botEventSchema,
  botPlayInputSchema,
  completePlaybackInputSchema,
  playbackClaimResultSchema,
  playbackTransitionResultSchema,
  queueItemAudioSourceSchema,
  playerStateSchema,
  queueItemSchema,
  queueSchema,
  trackMetadataSchema,
  type BotEvent,
  type BotPlayInput,
  type CompletePlaybackInput,
  type PlaybackClaimResult,
  type PlaybackTransitionResult,
  type Queue,
  type QueueItemAudioSource,
} from '@waves/shared'
import { z } from 'zod'

import type { BotConfig } from '../config.js'
import {
  WavesApiError,
  WavesApiInvalidResponseError,
  WavesApiTimeoutError,
  WavesApiUnavailableError,
} from './waves-api.errors.js'

const playResultSchema = z.strictObject({
  item: queueItemSchema,
  track: trackMetadataSchema,
})
const skipResultSchema = z.strictObject({
  player: playerStateSchema,
  queue: queueSchema,
})
const eventAckSchema = z.strictObject({ accepted: z.literal(true) })

export type PlayResult = z.infer<typeof playResultSchema>
export type SkipResult = z.infer<typeof skipResultSchema>
export type WavesFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface WavesApi {
  getQueue(): Promise<Queue>
  play(input: BotPlayInput): Promise<PlayResult>
  skip(): Promise<SkipResult>
  resolveSource(queueItemId: string, forceRefresh?: boolean): Promise<QueueItemAudioSource>
  claimPlayback(): Promise<PlaybackClaimResult>
  completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult>
  sendEvent(event: BotEvent): Promise<void>
}

export class WavesApiClient implements WavesApi {
  private readonly baseUrl: string

  constructor(
    config: Pick<BotConfig, 'apiBaseUrl' | 'internalApiToken'>,
    private readonly request: WavesFetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    this.baseUrl = config.apiBaseUrl.replace(/\/+$/, '')
    this.token = config.internalApiToken
  }

  private readonly token: string

  getQueue(): Promise<Queue> {
    return this.requestJson('/internal/bot/queue', queueSchema)
  }

  play(input: BotPlayInput): Promise<PlayResult> {
    return this.requestJson('/internal/bot/play', playResultSchema, {
      method: 'POST',
      body: JSON.stringify(botPlayInputSchema.parse(input)),
    })
  }

  skip(): Promise<SkipResult> {
    return this.requestJson('/internal/bot/skip', skipResultSchema, {
      method: 'POST',
      body: '{}',
    })
  }

  resolveSource(queueItemId: string, forceRefresh = false): Promise<QueueItemAudioSource> {
    return this.requestJson(
      `/internal/bot/sources/${encodeURIComponent(queueItemId)}/resolve`,
      queueItemAudioSourceSchema,
      { method: 'POST', body: JSON.stringify({ forceRefresh }) },
    )
  }

  claimPlayback(): Promise<PlaybackClaimResult> {
    return this.requestJson('/internal/bot/playback/claim', playbackClaimResultSchema, {
      method: 'POST',
      body: '{}',
    })
  }

  completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult> {
    return this.requestJson('/internal/bot/playback/complete', playbackTransitionResultSchema, {
      method: 'POST',
      body: JSON.stringify(completePlaybackInputSchema.parse(input)),
    })
  }

  async sendEvent(event: BotEvent): Promise<void> {
    await this.requestJson('/internal/bot/events', eventAckSchema, {
      method: 'POST',
      body: JSON.stringify(botEventSchema.parse(event)),
    })
  }

  private async requestJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response

    try {
      response = await this.request(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...Object.fromEntries(new Headers(init.headers)),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new WavesApiTimeoutError()
      }
      throw new WavesApiUnavailableError()
    }

    const body = await this.readJson(response)
    if (!response.ok) {
      const apiError = apiErrorSchema.safeParse(body)
      if (!apiError.success || !apiError.data.data) {
        throw new WavesApiInvalidResponseError()
      }
      throw new WavesApiError(apiError.data.data.code, apiError.data.statusCode)
    }

    const result = schema.safeParse(body)
    if (!result.success) {
      throw new WavesApiInvalidResponseError()
    }
    return result.data
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new WavesApiInvalidResponseError()
    }
  }
}
