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
      loggedOperation(useLogger(), { operation: 'route.internal.playback.claim' }, () =>
        playbackClaimResultSchema.parse(getDependencies().playerStateService.claimPlayback()),
      ),
    getExpectedToken,
  )
}

export default createInternalPlaybackClaimHandler()
