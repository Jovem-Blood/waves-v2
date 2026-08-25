import { Readable } from 'node:stream'

import {
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  type AudioPlayer,
  type AudioResource,
} from '@discordjs/voice'
import type { AudioSourceProvider } from '@waves/shared'

import type { BotLogger } from '../logger.js'
import { classifyPlaybackError, SafePlaybackError } from '../observability.js'

export interface ResourceCreationContext {
  logger: BotLogger
  playbackAttemptId: string
  provider: AudioSourceProvider
  sourceIdentifier: string
  attempt: number
  signal?: AbortSignal
  fetchTimeoutMs?: number
}

export interface PlaybackRuntime {
  createPlayer(): AudioPlayer
  createResource(
    streamUrl: string,
    queueItemId: string,
    context?: ResourceCreationContext,
  ): Promise<AudioResource<{ queueItemId: string }>>
}

const RESOURCE_FETCH_TIMEOUT_MS = 10_000
const SOURCE_CHUNK_SIZE = 256 * 1024

export type AudioSourceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export function createRangedAudioStream(
  streamUrl: string,
  request: AudioSourceFetch = fetch,
  context?: ResourceCreationContext,
): Readable {
  async function* chunks(): AsyncGenerator<Uint8Array> {
    let offset = 0
    let totalLength: number | undefined
    let totalBytes = 0
    const startedAt = Date.now()

    context?.logger.info(
      {
        operation: 'source.transport',
        outcome: 'started',
        provider: context.provider,
        sourceIdentifier: context.sourceIdentifier,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Segmented source transport started',
    )

    while (totalLength === undefined || offset < totalLength) {
      const end =
        totalLength === undefined
          ? offset + SOURCE_CHUNK_SIZE - 1
          : Math.min(offset + SOURCE_CHUNK_SIZE - 1, totalLength - 1)
      if (end < offset) break

      const controller = new AbortController()
      const abortFromContext = () => controller.abort()
      if (context?.signal?.aborted) {
        const error = new SafePlaybackError('SOURCE_FETCH_CANCELLED')
        context.logger.info(
          {
            operation: 'source.range',
            outcome: 'cancelled',
            errorCode: error.code,
            attempt: context.attempt,
            playbackAttemptId: context.playbackAttemptId,
            err: error,
          },
          'Source range cancelled',
        )
        throw error
      }
      context?.signal?.addEventListener('abort', abortFromContext, { once: true })
      const timeout = setTimeout(
        () => controller.abort(),
        context?.fetchTimeoutMs ?? RESOURCE_FETCH_TIMEOUT_MS,
      )
      timeout.unref?.()
      let deliveringChunk = false

      try {
        context?.logger.debug(
          {
            operation: 'source.range',
            rangeStart: offset,
            rangeEnd: end,
            attempt: context.attempt,
            playbackAttemptId: context.playbackAttemptId,
          },
          'Source range requested',
        )
        const response = await request(streamUrl, {
          headers: { Range: `bytes=${offset}-${end}` },
          signal: controller.signal,
        })
        if (response.status !== 206 || !response.body) {
          await response.body?.cancel()
          throw new SafePlaybackError('SOURCE_HTTP_STATUS', response.status)
        }

        const contentRange = response.headers.get('content-range')
        const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
        const responseStart = Number(match?.[1])
        const responseEnd = Number(match?.[2])
        const responseTotal = Number(match?.[3])
        const expectedEnd = Math.min(end, responseTotal - 1)
        if (
          !match ||
          responseStart !== offset ||
          !Number.isSafeInteger(responseEnd) ||
          !Number.isSafeInteger(responseTotal) ||
          responseTotal <= 0 ||
          responseEnd !== expectedEnd ||
          responseEnd < responseStart ||
          (totalLength !== undefined && responseTotal !== totalLength)
        ) {
          await response.body.cancel()
          throw new SafePlaybackError('SOURCE_INVALID_RANGE', response.status)
        }

        totalLength = responseTotal
        const chunk = new Uint8Array(await response.arrayBuffer())
        if (chunk.byteLength === 0) {
          throw new SafePlaybackError('SOURCE_EMPTY_RANGE', response.status)
        }
        if (chunk.byteLength !== responseEnd - responseStart + 1) {
          throw new SafePlaybackError('SOURCE_INVALID_RANGE', response.status)
        }
        context?.logger.debug(
          {
            operation: 'source.range',
            outcome: 'received',
            httpStatus: response.status,
            rangeStart: responseStart,
            rangeEnd: responseEnd,
            rangeBytes: chunk.byteLength,
            contentLength: totalLength,
            attempt: context.attempt,
            playbackAttemptId: context.playbackAttemptId,
          },
          'Source range received',
        )
        offset += chunk.byteLength
        totalBytes += chunk.byteLength
        deliveringChunk = true
        yield chunk
        deliveringChunk = false
      } catch (error) {
        const externallyCancelled = context?.signal?.aborted === true || deliveringChunk
        const failure = externallyCancelled
          ? new SafePlaybackError('SOURCE_FETCH_CANCELLED', undefined, error)
          : error instanceof DOMException && error.name === 'AbortError'
            ? new SafePlaybackError('SOURCE_FETCH_TIMEOUT', undefined, error)
            : error
        const classified = classifyPlaybackError(failure)
        const logPayload = {
          operation: 'source.range',
          outcome: externallyCancelled ? 'cancelled' : 'failed',
          ...classified,
          rangeStart: offset,
          rangeEnd: end,
          attempt: context?.attempt,
          playbackAttemptId: context?.playbackAttemptId,
          err: failure,
        }
        if (externallyCancelled) context?.logger.info(logPayload, 'Source range cancelled')
        else context?.logger.warn(logPayload, 'Source range failed')
        throw failure
      } finally {
        clearTimeout(timeout)
        context?.signal?.removeEventListener('abort', abortFromContext)
      }
    }

    context?.logger.info(
      {
        operation: 'source.transport',
        outcome: 'completed',
        contentLength: totalLength,
        rangeBytes: totalBytes,
        durationMs: Date.now() - startedAt,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Segmented source transport completed',
    )
  }

  return Readable.from(chunks(), { objectMode: false })
}

export const defaultPlaybackRuntime: PlaybackRuntime = {
  createPlayer() {
    return createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
    })
  },
  async createResource(streamUrl, queueItemId, context) {
    const input = createRangedAudioStream(streamUrl, fetch, context)
    const probeStartedAt = Date.now()
    let probe
    try {
      probe = await demuxProbe(input)
    } catch (error) {
      throw new SafePlaybackError('DEMUX_PROBE_FAILED', undefined, error)
    }
    context?.logger.debug(
      {
        operation: 'source.demux_probe',
        outcome: 'completed',
        streamType: probe.type,
        durationMs: Date.now() - probeStartedAt,
        attempt: context.attempt,
        playbackAttemptId: context.playbackAttemptId,
      },
      'Source demux probe completed',
    )
    try {
      const resource = createAudioResource(probe.stream, {
        inputType: probe.type,
        metadata: { queueItemId },
        inlineVolume: true,
      })
      context?.logger.info(
        {
          operation: 'audio_resource.create',
          outcome: 'completed',
          streamType: probe.type,
          attempt: context.attempt,
          playbackAttemptId: context.playbackAttemptId,
        },
        'Audio resource created',
      )
      return resource
    } catch (error) {
      throw new SafePlaybackError('AUDIO_RESOURCE_FAILED', undefined, error)
    }
  },
}
