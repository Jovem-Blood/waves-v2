import pino from 'pino'

export function createBotLogger() {
  return pino({
    name: 'waves-bot',
    redact: {
      paths: [
        'token',
        'discordToken',
        'internalApiToken',
        'authorization',
        'Authorization',
        'req.headers.authorization',
      ],
      remove: true,
    },
  })
}

export type BotLogger = ReturnType<typeof createBotLogger>
