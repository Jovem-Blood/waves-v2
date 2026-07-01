import { addQueueItemInputSchema, queueItemSchema } from '@waves/shared'
import { readBody } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'
import { UnauthorizedError } from '../../utils/internal-errors'

export function createQueueAddHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const input = addQueueItemInputSchema.parse(await readBody(event))
    const token = readSessionCookie(event)
    const session = getDependencies().authService.getCurrentSession(token)
    if (!session) {
      throw new UnauthorizedError()
    }

    if (token && session.renewed) {
      writeSessionCookie(event, token, { expiresAt: session.expiresAt })
    }

    return queueItemSchema.parse(
      getDependencies().queueService.add({
        ...input,
        requestedByUserId: session.user.id,
        requestedByDisplayName: session.user.displayName,
      }),
    )
  })
}

export default createQueueAddHandler()
