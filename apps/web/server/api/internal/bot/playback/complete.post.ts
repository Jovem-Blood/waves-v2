import { completePlaybackInputSchema, playbackTransitionResultSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../../utils/public-api-dependencies'

export function createInternalPlaybackCompleteHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const input = completePlaybackInputSchema.parse(await readBody(event))
    return playbackTransitionResultSchema.parse(
      getDependencies().playerStateService.completePlayback(input),
    )
  }, getExpectedToken)
}

export default createInternalPlaybackCompleteHandler()
