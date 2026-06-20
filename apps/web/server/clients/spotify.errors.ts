export class SpotifyConfigurationError extends Error {
  readonly code = 'SPOTIFY_CONFIGURATION_ERROR'

  constructor(readonly invalidVariables: readonly string[]) {
    super(`Invalid Spotify configuration: ${invalidVariables.join(', ')}`)
    this.name = 'SpotifyConfigurationError'
  }
}

export class SpotifyAuthenticationError extends Error {
  readonly code = 'SPOTIFY_AUTHENTICATION_ERROR'

  constructor() {
    super('Spotify authentication failed')
    this.name = 'SpotifyAuthenticationError'
  }
}

export class SpotifyUnavailableError extends Error {
  readonly code = 'SPOTIFY_UNAVAILABLE'

  constructor(readonly operation: 'authenticate' | 'search') {
    super(`Spotify is unavailable during ${operation}`)
    this.name = 'SpotifyUnavailableError'
  }
}

export class SpotifyInvalidResponseError extends Error {
  readonly code = 'SPOTIFY_INVALID_RESPONSE'

  constructor(readonly operation: 'authenticate' | 'search') {
    super(`Spotify returned an invalid ${operation} response`)
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
