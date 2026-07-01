import { z } from 'zod'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { clearSessionCookie, readSessionCookie } from '../../utils/session-cookie'

const logoutResponseSchema = z.object({ ok: z.literal(true) }).strict()

export function createLogoutHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    getDependencies().authService.logout(readSessionCookie(event))
    clearSessionCookie(event)
    return logoutResponseSchema.parse({ ok: true })
  })
}

export default createLogoutHandler()
