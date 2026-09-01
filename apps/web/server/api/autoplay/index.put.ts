import { autoplayStateSchema, updateAutoplayInputSchema } from '@waves/shared'
import { readBody } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import { UnauthorizedError } from '../../utils/internal-errors'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'

export function createAutoplayUpdateHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const input = updateAutoplayInputSchema.parse(await readBody(event))
    const dependencies = getDependencies()
    const token = readSessionCookie(event)
    const session = dependencies.authService.getCurrentSession(token)
    if (!session) throw new UnauthorizedError()
    if (token && session.renewed) writeSessionCookie(event, token, { expiresAt: session.expiresAt })

    return autoplayStateSchema.parse(dependencies.autoplayService.update(input))
  })
}

export default createAutoplayUpdateHandler()
