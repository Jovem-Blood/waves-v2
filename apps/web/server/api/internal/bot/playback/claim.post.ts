import { playbackClaimInputSchema, playbackClaimResultSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../../utils/public-api-dependencies'
import { useLogger } from '../../../../utils/logger'
import { loggedOperation } from '../../../../utils/observability'

export function createInternalPlaybackClaimHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(
    (event) =>
      loggedOperation(useLogger(), { operation: 'route.internal.playback.claim' }, async () => {
        const dependencies = getDependencies()
        const input = playbackClaimInputSchema.parse(await readBody(event))
        await dependencies.autoplayOrchestrator?.queueChanged().catch(() => undefined)
        return playbackClaimResultSchema.parse(dependencies.playerStateService.claimPlayback(input))
      }),
    getExpectedToken,
  )
}

export default createInternalPlaybackClaimHandler()
