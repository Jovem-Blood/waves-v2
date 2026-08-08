import { defineEventHandler, setResponseStatus, type H3Event } from 'h3'

import { checkRuntimeDatabaseReadiness } from '../../db/client'

export function createReadyHealthHandler(
  checkDatabase: () => void = checkRuntimeDatabaseReadiness,
) {
  return defineEventHandler((event: H3Event) => {
    try {
      checkDatabase()
      return {
        ok: true,
        checks: {
          database: 'ready',
        },
      } as const
    } catch {
      setResponseStatus(event, 503, 'Service Unavailable')
      return {
        ok: false,
        checks: {
          database: 'not_ready',
        },
      } as const
    }
  })
}

export const readyHealthHandler = createReadyHealthHandler()

export default readyHealthHandler
