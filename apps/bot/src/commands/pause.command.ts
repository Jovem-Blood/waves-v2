import { runBestEffort } from './best-effort.js'
import type { BotCommand } from './types.js'

export const pauseCommand: BotCommand = {
  name: 'pause',
  async execute(context, api, _voiceManager, playbackManager) {
    if (!context.guildId || !playbackManager.pause(context.guildId)) {
      await context.responder.ephemeral('Não há reprodução ativa para pausar.')
      return { outcome: 'rejected' }
    }
    const eventResult = await runBestEffort(
      'command.pause.event',
      context.logger,
      { guildId: context.guildId, eventType: 'playback.paused' },
      () =>
        api.sendEvent({
          type: 'playback.paused',
          occurredAt: new Date().toISOString(),
          guildId: context.guildId!,
          payload: { queueItemId: 'current' },
        }),
    )
    await context.responder.public('Reprodução pausada.')
    return eventResult.ok
      ? { outcome: 'success' }
      : { outcome: 'degraded', failure: eventResult.failure }
  },
}
