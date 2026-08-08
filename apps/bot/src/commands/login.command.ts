import type { BotCommand } from './types.js'
import { friendlyApiError, respondToCommandFailure } from './errors.js'

export const loginCommand: BotCommand = {
  name: 'login',
  async execute(context, api) {
    await context.responder.deferEphemeral()

    try {
      const result = await api.createDiscordLink({
        discordUserId: context.userId,
        discordUsername: context.discordUsername ?? context.displayName,
        ...(context.discordGlobalName === undefined
          ? {}
          : { discordGlobalName: context.discordGlobalName }),
        ...(context.discordAvatarUrl === undefined
          ? {}
          : { discordAvatarUrl: context.discordAvatarUrl }),
        ...(context.guildId === undefined ? {} : { guildId: context.guildId }),
      })

      await context.responder.ephemeral(
        [
          'Use este link privado para vincular sua sessão do Waves ao Discord:',
          result.url,
          'Ele expira em 10 minutos e só funciona uma vez.',
        ].join('\n'),
      )
      return { outcome: 'success' }
    } catch (error) {
      return respondToCommandFailure(error, () =>
        context.responder.ephemeral(friendlyApiError(error)),
      )
    }
  },
}
