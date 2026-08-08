import type { BotCommand } from './types.js'
import { runBestEffort } from './best-effort.js'
import { sendControlLinkFollowUp } from './control-link.js'
import { friendlyApiError, respondToCommandFailure } from './errors.js'

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
      return { outcome: 'rejected' }
    }

    await context.responder.deferEphemeral()

    try {
      let degradedFailure: unknown
      let joinedVoice = false
      if (!voiceManager.isConnected(context.guildId)) {
        const connectionResult = await voiceManager.join({
          guildId: context.guildId,
          channelId: context.voiceChannelId,
          adapterCreator: context.voiceAdapterCreator,
        })
        const eventResult = await runBestEffort(
          'command.play.voice_event',
          context.logger,
          {
            guildId: context.guildId,
            voiceChannelId: context.voiceChannelId,
            eventType: 'voice.connected',
          },
          () =>
            api.sendEvent({
              type: 'voice.connected',
              occurredAt: new Date().toISOString(),
              guildId: context.guildId!,
              guildName: context.guildName!,
              voiceChannelId: context.voiceChannelId!,
              voiceChannelName: context.voiceChannelName!,
              payload: { result: connectionResult },
            }),
        )
        degradedFailure = eventResult.failure
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
        const controlLinkResult = await sendControlLinkFollowUp(context)
        degradedFailure ??= controlLinkResult.failure
      }
      if (playbackResult === 'not-connected' || playbackResult === 'empty') {
        degradedFailure ??= new Error(`Playback start returned ${playbackResult}`)
      }
      return degradedFailure === undefined
        ? { outcome: 'success' }
        : { outcome: 'degraded', failure: degradedFailure }
    } catch (error) {
      return respondToCommandFailure(error, () =>
        context.responder.ephemeral(friendlyApiError(error)),
      )
    }
  },
}
