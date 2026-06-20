export class AudioSourceNotFoundError extends Error {
  readonly code = 'SOURCE_NOT_FOUND'

  constructor() {
    super('No playable source matched the track')
    this.name = 'AudioSourceNotFoundError'
  }
}

export class AudioSourceUnavailableError extends Error {
  readonly code = 'SOURCE_UNAVAILABLE'

  constructor() {
    super('The audio source provider is unavailable')
    this.name = 'AudioSourceUnavailableError'
  }
}
