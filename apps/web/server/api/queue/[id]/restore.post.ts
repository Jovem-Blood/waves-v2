import { restoreQueueItemResultSchema } from '@waves/shared'
import { getRouterParam } from 'h3'
import { z } from 'zod'

import { definePublicApiHandler } from '../../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

const routeIdSchema = z.string().trim().min(1)

export function createQueueRestoreHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    const id = routeIdSchema.parse(getRouterParam(event, 'id'))
    return restoreQueueItemResultSchema.parse(getDependencies().queueService.restore(id))
  })
}

export default createQueueRestoreHandler()
