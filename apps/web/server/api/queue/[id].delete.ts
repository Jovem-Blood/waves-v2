import { queueSchema } from '@waves/shared'
import { getRouterParam } from 'h3'
import { z } from 'zod'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

const routeIdSchema = z.string().trim().min(1)

export function createQueueRemoveHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    const id = routeIdSchema.parse(getRouterParam(event, 'id'))
    return queueSchema.parse(getDependencies().queueService.remove(id))
  })
}

export default createQueueRemoveHandler()
