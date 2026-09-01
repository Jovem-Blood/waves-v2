import { playerStateSchema, queueSchema } from '@waves/shared'
import { z } from 'zod'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

const skipResultSchema = z.strictObject({
  player: playerStateSchema,
  queue: queueSchema,
})

export function createPlayerSkipHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async () => {
    const dependencies = getDependencies()
    const result = await dependencies.autoplayOrchestrator.skip()
    return skipResultSchema.parse(result)
  })
}

export default createPlayerSkipHandler()
