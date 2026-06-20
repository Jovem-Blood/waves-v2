import type { BotCommand } from './types.js'

export const volumeCommand: BotCommand = {
  name: 'volume',
  async execute(context, api, _voiceManager, playbackManager) {
    const volume = context.volume
    if (
      !context.guildId ||
      volume === undefined ||
      !playbackManager.setVolume(context.guildId, volume)
    ) {
      await context.responder.ephemeral('Não há reprodução ativa para ajustar o volume.')
      return
    }
    await api.sendEvent({
      type: 'playback.volume_changed',
      occurredAt: new Date().toISOString(),
      guildId: context.guildId,
      payload: { volume },
    })
    await context.responder.public(`Volume ajustado para ${volume}%.`)
  },
}
