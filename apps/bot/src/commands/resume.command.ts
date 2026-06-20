import type { BotCommand } from './types.js'

export const resumeCommand: BotCommand = {
  name: 'resume',
  async execute(context, api, _voiceManager, playbackManager) {
    if (!context.guildId || !playbackManager.resume(context.guildId)) {
      await context.responder.ephemeral('Não há reprodução pausada para retomar.')
      return
    }
    await api.sendEvent({
      type: 'playback.resumed',
      occurredAt: new Date().toISOString(),
      guildId: context.guildId,
      payload: { queueItemId: 'current' },
    })
    await context.responder.public('Reprodução retomada.')
  },
}
