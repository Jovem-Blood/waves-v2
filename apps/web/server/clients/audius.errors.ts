export class AudiusUnavailableError extends Error {
  readonly code = 'AUDIUS_UNAVAILABLE'

  constructor() {
    super('Audius is unavailable')
    this.name = 'AudiusUnavailableError'
  }
}

export class AudiusInvalidResponseError extends Error {
  readonly code = 'AUDIUS_INVALID_RESPONSE'

  constructor() {
    super('Audius returned an invalid response')
    this.name = 'AudiusInvalidResponseError'
  }
}
