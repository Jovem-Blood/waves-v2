import { botEventSchema } from '@waves/shared'
import { readBody, setResponseStatus } from 'h3'
import { z } from 'zod'

import { defineInternalApiHandler } from '../../../utils/internal-auth'
import { type WavesLogger, useLogger } from '../../../utils/logger'
import {
  type PublicOperationalStatusService,
  type PublicAutoplayOrchestrator,
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
  getOperationalStatusService: () => PublicOperationalStatusService = () =>
    usePublicApiDependencies().operationalStatusService,
  getAutoplayOrchestrator: () => PublicAutoplayOrchestrator | undefined = () =>
    usePublicApiDependencies().autoplayOrchestrator,
) {
  return defineInternalApiHandler(async (event) => {
    const startedAt = Date.now()
    const botEvent = botEventSchema.parse(await readBody(event))
    getLogger().info(
      {
        operation: 'route.internal.events',
        eventType: botEvent.type,
        guildId: botEvent.guildId,
        voiceChannelId: botEvent.voiceChannelId,
        outcome: 'received',
      },
      'Bot event route received event',
    )

    if (botEvent.type === 'voice.connected') {
      getPlayerStateService().voiceConnected(
        botEvent.guildId!,
        botEvent.guildName!,
        botEvent.voiceChannelId!,
        botEvent.voiceChannelName!,
      )
      getOperationalStatusService().setVoiceStatus('connected')
    } else if (botEvent.type === 'voice.disconnected') {
      const orchestrator = getAutoplayOrchestrator()
      if (orchestrator) orchestrator.voiceDisconnected(botEvent.guildId!)
      else getPlayerStateService().voiceDisconnected(botEvent.guildId!)
      getOperationalStatusService().setVoiceStatus('disconnected')
    } else if (botEvent.type === 'voice.reconnecting') {
      getOperationalStatusService().setVoiceStatus('reconnecting')
    } else if (botEvent.type === 'voice.reconnected') {
      getOperationalStatusService().setVoiceStatus('connected')
    } else if (botEvent.type === 'playback.paused') {
      getPlayerStateService().pause()
    } else if (botEvent.type === 'playback.resumed') {
      getPlayerStateService().resume()
    } else if (
      botEvent.type === 'playback.volume_changed' &&
      typeof botEvent.payload.volume === 'number'
    ) {
      getPlayerStateService().setVolume({ volume: botEvent.payload.volume })
    }

    getLogger().info(
      {
        eventType: botEvent.type,
        operation: 'route.internal.events',
        outcome: 'accepted',
        durationMs: Date.now() - startedAt,
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
