import { queueItemAudioSourceSchema, resolveAudioSourceInputSchema } from '@waves/shared'
import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../../../utils/internal-auth'
import {
  type AudioSourceApiDependencies,
  useAudioSourceApiDependencies,
} from '../../../../../utils/audio-source-dependencies'

const queueItemIdSchema = z.string().trim().min(1)

export function createInternalResolveSourceHandler(
  getDependencies: () => AudioSourceApiDependencies = useAudioSourceApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const queueItemId = queueItemIdSchema.parse(getRouterParam(event, 'queueItemId'))
    const input = resolveAudioSourceInputSchema.parse(await readBody(event))
    const result = await getDependencies().audioSourceService.resolve(queueItemId, input)
    return queueItemAudioSourceSchema.parse(result)
  }, getExpectedToken)
}

export default createInternalResolveSourceHandler()
