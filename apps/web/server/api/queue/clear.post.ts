import { clearQueueResultSchema } from '@waves/shared'
import { definePublicApiHandler } from '../../utils/api-error'
import {
  usePublicApiDependencies,
  type PublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createQueueClearHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async () => {
    const dependencies = getDependencies()
    const result = dependencies.queueService.clearUpcoming()
    await dependencies.autoplayOrchestrator.queueChanged().catch(() => undefined)
    return clearQueueResultSchema.parse(result)
  })
}

export default createQueueClearHandler()
