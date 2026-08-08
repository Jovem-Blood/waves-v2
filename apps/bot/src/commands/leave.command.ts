import { runBestEffort } from './best-effort.js'
import type { BotCommand } from './types.js'

export const leaveCommand: BotCommand = {
  name: 'leave',
  async execute(context, api, voiceManager, playbackManager) {
    if (!context.guildId) {
      await context.responder.ephemeral('Este comando só pode ser usado em um servidor.')
      return { outcome: 'rejected' }
    }

    await context.responder.deferEphemeral()

    playbackManager.destroyGuild(context.guildId)
    const disconnected = voiceManager.leave(context.guildId)
    await context.responder.ephemeral(
      disconnected ? 'Waves desconectado do canal de voz.' : 'O Waves já estava desconectado.',
    )
    context.logger?.info(
      {
        operation: 'command.leave',
        guildId: context.guildId,
        outcome: disconnected ? 'disconnected' : 'already_disconnected',
      },
      'Leave command completed',
    )
    const eventResult = await runBestEffort(
      'command.leave.event',
      context.logger,
      {
        guildId: context.guildId,
        eventType: 'voice.disconnected',
        errorCode: 'PLAYBACK_SYNC_FAILED',
      },
      () =>
        api.sendEvent({
          type: 'voice.disconnected',
          occurredAt: new Date().toISOString(),
          guildId: context.guildId!,
          payload: { reason: 'command' },
        }),
    )
    return eventResult.ok
      ? { outcome: 'success' }
      : { outcome: 'degraded', failure: eventResult.failure }
  },
}
