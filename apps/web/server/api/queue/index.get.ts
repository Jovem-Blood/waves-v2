import { queueSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createQueueListHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(() => queueSchema.parse(getDependencies().queueService.list()))
}

export default createQueueListHandler()
