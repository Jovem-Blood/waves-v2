import { botPlayInputSchema, queueItemSchema, trackMetadataSchema } from '@waves/shared'
import { readBody } from 'h3'
import { z } from 'zod'

import { TrackNotFoundError } from '../../../services/domain-errors'
import { defineInternalApiHandler } from '../../../utils/internal-auth'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

const playResultSchema = z.strictObject({
  item: queueItemSchema,
  track: trackMetadataSchema,
})

export function createInternalPlayHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
  getExpectedToken?: () => string,
) {
  return defineInternalApiHandler(async (event) => {
    const input = botPlayInputSchema.parse(await readBody(event))
    const track = (await getDependencies().spotifyService.searchTracks(input.query))[0]

    if (!track) {
      throw new TrackNotFoundError()
    }

    const item = getDependencies().queueService.add({
      track,
      requestedByDiscordUserId: input.requestedByDiscordUserId,
      requestedByDisplayName: input.requestedByDisplayName,
    })

    return playResultSchema.parse({ item, track })
  }, getExpectedToken)
}

export default createInternalPlayHandler()
