import pino, { type Logger, type LoggerOptions, type DestinationStream } from 'pino'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const sensitiveLogPaths = [
  'token',
  'discordToken',
  'internalApiToken',
  'authorization',
  'Authorization',
  'streamUrl',
  'url',
  'headers',
  'cookies',
  'cookie',
  'poToken',
  'po_token',
  'pot',
  'visitorData',
  'playerScript',
  'query',
  'raw',
  'error',
  'err',
  'req.headers',
  'req.headers.authorization',
  '*.token',
  '*.authorization',
  '*.Authorization',
  '*.streamUrl',
  '*.url',
  '*.headers',
  '*.cookies',
  '*.cookie',
  '*.poToken',
  '*.po_token',
  '*.pot',
  '*.visitorData',
  '*.playerScript',
  '*.query',
  '*.raw',
  '*.error',
  '*.err',
  '*.*.token',
  '*.*.authorization',
  '*.*.streamUrl',
  '*.*.url',
  '*.*.headers',
  '*.*.cookies',
  '*.*.query',
] as const

export function createBotLogger(
  level: LogLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    name: 'waves-bot',
    level,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    base: { service: 'bot' },
    redact: {
      paths: [...sensitiveLogPaths],
      remove: true,
    },
  }
  return destination ? pino(options, destination) : pino(options)
}

export type BotLogger = ReturnType<typeof createBotLogger>
