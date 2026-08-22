import type { BotLogger } from './logger.js'
import {
  WavesApiError,
  WavesApiInvalidResponseError,
  WavesApiTimeoutError,
  WavesApiUnavailableError,
} from './api/waves-api.errors.js'

export type PlaybackErrorCode =
  | 'SOURCE_FETCH_TIMEOUT'
  | 'SOURCE_FETCH_CANCELLED'
  | 'SOURCE_HTTP_STATUS'
  | 'SOURCE_INVALID_RANGE'
  | 'SOURCE_EMPTY_RANGE'
  | 'DEMUX_PROBE_FAILED'
  | 'AUDIO_RESOURCE_FAILED'
  | 'PLAYER_ERROR'
  | 'PREMATURE_IDLE'
  | 'PLAYBACK_SYNC_FAILED'
  | 'API_TIMEOUT'
  | 'API_UNAVAILABLE'
  | 'API_INVALID_RESPONSE'
  | 'API_ERROR'
  | 'UNKNOWN'

export class SafePlaybackError extends Error {
  constructor(
    readonly code: PlaybackErrorCode,
    readonly httpStatus?: number,
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'SafePlaybackError'
  }
}

export function classifyPlaybackError(error: unknown): {
  errorCode: PlaybackErrorCode
  httpStatus?: number
  errorName?: string
} {
  if (error instanceof SafePlaybackError) {
    return {
      errorCode: error.code,
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    }
  }
  if (error instanceof WavesApiTimeoutError) {
    return { errorCode: 'API_TIMEOUT' }
  }
  if (error instanceof WavesApiUnavailableError) {
    return { errorCode: 'API_UNAVAILABLE' }
  }
  if (error instanceof WavesApiInvalidResponseError) {
    return { errorCode: 'API_INVALID_RESPONSE' }
  }
  if (error instanceof WavesApiError) {
    return { errorCode: 'API_ERROR', httpStatus: error.statusCode }
  }
  if (error instanceof Error) {
    return { errorCode: 'UNKNOWN', errorName: error.name }
  }
  return { errorCode: 'UNKNOWN' }
}

export function playbackFailureStage(
  errorCode: PlaybackErrorCode,
  fallback: 'claim' | 'resolve' | 'transport' | 'demux' | 'resource' | 'player' | 'sync' = 'player',
): 'claim' | 'resolve' | 'transport' | 'demux' | 'resource' | 'player' | 'sync' {
  if (errorCode.startsWith('SOURCE_FETCH_') || errorCode.startsWith('SOURCE_HTTP_'))
    return 'transport'
  if (errorCode === 'SOURCE_INVALID_RANGE' || errorCode === 'SOURCE_EMPTY_RANGE') return 'transport'
  if (errorCode === 'DEMUX_PROBE_FAILED') return 'demux'
  if (errorCode === 'AUDIO_RESOURCE_FAILED') return 'resource'
  if (errorCode === 'PLAYBACK_SYNC_FAILED' || errorCode.startsWith('API_')) return 'sync'
  if (errorCode === 'PLAYER_ERROR' || errorCode === 'PREMATURE_IDLE') return 'player'
  return fallback
}

export function playbackFailureClass(
  errorCode: PlaybackErrorCode,
): 'operational' | 'intentional' | 'sync' | 'internal' {
  if (errorCode === 'SOURCE_FETCH_CANCELLED') return 'intentional'
  if (errorCode === 'PLAYBACK_SYNC_FAILED' || errorCode.startsWith('API_')) return 'sync'
  if (errorCode === 'UNKNOWN') return 'internal'
  return 'operational'
}

export function playbackLogger(logger: BotLogger, bindings: Record<string, unknown>): BotLogger {
  return logger.child({ service: 'bot', event: 'playback', ...bindings })
}
