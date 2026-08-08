import { runBestEffort } from './best-effort.js'
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
      return { outcome: 'rejected' }
    }
    const eventResult = await runBestEffort(
      'command.volume.event',
      context.logger,
      { guildId: context.guildId, eventType: 'playback.volume_changed' },
      () =>
        api.sendEvent({
          type: 'playback.volume_changed',
          occurredAt: new Date().toISOString(),
          guildId: context.guildId!,
          payload: { volume },
        }),
    )
    await context.responder.public(`Volume ajustado para ${volume}%.`)
    return eventResult.ok
      ? { outcome: 'success' }
      : { outcome: 'degraded', failure: eventResult.failure }
  },
}
