export class YouTubeMusicInvalidResponseError extends Error {
  constructor() {
    super('YouTube Music returned an invalid response')
    this.name = 'YouTubeMusicInvalidResponseError'
  }
}

export class YouTubeMusicUnavailableError extends Error {
  constructor() {
    super('YouTube Music is unavailable')
    this.name = 'YouTubeMusicUnavailableError'
  }
}

export class YouTubeMusicCandidateUnavailableError extends Error {
  constructor() {
    super('The YouTube Music candidate is unavailable')
    this.name = 'YouTubeMusicCandidateUnavailableError'
  }
}
