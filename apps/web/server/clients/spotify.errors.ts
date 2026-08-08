export class SpotifyConfigurationError extends Error {
  readonly code = 'SPOTIFY_CONFIGURATION_ERROR'

  constructor(readonly invalidVariables: readonly string[]) {
    super(`Invalid Spotify configuration: ${invalidVariables.join(', ')}`)
    this.name = 'SpotifyConfigurationError'
  }
}

export class SpotifyAuthenticationError extends Error {
  readonly code = 'SPOTIFY_AUTHENTICATION_ERROR'

  constructor(options?: ErrorOptions) {
    super('Spotify authentication failed', options)
    this.name = 'SpotifyAuthenticationError'
  }
}

export class SpotifyUnavailableError extends Error {
  readonly code = 'SPOTIFY_UNAVAILABLE'

  constructor(
    readonly operation: 'authenticate' | 'search',
    options?: ErrorOptions,
  ) {
    super(`Spotify is unavailable during ${operation}`, options)
    this.name = 'SpotifyUnavailableError'
  }
}

export class SpotifyInvalidResponseError extends Error {
  readonly code = 'SPOTIFY_INVALID_RESPONSE'

  constructor(
    readonly operation: 'authenticate' | 'search',
    options?: ErrorOptions,
  ) {
    super(`Spotify returned an invalid ${operation} response`, options)
    this.name = 'SpotifyInvalidResponseError'
  }
}

export class SpotifyInvalidQueryError extends Error {
  readonly code = 'SPOTIFY_INVALID_QUERY'

  constructor() {
    super('Spotify search query must not be empty')
    this.name = 'SpotifyInvalidQueryError'
  }
}
