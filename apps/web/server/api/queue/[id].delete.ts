import { removeQueueItemResultSchema } from '@waves/shared'
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
  return definePublicApiHandler(async (event) => {
    const id = routeIdSchema.parse(getRouterParam(event, 'id'))
    const dependencies = getDependencies()
    const result = dependencies.queueService.remove(id)
    await dependencies.autoplayOrchestrator.queueChanged().catch(() => undefined)
    return removeQueueItemResultSchema.parse(result)
  })
}

export default createQueueRemoveHandler()
