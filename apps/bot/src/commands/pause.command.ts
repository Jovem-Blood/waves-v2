import type { BotCommand } from './types.js'

export const pauseCommand: BotCommand = {
  name: 'pause',
  async execute(context, api, _voiceManager, playbackManager) {
    if (!context.guildId || !playbackManager.pause(context.guildId)) {
      await context.responder.ephemeral('Não há reprodução ativa para pausar.')
      return
    }
    await api.sendEvent({
      type: 'playback.paused',
      occurredAt: new Date().toISOString(),
      guildId: context.guildId,
      payload: { queueItemId: 'current' },
    })
    await context.responder.public('Reprodução pausada.')
  },
}
