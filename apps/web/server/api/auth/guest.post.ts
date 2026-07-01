import { authUserResponseSchema, createGuestSessionInputSchema } from '@waves/shared'
import { readBody } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'

export function createGuestAuthHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const input = createGuestSessionInputSchema.parse(await readBody(event))
    const created = getDependencies().authService.createGuestSession(
      input,
      readSessionCookie(event),
    )

    writeSessionCookie(event, created.token, { expiresAt: created.expiresAt })

    return authUserResponseSchema.parse({ user: created.user })
  })
}

export default createGuestAuthHandler()
