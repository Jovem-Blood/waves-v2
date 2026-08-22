import { playbackAttemptReportSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../../utils/public-api-dependencies'

export function createInternalPlaybackAttemptHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const input = playbackAttemptReportSchema.parse(await readBody(event))
    getDependencies().playerStateService.reportPlaybackAttempt(input)
    return { accepted: true as const }
  }, getExpectedToken)
}

export default createInternalPlaybackAttemptHandler()
