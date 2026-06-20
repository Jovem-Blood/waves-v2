import { botEventSchema } from '@waves/shared'
import { readBody, setResponseStatus } from 'h3'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import { type WavesLogger, useLogger } from '../../../utils/logger'
import {
  type PublicPlayerStateService,
  usePublicApiDependencies,
} from '../../../utils/public-api-dependencies'

const eventAcknowledgementSchema = z.strictObject({
  accepted: z.literal(true),
})

export function createInternalEventsHandler(
  getExpectedToken?: () => string,
  getLogger: () => WavesLogger = useLogger,
  getPlayerStateService: () => PublicPlayerStateService = () =>
    usePublicApiDependencies().playerStateService,
) {
  return defineInternalApiHandler(async (event) => {
    const botEvent = botEventSchema.parse(await readBody(event))

    if (botEvent.type === 'voice.connected') {
      getPlayerStateService().voiceConnected(botEvent.guildId!, botEvent.voiceChannelId!)
    } else if (botEvent.type === 'voice.disconnected') {
      getPlayerStateService().voiceDisconnected(botEvent.guildId!)
    }

    getLogger().info(
      {
        eventType: botEvent.type,
        occurredAt: botEvent.occurredAt,
        ...(botEvent.guildId === undefined ? {} : { guildId: botEvent.guildId }),
        ...(botEvent.voiceChannelId === undefined
          ? {}
          : { voiceChannelId: botEvent.voiceChannelId }),
      },
      'Bot event received',
    )

    setResponseStatus(event, 202, 'Accepted')
    return eventAcknowledgementSchema.parse({ accepted: true })
  }, getExpectedToken)
}

export default createInternalEventsHandler()
