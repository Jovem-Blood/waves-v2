import { botPlayInputSchema, queueItemSchema, trackMetadataSchema } from '@waves/shared'
import { readBody } from 'h3'
import { z } from 'zod'

import { TrackNotFoundError } from '../../../services/domain-errors'
import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'
import { useLogger } from '../../../utils/logger'
import { loggedOperation } from '../../../utils/observability'

const playResultSchema = z.strictObject({
  item: queueItemSchema,
  track: trackMetadataSchema,
})

export function createInternalPlayHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    return loggedOperation(useLogger(), { operation: 'route.internal.play' }, async () => {
      const input = botPlayInputSchema.parse(await readBody(event))
      const track = (await getDependencies().spotifyService.searchTracks(input.query))[0]

      if (!track) {
        throw new TrackNotFoundError()
      }

      const linkedUser = getDependencies().authService.findDiscordUser(
        input.requestedByDiscordUserId,
      )
      const dependencies = getDependencies()
      const item = dependencies.queueService.add({
        track,
        ...(linkedUser === undefined ? {} : { requestedByUserId: linkedUser.id }),
        requestedByDiscordUserId: input.requestedByDiscordUserId,
        requestedByDisplayName: linkedUser?.displayName ?? input.requestedByDisplayName,
      })
      await dependencies.autoplayOrchestrator?.queueChanged().catch(() => undefined)
      useLogger().info(
        { operation: 'route.internal.play', queueItemId: item.id, outcome: 'added' },
        'Internal play added queue item',
      )

      return playResultSchema.parse({ item, track })
    })
  }, getExpectedToken)
}

export default createInternalPlayHandler()
