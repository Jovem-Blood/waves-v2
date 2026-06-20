import { completePlaybackInputSchema, playbackTransitionResultSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../../utils/public-api-dependencies'
import { useLogger } from '../../../../utils/logger'
import { loggedOperation } from '../../../../utils/observability'

export function createInternalPlaybackCompleteHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    return loggedOperation(
      useLogger(),
      { operation: 'route.internal.playback.complete' },
      async () => {
        const input = completePlaybackInputSchema.parse(await readBody(event))
        const result = playbackTransitionResultSchema.parse(
          getDependencies().playerStateService.completePlayback(input),
        )
        useLogger().info(
          {
            operation: 'route.internal.playback.complete',
            queueItemId: input.queueItemId,
            outcome: input.outcome,
            promotedQueueItemId: result.nextItem?.id,
          },
          'Internal playback completion applied',
        )
        return result
      },
    )
  }, getExpectedToken)
}

export default createInternalPlaybackCompleteHandler()
