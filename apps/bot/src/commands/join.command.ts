import { runBestEffort } from './best-effort.js'
import { sendControlLinkFollowUp } from './control-link.js'
import { respondToCommandFailure } from './errors.js'
import type { BotCommand } from './types.js'

export const joinCommand: BotCommand = {
  name: 'join',
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

    let result: Awaited<ReturnType<typeof voiceManager.join>>
    try {
      result = await voiceManager.join({
        guildId: context.guildId,
        channelId: context.voiceChannelId,
        adapterCreator: context.voiceAdapterCreator,
      })
    } catch (error) {
      voiceManager.leave(context.guildId)
      await runBestEffort(
        'command.join.failure_event',
        context.logger,
        {
          guildId: context.guildId,
          voiceChannelId: context.voiceChannelId,
          eventType: 'voice.connection_failed',
        },
        () =>
          api.sendEvent({
            type: 'voice.connection_failed',
            occurredAt: new Date().toISOString(),
            guildId: context.guildId!,
            voiceChannelId: context.voiceChannelId!,
            payload: { code: 'VOICE_CONNECTION_FAILED' },
          }),
      )
      return respondToCommandFailure(error, () =>
        context.responder.ephemeral(
          'Não consegui conectar ao canal de voz. Verifique minhas permissões e tente novamente.',
        ),
      )
    }

    const eventResult = await runBestEffort(
      'command.join.connected_event',
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
          payload: { result },
        }),
    )
    let degradedFailure = eventResult.failure
    const playbackResult = await playbackManager.start(context.guildId)
    const connectionMessage =
      result === 'already-connected'
        ? 'O Waves já está conectado ao seu canal de voz.'
        : 'Waves conectado ao seu canal de voz.'
    await context.responder.ephemeral(
      playbackResult === 'started'
        ? `${connectionMessage} A reprodução da fila começou.`
        : connectionMessage,
    )
    const controlLinkResult = await sendControlLinkFollowUp(context)
    degradedFailure ??= controlLinkResult.failure
    if (playbackResult === 'not-connected') {
      degradedFailure ??= new Error('Playback was not connected after voice join')
    }
    context.logger?.info(
      {
        operation: 'command.join',
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        outcome: result,
        playbackOutcome: playbackResult,
      },
      'Join command completed',
    )
    return degradedFailure === undefined
      ? { outcome: 'success' }
      : { outcome: 'degraded', failure: degradedFailure }
  },
}
