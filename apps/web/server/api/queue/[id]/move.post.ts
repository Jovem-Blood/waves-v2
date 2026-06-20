import { moveQueueItemInputSchema, queueSchema } from '@waves/shared'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { definePublicApiHandler } from '../../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

const routeIdSchema = z.string().trim().min(1)

export function createQueueMoveHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const id = routeIdSchema.parse(getRouterParam(event, 'id'))
    const input = moveQueueItemInputSchema.parse(await readBody(event))
    return queueSchema.parse(getDependencies().queueService.move(id, input))
  })
}

export default createQueueMoveHandler()
