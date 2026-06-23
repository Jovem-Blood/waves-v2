import { apiErrorSchema, type ApiError } from '@waves/shared'
import {
  type EventHandler,
  type H3Event,
  defineEventHandler,
  getRequestURL,
  setResponseStatus,
} from 'h3'
import { ZodError } from 'zod'

import {
  SpotifyAuthenticationError,
  SpotifyConfigurationError,
  SpotifyInvalidQueryError,
  SpotifyInvalidResponseError,
  SpotifyUnavailableError,
} from '../clients/spotify.errors'
import {
  AudioSourceNotFoundError,
  AudioSourceUnavailableError,
} from '../services/audio-source.errors'
import {
  DuplicateTrackError,
  PlaybackConflictError,
  QueueItemNotFoundError,
  QueueItemNotRemovableError,
  QueueItemNotRestorableError,
  QueueRestoreExpiredError,
  TrackNotFoundError,
} from '../services/domain-errors'
import { InternalApiConfigurationError } from './internal-api-config'
import { UnauthorizedError } from './internal-errors'
import { useLogger } from './logger'

function toApiError(error: unknown): ApiError {
  if (error instanceof ZodError || error instanceof SpotifyInvalidQueryError) {
    return apiErrorSchema.parse({
      statusCode: 400,
      statusMessage: 'Invalid request',
      data: { code: 'VALIDATION_ERROR' },
    })
  }

  if (error instanceof QueueItemNotFoundError) {
    return apiErrorSchema.parse({
      statusCode: 404,
      statusMessage: 'Queue item not found',
      data: { code: 'QUEUE_ITEM_NOT_FOUND' },
    })
  }

  if (error instanceof TrackNotFoundError) {
    return apiErrorSchema.parse({
      statusCode: 404,
      statusMessage: 'Track not found',
      data: { code: 'TRACK_NOT_FOUND' },
    })
  }

  if (error instanceof DuplicateTrackError) {
    return apiErrorSchema.parse({
      statusCode: 409,
      statusMessage: 'Track already queued',
      data: { code: 'DUPLICATE_TRACK' },
    })
  }

  if (error instanceof QueueItemNotRemovableError) {
    return apiErrorSchema.parse({
      statusCode: 409,
      statusMessage: 'Queue item cannot be removed',
      data: { code: 'QUEUE_ITEM_NOT_REMOVABLE' },
    })
  }

  if (error instanceof QueueItemNotRestorableError) {
    return apiErrorSchema.parse({
      statusCode: 409,
      statusMessage: 'Queue item cannot be restored',
      data: { code: 'QUEUE_ITEM_NOT_RESTORABLE' },
    })
  }

  if (error instanceof QueueRestoreExpiredError) {
    return apiErrorSchema.parse({
      statusCode: 410,
      statusMessage: 'Queue restore expired',
      data: { code: 'QUEUE_RESTORE_EXPIRED' },
    })
  }

  if (error instanceof AudioSourceNotFoundError) {
    return apiErrorSchema.parse({
      statusCode: 404,
      statusMessage: 'Audio source not found',
      data: { code: 'SOURCE_NOT_FOUND' },
    })
  }

  if (error instanceof AudioSourceUnavailableError) {
    return apiErrorSchema.parse({
      statusCode: 503,
      statusMessage: 'Audio source unavailable',
      data: { code: 'SOURCE_UNAVAILABLE' },
    })
  }

  if (error instanceof PlaybackConflictError) {
    return apiErrorSchema.parse({
      statusCode: 409,
      statusMessage: 'Playback conflict',
      data: { code: 'PLAYBACK_CONFLICT' },
    })
  }

  if (error instanceof UnauthorizedError) {
    return apiErrorSchema.parse({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      data: { code: 'UNAUTHORIZED' },
    })
  }

  if (
    error instanceof SpotifyConfigurationError ||
    error instanceof SpotifyAuthenticationError ||
    error instanceof SpotifyUnavailableError ||
    error instanceof SpotifyInvalidResponseError
  ) {
    return apiErrorSchema.parse({
      statusCode: 503,
      statusMessage: 'Spotify unavailable',
      data: { code: 'SPOTIFY_UNAVAILABLE' },
    })
  }

  if (error instanceof InternalApiConfigurationError) {
    return apiErrorSchema.parse({
      statusCode: 500,
      statusMessage: 'Internal server error',
      data: { code: 'INTERNAL_ERROR' },
    })
  }

  return apiErrorSchema.parse({
    statusCode: 500,
    statusMessage: 'Internal server error',
    data: { code: 'INTERNAL_ERROR' },
  })
}

export function definePublicApiHandler<T>(
  handler: (event: H3Event) => T | Promise<T>,
): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError'
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined
      useLogger().error(
        {
          route: getRequestURL(event).pathname,
          errorName,
          ...(errorCode === undefined ? {} : { errorCode }),
        },
        'Public API request failed',
      )
      const apiError = toApiError(error)
      setResponseStatus(event, apiError.statusCode, apiError.statusMessage)
      return apiError
    }
  })
}
