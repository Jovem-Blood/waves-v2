import { autoplayStateSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import { UnauthorizedError } from '../../utils/internal-errors'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'

export function createAutoplaySuggestionRejectHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const dependencies = getDependencies()
    const token = readSessionCookie(event)
    const session = dependencies.authService.getCurrentSession(token)
    if (!session) throw new UnauthorizedError()
    if (token && session.renewed) writeSessionCookie(event, token, { expiresAt: session.expiresAt })
    if (!dependencies.autoplayService) throw new Error('Autoplay service is unavailable')
    dependencies.autoplayService.rejectSuggestion()
    await dependencies.autoplayOrchestrator?.queueChanged().catch(() => undefined)
    return autoplayStateSchema.parse(dependencies.autoplayService.get())
  })
}

export default createAutoplaySuggestionRejectHandler()
