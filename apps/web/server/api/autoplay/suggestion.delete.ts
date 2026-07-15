import { autoplayStateSchema, rejectAutoplaySuggestionInputSchema } from '@waves/shared'
import { readBody } from 'h3'

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
    const input = rejectAutoplaySuggestionInputSchema.parse(await readBody(event))
    const state = dependencies.autoplayOrchestrator
      ? await dependencies.autoplayOrchestrator.rejectSuggestion(input.providerTrackId)
      : dependencies.autoplayService.rejectSuggestion(input.providerTrackId)
    return autoplayStateSchema.parse(state)
  })
}

export default createAutoplaySuggestionRejectHandler()
