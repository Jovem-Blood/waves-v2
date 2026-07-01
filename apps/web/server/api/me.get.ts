import { meResponseSchema } from '@waves/shared'

import { definePublicApiHandler } from '../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../utils/public-api-dependencies'
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from '../utils/session-cookie'

export function createMeHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    const token = readSessionCookie(event)
    const session = getDependencies().authService.getCurrentSession(token)

    if (!session) {
      clearSessionCookie(event)
      return meResponseSchema.parse({ user: null })
    }

    if (token && session.renewed) {
      writeSessionCookie(event, token, { expiresAt: session.expiresAt })
    }

    return meResponseSchema.parse({ user: session.user })
  })
}

export default createMeHandler()
