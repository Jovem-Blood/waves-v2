import type { BotCommand } from './types.js'
import { friendlyApiError, respondToCommandFailure } from './errors.js'

export const skipCommand: BotCommand = {
  name: 'skip',
  async execute(context, _api, _voiceManager, playbackManager) {
    try {
      if (!context.guildId) {
        await context.responder.ephemeral('Este comando só pode ser usado em um servidor.')
        return { outcome: 'rejected' }
      }
      const result = await playbackManager.skip(context.guildId)
      context.logger?.info(
        {
          operation: 'command.skip',
          guildId: context.guildId,
          outcome: result,
        },
        'Skip command completed',
      )
      await context.responder.public(
        result === 'skipped'
          ? 'Faixa pulada. A próxima faixa começou.'
          : result === 'empty'
            ? 'Faixa pulada. A fila agora está vazia.'
            : 'O Waves precisa estar conectado a um canal de voz.',
      )
      return result === 'not-connected' ? { outcome: 'rejected' } : { outcome: 'success' }
    } catch (error) {
      return respondToCommandFailure(error, () =>
        context.responder.ephemeral(friendlyApiError(error)),
      )
    }
  },
}
