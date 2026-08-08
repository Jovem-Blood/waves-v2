export class AudiusUnavailableError extends Error {
  readonly code = 'AUDIUS_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Audius is unavailable', options)
    this.name = 'AudiusUnavailableError'
  }
}

export class AudiusInvalidResponseError extends Error {
  readonly code = 'AUDIUS_INVALID_RESPONSE'

  constructor(options?: ErrorOptions) {
    super('Audius returned an invalid response', options)
    this.name = 'AudiusInvalidResponseError'
  }
}
