export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED'

  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}
