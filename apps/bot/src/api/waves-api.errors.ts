import type { ApiErrorCode } from '@waves/shared'

export class WavesApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly statusCode: number,
    cause?: unknown,
    readonly sourceHttpStatus?: number,
  ) {
    super(`Waves API request failed: ${code}`, cause === undefined ? undefined : { cause })
    this.name = 'WavesApiError'
  }
}

export class WavesApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Waves API is unavailable', cause === undefined ? undefined : { cause })
    this.name = 'WavesApiUnavailableError'
  }
}

export class WavesApiTimeoutError extends Error {
  constructor(cause?: unknown) {
    super('Waves API request timed out', cause === undefined ? undefined : { cause })
    this.name = 'WavesApiTimeoutError'
  }
}

export class WavesApiInvalidResponseError extends Error {
  constructor(cause?: unknown) {
    super('Waves API returned an invalid response', cause === undefined ? undefined : { cause })
    this.name = 'WavesApiInvalidResponseError'
  }
}
