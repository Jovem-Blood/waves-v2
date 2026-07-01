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
  ) {
    super(code)
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

export function playbackLogger(logger: BotLogger, bindings: Record<string, unknown>): BotLogger {
  return logger.child({ service: 'bot', ...bindings })
}
