import { botHeartbeatInputSchema, operationalStatusSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

export function createInternalHeartbeatHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const input = botHeartbeatInputSchema.parse(await readBody(event))
    void getDependencies()
      .autoplayOrchestrator.retryIfNeeded()
      .catch(() => undefined)
    return operationalStatusSchema.parse(
      getDependencies().operationalStatusService.heartbeat(input),
    )
  }, getExpectedToken)
}

export default createInternalHeartbeatHandler()
