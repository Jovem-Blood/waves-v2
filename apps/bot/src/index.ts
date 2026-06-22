import { Client, Events, GatewayIntentBits } from 'discord.js'

import { WavesApiClient } from './api/waves-api.client.js'
import { parseBotConfig } from './config.js'
import { registerInteractionHandler } from './interaction-handler.js'
import { createBotLogger } from './logger.js'
import { AudioPlayerManager } from './playback/audio-player-manager.js'
import { registerCommands } from './register-commands.js'
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

export async function startBot(): Promise<Client> {
  const config = parseBotConfig()
  const logger = createBotLogger(config.logLevel)
  const api = new WavesApiClient(config)
  const client = createDiscordClient()
  const playbackReference: { current?: AudioPlayerManager } = {}
  const voiceManager = new DiscordVoiceManager(logger, async (guildId, voiceChannelId) => {
    playbackReference.current?.destroyGuild(guildId)
    await api.sendEvent({
      type: 'voice.disconnected',
      occurredAt: new Date().toISOString(),
      guildId,
      voiceChannelId,
      payload: { reason: 'unexpected' },
    })
  })
  const playbackManager = new AudioPlayerManager(api, voiceManager, logger, client)
  playbackReference.current = playbackManager
  let reconciliationRunning = false
  const reconciliationTimer = setInterval(() => {
    if (reconciliationRunning) {
      return
    }
    reconciliationRunning = true
    void Promise.all(
      voiceManager.getConnectedGuildIds().map(async (guildId) => {
        try {
          const queue = await api.getQueue()
          if (queue.length === 0) {
            return
          }
          await playbackManager.start(guildId)
          await playbackManager.synchronize(guildId)
        } catch {
          logger.error(
            {
              operation: 'playback.reconcile',
              guildId,
              outcome: 'failed',
              errorCode: 'PLAYBACK_SYNC_FAILED',
            },
            'Playback reconciliation failed',
          )
        }
      }),
    ).finally(() => {
      reconciliationRunning = false
    })
  }, 2_500)
  reconciliationTimer.unref()

  registerInteractionHandler(client, api, voiceManager, playbackManager, config.appHostname, logger)
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ discordUserId: readyClient.user.id }, 'Waves bot ready')
  })
  client.on(Events.Error, () => {
    logger.error('Discord client error')
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Waves bot shutting down')
    clearInterval(reconciliationTimer)
    playbackManager.destroyAll()
    voiceManager.destroyAll()
    void client.destroy()
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  await registerCommandsAndLogin(config, client)
  return client
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') ===
    process.argv[1].replaceAll('\\', '/')

if (isEntrypoint) {
  void startBot().catch(() => {
    createBotLogger().fatal('Waves bot failed to start')
    process.exitCode = 1
  })
}
