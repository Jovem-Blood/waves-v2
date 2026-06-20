import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino'
import { z } from 'zod'

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export type WavesLogger = Pick<Logger, 'child' | 'debug' | 'info' | 'warn' | 'error'>
export type WebLogLevel = z.infer<typeof logLevelSchema>

export const sensitiveLogPaths = [
  'token',
  'accessToken',
  'clientSecret',
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
  'payload',
  'raw',
  'error',
  'err',
  'req.headers',
  'req.headers.authorization',
  '*.token',
  '*.accessToken',
  '*.clientSecret',
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
  '*.payload',
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
  '*.*.payload',
] as const

export class WebLoggerConfigurationError extends Error {
  constructor() {
    super('Invalid web logger configuration: LOG_LEVEL')
    this.name = 'WebLoggerConfigurationError'
  }
}

export function parseWebLogLevel(
  environment: Record<string, string | undefined> = process.env,
): WebLogLevel {
  const result = logLevelSchema.safeParse(
    environment.LOG_LEVEL ?? (environment.NODE_ENV === 'development' ? 'debug' : 'info'),
  )
  if (!result.success) {
    throw new WebLoggerConfigurationError()
  }
  return result.data
}

export function createWebLogger(
  level: WebLogLevel = parseWebLogLevel(),
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    name: 'waves-web',
    level,
    base: { service: 'web' },
    redact: {
      paths: [...sensitiveLogPaths],
      remove: true,
    },
  }
  return destination ? pino(options, destination) : pino(options)
}

let runtimeLogger: Logger | undefined

export function useLogger(): Logger {
  runtimeLogger ??= createWebLogger()
  return runtimeLogger
}
