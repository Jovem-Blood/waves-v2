import { queueSchema } from '@waves/shared'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

export function createInternalQueueHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(
    () => queueSchema.parse(getDependencies().queueService.list()),
    getExpectedToken,
  )
}

export default createInternalQueueHandler()
