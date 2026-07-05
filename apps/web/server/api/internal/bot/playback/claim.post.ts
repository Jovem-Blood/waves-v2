import { playbackClaimResultSchema } from '@waves/shared'

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
    () =>
      loggedOperation(useLogger(), { operation: 'route.internal.playback.claim' }, async () => {
        const dependencies = getDependencies()
        await dependencies.autoplayOrchestrator?.queueChanged().catch(() => undefined)
        return playbackClaimResultSchema.parse(dependencies.playerStateService.claimPlayback())
      }),
    getExpectedToken,
  )
}

export default createInternalPlaybackClaimHandler()
