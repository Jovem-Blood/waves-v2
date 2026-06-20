import pino, { type Logger } from 'pino'

export type WavesLogger = Pick<Logger, 'info'>

let runtimeLogger: Logger | undefined

export function useLogger(): Logger {
  runtimeLogger ??= pino({
    name: 'waves-web',
    redact: {
      paths: [
        'authorization',
        'Authorization',
        'token',
        'accessToken',
        'clientSecret',
        'payload',
        'req.headers.authorization',
      ],
      remove: true,
    },
  })

  return runtimeLogger
}
