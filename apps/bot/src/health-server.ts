import { createServer, type Server } from 'node:http'

import type { BotLogger } from './logger.js'

export interface BotHealthState {
  discordReady: boolean
  lastHeartbeatAt?: number
  shuttingDown: boolean
}

export interface BotHealthServer {
  port: number
  close(): Promise<void>
}

export interface StartBotHealthServerOptions {
  host: string
  port: number
  heartbeatMaxAgeMs: number
  state: BotHealthState
  logger: BotLogger
  now?: () => number
}

function isReady(state: BotHealthState, heartbeatMaxAgeMs: number, now: () => number): boolean {
  return (
    !state.shuttingDown &&
    state.discordReady &&
    state.lastHeartbeatAt !== undefined &&
    now() - state.lastHeartbeatAt <= heartbeatMaxAgeMs
  )
}

export async function startBotHealthServer(
  options: StartBotHealthServerOptions,
): Promise<BotHealthServer> {
  const now = options.now ?? Date.now
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')

    if (request.method !== 'GET') {
      response.writeHead(405)
      response.end('{"ok":false}')
      return
    }
    if (request.url === '/health/live') {
      const live = !options.state.shuttingDown
      response.writeHead(live ? 200 : 503)
      response.end(JSON.stringify({ ok: live }))
      return
    }
    if (request.url === '/health/ready') {
      const ready = isReady(options.state, options.heartbeatMaxAgeMs, now)
      response.writeHead(ready ? 200 : 503)
      response.end(JSON.stringify({ ok: ready }))
      return
    }
    response.writeHead(404)
    response.end('{"ok":false}')
  })

  await listen(server, options.host, options.port)
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  options.logger.info(
    {
      operation: 'health.listen',
      healthHost: options.host,
      healthPort: port,
      outcome: 'listening',
    },
    'Bot health server listening',
  )

  let closePromise: Promise<void> | undefined
  return {
    port,
    close() {
      closePromise ??= close(server)
      return closePromise
    },
  }
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeIdleConnections()
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
