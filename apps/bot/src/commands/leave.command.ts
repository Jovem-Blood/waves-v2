import type { BotCommand } from './types.js'

export const leaveCommand: BotCommand = {
  name: 'leave',
  async execute(context, api, voiceManager, playbackManager) {
    if (!context.guildId) {
      await context.responder.ephemeral('Este comando só pode ser usado em um servidor.')
      return
    }

    await context.responder.deferEphemeral()

    playbackManager.destroyGuild(context.guildId)
    const disconnected = voiceManager.leave(context.guildId)
    await context.responder.ephemeral(
      disconnected ? 'Waves desconectado do canal de voz.' : 'O Waves já estava desconectado.',
    )
    await api
      .sendEvent({
        type: 'voice.disconnected',
        occurredAt: new Date().toISOString(),
        guildId: context.guildId,
        payload: { reason: 'command' },
      })
      .catch(() => undefined)
  },
}
