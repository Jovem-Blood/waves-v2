import type { BotCommand } from './types.js'
import { sendControlLinkFollowUp } from './control-link.js'
import { friendlyApiError } from './errors.js'

export const playCommand: BotCommand = {
  name: 'play',
  async execute(context, api, voiceManager, playbackManager) {
    if (
      !context.guildId ||
      !context.guildName ||
      !context.voiceChannelId ||
      !context.voiceChannelName ||
      !context.voiceAdapterCreator
    ) {
      await context.responder.ephemeral('Entre em um canal de voz antes de usar este comando.')
      return
    }

    await context.responder.deferEphemeral()

    try {
      let joinedVoice = false
      if (!voiceManager.isConnected(context.guildId)) {
        const connectionResult = await voiceManager.join({
          guildId: context.guildId,
          channelId: context.voiceChannelId,
          adapterCreator: context.voiceAdapterCreator,
        })
        await api.sendEvent({
          type: 'voice.connected',
          occurredAt: new Date().toISOString(),
          guildId: context.guildId,
          guildName: context.guildName,
          voiceChannelId: context.voiceChannelId,
          voiceChannelName: context.voiceChannelName,
          payload: { result: connectionResult },
        })
        joinedVoice = true
      }

      const result = await api.play({
        query: context.query ?? '',
        requestedByDiscordUserId: context.userId,
        requestedByDisplayName: context.displayName,
      })
      context.logger?.info(
        {
          operation: 'queue.add',
          guildId: context.guildId,
          queueItemId: result.item.id,
          discordUserId: context.userId,
          outcome: 'added',
        },
        'Queue item added from command',
      )
      const playbackResult = await playbackManager.start(context.guildId)
      const suffix =
        playbackResult === 'started'
          ? ' Reprodução iniciada.'
          : playbackResult === 'already-playing'
            ? ' A reprodução atual continua.'
            : playbackResult === 'empty'
              ? ' A fila está vazia.'
              : ' Não foi possível iniciar a reprodução.'
      await context.responder.public(
        `Adicionada à fila: **${result.track.title}** — ${result.track.artists.join(', ')}.${suffix}`,
      )
      if (joinedVoice) {
        await sendControlLinkFollowUp(context)
      }
    } catch (error) {
      await context.responder.ephemeral(friendlyApiError(error))
    }
  },
}
