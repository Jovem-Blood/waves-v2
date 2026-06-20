import { playerStateSchema, queueSchema } from '@waves/shared'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

const skipResultSchema = z.strictObject({
  player: playerStateSchema,
  queue: queueSchema,
})

export function createInternalSkipHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(
    () => skipResultSchema.parse(getDependencies().playerStateService.skip()),
    getExpectedToken,
  )
}

export default createInternalSkipHandler()
