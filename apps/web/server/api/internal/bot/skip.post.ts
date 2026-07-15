import { playerStateSchema, queueSchema } from '@waves/shared'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'
import { useLogger } from '../../../utils/logger'
import { loggedOperation } from '../../../utils/observability'

const skipResultSchema = z.strictObject({
  player: playerStateSchema,
  queue: queueSchema,
})

export function createInternalSkipHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(
    () =>
      loggedOperation(useLogger(), { operation: 'route.internal.skip' }, async () => {
        const dependencies = getDependencies()
        const result = dependencies.autoplayOrchestrator
          ? await dependencies.autoplayOrchestrator.skip()
          : dependencies.playerStateService.skip()
        return skipResultSchema.parse(result)
      }),
    getExpectedToken,
  )
}

export default createInternalSkipHandler()
