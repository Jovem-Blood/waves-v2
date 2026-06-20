import type { BotCommand } from './types.js'

export const joinCommand: BotCommand = {
  name: 'join',
  async execute(context, api, voiceManager) {
    if (!context.guildId || !context.voiceChannelId || !context.voiceAdapterCreator) {
      await context.responder.ephemeral('Entre em um canal de voz antes de usar este comando.')
      return
    }

    await context.responder.deferEphemeral()

    let result: Awaited<ReturnType<typeof voiceManager.join>>
    try {
      result = await voiceManager.join({
        guildId: context.guildId,
        channelId: context.voiceChannelId,
        adapterCreator: context.voiceAdapterCreator,
      })
    } catch {
      voiceManager.leave(context.guildId)
      await api
        .sendEvent({
          type: 'voice.connection_failed',
          occurredAt: new Date().toISOString(),
          guildId: context.guildId,
          voiceChannelId: context.voiceChannelId,
          payload: { code: 'VOICE_CONNECTION_FAILED' },
        })
        .catch(() => undefined)
      await context.responder.ephemeral(
        'Não consegui conectar ao canal de voz. Verifique minhas permissões e tente novamente.',
      )
      return
    }

    await context.responder.ephemeral(
      result === 'already-connected'
        ? 'O Waves já está conectado ao seu canal de voz.'
        : 'Waves conectado ao seu canal de voz.',
    )
    await api
      .sendEvent({
        type: 'voice.connected',
        occurredAt: new Date().toISOString(),
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        payload: { result },
      })
      .catch(() => undefined)
  },
}
