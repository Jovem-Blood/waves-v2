export class AudioSourceNotFoundError extends Error {
  readonly code = 'SOURCE_NOT_FOUND'

  constructor(options?: ErrorOptions) {
    super('No playable source matched the track', options)
    this.name = 'AudioSourceNotFoundError'
  }
}

export class AudioSourceUnavailableError extends Error {
  readonly code = 'SOURCE_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('The audio source provider is unavailable', options)
    this.name = 'AudioSourceUnavailableError'
  }
}
