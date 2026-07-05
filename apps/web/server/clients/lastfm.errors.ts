export class LastFmConfigurationError extends Error {
  readonly code = 'LASTFM_CONFIGURATION_ERROR'

  constructor() {
    super('Invalid Last.fm configuration: LASTFM_API_KEY')
    this.name = 'LastFmConfigurationError'
  }
}

export class LastFmUnavailableError extends Error {
  readonly code = 'LASTFM_UNAVAILABLE'

  constructor(
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super('Last.fm is unavailable', options)
    this.name = 'LastFmUnavailableError'
  }
}

export class LastFmInvalidResponseError extends Error {
  readonly code = 'LASTFM_INVALID_RESPONSE'

  constructor(options?: ErrorOptions) {
    super('Last.fm returned an invalid response', options)
    this.name = 'LastFmInvalidResponseError'
  }
}
