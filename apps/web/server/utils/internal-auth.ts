import { timingSafeEqual } from 'node:crypto'

import { type EventHandler, type H3Event, getRequestHeader } from 'h3'

import { definePublicApiHandler } from './api-error'
import { parseInternalApiConfig } from './internal-api-config'
import { UnauthorizedError } from './internal-errors'

function tokensMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  )
}

export function requireBearerToken(event: H3Event, expectedToken: string): void {
  const authorization = getRequestHeader(event, 'authorization')
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '')

  if (!match?.[1] || !tokensMatch(match[1], expectedToken)) {
    throw new UnauthorizedError()
  }
}

export function defineInternalApiHandler<T>(
  handler: (event: H3Event) => T | Promise<T>,
  getExpectedToken: () => string = () => parseInternalApiConfig().token,
): EventHandler {
  return definePublicApiHandler(async (event) => {
    requireBearerToken(event, getExpectedToken())
    return handler(event)
  })
}
