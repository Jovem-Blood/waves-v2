export class YouTubeMusicInvalidResponseError extends Error {
  constructor(options?: ErrorOptions) {
    super('YouTube Music returned an invalid response', options)
    this.name = 'YouTubeMusicInvalidResponseError'
  }
}

export class YouTubeMusicUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('YouTube Music is unavailable', options)
    this.name = 'YouTubeMusicUnavailableError'
  }
}

export class YouTubeMusicCandidateUnavailableError extends Error {
  constructor(
    options?: ErrorOptions,
    readonly code:
      | 'SOURCE_NOT_FOUND'
      | 'SOURCE_AUTH_REQUIRED'
      | 'SOURCE_GEO_BLOCKED'
      | 'SOURCE_NO_PLAYABLE_FORMAT' = 'SOURCE_NOT_FOUND',
  ) {
    super('The YouTube Music candidate is unavailable', options)
    this.name = 'YouTubeMusicCandidateUnavailableError'
  }
}
