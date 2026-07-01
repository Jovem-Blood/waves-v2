import { createDiscordLinkInputSchema, createDiscordLinkResponseSchema } from '@waves/shared'
import { readBody } from 'h3'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'
import { parsePublicAppConfig } from '../../../utils/public-app-config'

export function createDiscordLinkCreateHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getPublicAppUrl: () => string = () => parsePublicAppConfig().url,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const input = createDiscordLinkInputSchema.parse(await readBody(event))
    return createDiscordLinkResponseSchema.parse(
      getDependencies().authService.createDiscordLink(input, getPublicAppUrl()),
    )
  }, getExpectedToken)
}

export default createDiscordLinkCreateHandler()
