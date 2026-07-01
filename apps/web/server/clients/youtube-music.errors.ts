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
  constructor(options?: ErrorOptions) {
    super('The YouTube Music candidate is unavailable', options)
    this.name = 'YouTubeMusicCandidateUnavailableError'
  }
}
