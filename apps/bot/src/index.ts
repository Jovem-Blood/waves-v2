import { Client, Events, GatewayIntentBits } from 'discord.js'

import { WavesApiClient } from './api/waves-api.client.js'
import { parseBotConfig } from './config.js'
import { registerInteractionHandler } from './interaction-handler.js'
import { startBotHealthServer, type BotHealthServer, type BotHealthState } from './health-server.js'
import { createBotLogger } from './logger.js'
import { AudioPlayerManager } from './playback/audio-player-manager.js'
import { registerCommands } from './register-commands.js'
import { createBackoffLoop, type BackoffLoop } from './runtime-loop.js'
import { DiscordVoiceManager } from './voice/discord-voice.manager.js'

export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  })
}

export async function registerCommandsAndLogin(
  config: ReturnType<typeof parseBotConfig>,
  client: Pick<Client, 'login'>,
  register: (config: ReturnType<typeof parseBotConfig>) => Promise<void> = registerCommands,
): Promise<void> {
  await register(config)
  await client.login(config.discordToken)
}

interface BotShutdownResources {
  loops: readonly BackoffLoop[]
  healthState: BotHealthState
  healthServer: BotHealthServer
  playbackManager: Pick<AudioPlayerManager, 'destroyAll'> &
    Partial<Pick<AudioPlayerManager, 'flushTelemetry'>>
  voiceManager: Pick<DiscordVoiceManager, 'destroyAll'>
  client: Pick<Client, 'destroy'>
  logger: ReturnType<typeof createBotLogger>
}

function withTimeout(operation: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Bot shutdown step timed out')), timeoutMs)
    timer.unref()
  })
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export function createBotShutdown(
  resources: BotShutdownResources,
): (signal: string) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return (signal: string) => {
    shutdownPromise ??= (async () => {
      resources.healthState.shuttingDown = true
      resources.logger.info({ signal, operation: 'bot.shutdown' }, 'Waves bot shutting down')

      const runStep = async (operation: string, action: () => void | Promise<void>) => {
        try {
          await action()
        } catch (error) {
          resources.logger.error(
            { operation, outcome: 'failed', err: error },
            'Bot shutdown step failed',
          )
        }
      }
      for (const loop of resources.loops) {
        loop.stop()
      }
      await Promise.all([
        runStep('playback.shutdown', () => resources.playbackManager.destroyAll()),
        runStep('voice.shutdown', () => resources.voiceManager.destroyAll()),
        runStep('discord.shutdown', () => resources.client.destroy()),
      ])
      await runStep('runtime_loops.shutdown', async () => {
        await withTimeout(
          Promise.all(resources.loops.map((loop) => loop.whenIdle())).then(() => undefined),
          10_000,
        )
      })
      await runStep('health.shutdown', () => resources.healthServer.close())
      await runStep('telemetry.shutdown', () =>
        withTimeout(resources.playbackManager.flushTelemetry?.() ?? Promise.resolve(), 10_000),
      )
      resources.logger.info(
        { signal, operation: 'bot.shutdown', outcome: 'completed' },
        'Waves bot shutdown completed',
      )
      await runStep('logger.flush', () => resources.logger.flush())
    })()
    return shutdownPromise
  }
}

export async function startBot(): Promise<Client> {
  const config = parseBotConfig()
  const logger = createBotLogger(config.logLevel)
  const api = new WavesApiClient(config)
  const client = createDiscordClient()
  const playbackReference: { current?: AudioPlayerManager } = {}
  const voiceManager = new DiscordVoiceManager(
    logger,
    async (guildId, voiceChannelId) => {
      playbackReference.current?.destroyGuild(guildId, 'VOICE_DISCONNECTED')
      await api.sendEvent({
        type: 'voice.disconnected',
        occurredAt: new Date().toISOString(),
        guildId,
        voiceChannelId,
        payload: { reason: 'unexpected' },
      })
    },
    undefined,
    undefined,
    async (type, guildId, voiceChannelId) => {
      await api.sendEvent({
        type: `voice.${type}`,
        occurredAt: new Date().toISOString(),
        guildId,
        voiceChannelId,
        payload: {},
      })
    },
  )
  const playbackManager = new AudioPlayerManager(api, voiceManager, logger, client)
  const botStartedAt = new Date().toISOString()
  playbackReference.current = playbackManager
  const healthState: BotHealthState = {
    discordReady: false,
    shuttingDown: false,
  }
  const heartbeatMaxAgeMs = config.heartbeatMaxAgeMs ?? 120_000
  const healthServer = await startBotHealthServer({
    host: config.healthHost ?? '127.0.0.1',
    port: config.healthPort ?? 3_002,
    heartbeatMaxAgeMs,
    state: healthState,
    logger,
  })
  const reconciliationLoop = createBackoffLoop({
    intervalMs: 2_500,
    maxBackoffMs: 30_000,
    async action() {
      const failures: unknown[] = []
      const connectedGuildIds = voiceManager.getConnectedGuildIds()
      await Promise.all(
        connectedGuildIds.map(async (guildId) => {
          try {
            const queue = await api.getQueue()
            if (queue.length === 0) {
              return
            }
            await playbackManager.synchronize(guildId)
            if (!playbackManager.hasActivePlayback(guildId)) {
              await playbackManager.start(guildId)
            }
          } catch (error) {
            failures.push(error)
          }
        }),
      )
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Playback reconciliation failed', {
          cause: failures[0],
        })
      }
    },
    onFailure(error) {
      logger.error(
        {
          operation: 'playback.reconcile',
          outcome: 'failed',
          errorCode: 'PLAYBACK_SYNC_FAILED',
          err: error,
        },
        'Playback reconciliation failed',
      )
    },
  })
  const heartbeatLoop = createBackoffLoop({
    intervalMs: 5_000,
    maxBackoffMs: 30_000,
    async action() {
      await api.heartbeat(new Date().toISOString(), {
        startedAt: botStartedAt,
        activePlaybackAttemptIds: playbackManager.activeAttemptIds(),
      })
      healthState.lastHeartbeatAt = Date.now()
    },
    onFailure(error) {
      logger.warn(
        { operation: 'bot.heartbeat', outcome: 'failed', err: error },
        'Bot heartbeat synchronization failed',
      )
    },
  })

  registerInteractionHandler(client, api, voiceManager, playbackManager, config.appHostname, logger)
  client.once(Events.ClientReady, (readyClient) => {
    healthState.discordReady = true
    logger.info({ discordUserId: readyClient.user.id }, 'Waves bot ready')
    heartbeatLoop.start(true)
    reconciliationLoop.start()
  })
  client.on(Events.ShardDisconnect, () => {
    healthState.discordReady = false
  })
  client.on(Events.ShardReady, () => {
    healthState.discordReady = true
  })
  client.on(Events.Error, (error) => {
    logger.error(
      { operation: 'discord.client', outcome: 'failed', err: error },
      'Discord client error',
    )
  })

  const shutdown = createBotShutdown({
    loops: [heartbeatLoop, reconciliationLoop],
    healthState,
    healthServer,
    playbackManager,
    voiceManager,
    client,
    logger,
  })
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await registerCommandsAndLogin(config, client)
  } catch (error) {
    await shutdown('startup_failure')
    throw error
  }
  return client
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') ===
    process.argv[1].replaceAll('\\', '/')

if (isEntrypoint) {
  void startBot().catch((error: unknown) => {
    createBotLogger().fatal({ err: error }, 'Waves bot failed to start')
    process.exitCode = 1
  })
}
