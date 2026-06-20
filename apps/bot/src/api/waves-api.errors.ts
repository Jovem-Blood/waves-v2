import type { ApiErrorCode } from '@waves/shared'

export class WavesApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly statusCode: number,
  ) {
    super(`Waves API request failed: ${code}`)
    this.name = 'WavesApiError'
  }
}

export class WavesApiUnavailableError extends Error {
  constructor() {
    super('Waves API is unavailable')
    this.name = 'WavesApiUnavailableError'
  }
}

export class WavesApiTimeoutError extends Error {
  constructor() {
    super('Waves API request timed out')
    this.name = 'WavesApiTimeoutError'
  }
}

export class WavesApiInvalidResponseError extends Error {
  constructor() {
    super('Waves API returned an invalid response')
    this.name = 'WavesApiInvalidResponseError'
  }
}
