import { playbackClaimResultSchema } from '@waves/shared'

import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../../utils/public-api-dependencies'

export function createInternalPlaybackClaimHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(
    () => playbackClaimResultSchema.parse(getDependencies().playerStateService.claimPlayback()),
    getExpectedToken,
  )
}

export default createInternalPlaybackClaimHandler()
