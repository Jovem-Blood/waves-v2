import { playerStateSchema, setPlayerCrossfadeInputSchema } from '@waves/shared'
import { readBody } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import { UnauthorizedError } from '../../utils/internal-errors'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'

export function createPlayerCrossfadeUpdateHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const input = setPlayerCrossfadeInputSchema.parse(await readBody(event))
    const dependencies = getDependencies()
    const token = readSessionCookie(event)
    const session = dependencies.authService.getCurrentSession(token)
    if (!session) throw new UnauthorizedError()
    if (token && session.renewed) writeSessionCookie(event, token, { expiresAt: session.expiresAt })

    return playerStateSchema.parse(dependencies.playerStateService.setCrossfade(input))
  })
}

export default createPlayerCrossfadeUpdateHandler()
