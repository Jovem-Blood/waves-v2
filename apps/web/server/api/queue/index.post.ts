import { addQueueItemInputSchema, queueItemSchema } from '@waves/shared'
import { readBody } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createQueueAddHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const input = addQueueItemInputSchema.parse(await readBody(event))
    return queueItemSchema.parse(getDependencies().queueService.add(input))
  })
}

export default createQueueAddHandler()
