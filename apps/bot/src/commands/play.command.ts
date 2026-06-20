import type { BotCommand } from './types.js'
import { friendlyApiError } from './errors.js'

export const playCommand: BotCommand = {
  name: 'play',
  async execute(context, api, _voiceManager, playbackManager) {
    await context.responder.deferEphemeral()

    try {
      const result = await api.play({
        query: context.query ?? '',
        requestedByDiscordUserId: context.userId,
        requestedByDisplayName: context.displayName,
      })
      const playbackResult = context.guildId
        ? await playbackManager.start(context.guildId)
        : 'not-connected'
      const suffix =
        playbackResult === 'started'
          ? ' Reprodução iniciada.'
          : playbackResult === 'already-playing'
            ? ' A reprodução atual continua.'
            : ' Use `/join` para iniciar a reprodução.'
      await context.responder.public(
        `Adicionada à fila: **${result.track.title}** — ${result.track.artists.join(', ')}.${suffix}`,
      )
    } catch (error) {
      await context.responder.ephemeral(friendlyApiError(error))
    }
  },
}
