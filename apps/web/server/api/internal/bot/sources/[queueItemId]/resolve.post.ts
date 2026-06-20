import { queueItemAudioSourceSchema, resolveAudioSourceInputSchema } from '@waves/shared'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../../../utils/internal-auth'
import {
  type AudioSourceApiDependencies,
  useAudioSourceApiDependencies,
} from '../../../../../utils/audio-source-dependencies'
import { useLogger } from '../../../../../utils/logger'
import { loggedOperation } from '../../../../../utils/observability'

const queueItemIdSchema = z.string().trim().min(1)

export function createInternalResolveSourceHandler(
  getDependencies: () => AudioSourceApiDependencies = useAudioSourceApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const queueItemId = queueItemIdSchema.parse(getRouterParam(event, 'queueItemId'))
    return loggedOperation(
      useLogger(),
      { operation: 'route.internal.source.resolve', queueItemId },
      async () => {
        const input = resolveAudioSourceInputSchema.parse(await readBody(event))
        const result = await getDependencies().audioSourceService.resolve(queueItemId, input)
        const parsed = queueItemAudioSourceSchema.parse(result)
        useLogger().info(
          {
            operation: 'route.internal.source.resolve',
            queueItemId,
            provider: parsed.source.provider,
            sourceIdentifier: parsed.source.sourceIdentifier,
            forceRefresh: input.forceRefresh ?? false,
            outcome: 'resolved',
          },
          'Internal source resolve completed',
        )
        return parsed
      },
    )
  }, getExpectedToken)
}

export default createInternalResolveSourceHandler()
