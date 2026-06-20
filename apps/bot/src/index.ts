import { Client, Events, GatewayIntentBits } from 'discord.js'

import { WavesApiClient } from './api/waves-api.client.js'
import { parseBotConfig } from './config.js'
import { registerInteractionHandler } from './interaction-handler.js'
import { createBotLogger } from './logger.js'
import { AudioPlayerManager } from './playback/audio-player-manager.js'
import { DiscordVoiceManager } from './voice/discord-voice.manager.js'

export function createDiscordClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  })
}

export async function startBot(): Promise<Client> {
  const config = parseBotConfig()
  const logger = createBotLogger()
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
  const playbackManager = new AudioPlayerManager(api, voiceManager, logger)
  playbackReference.current = playbackManager

  registerInteractionHandler(client, api, voiceManager, playbackManager, logger)
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ discordUserId: readyClient.user.id }, 'Waves bot ready')
  })
  client.on(Events.Error, () => {
    logger.error('Discord client error')
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Waves bot shutting down')
    playbackManager.destroyAll()
    voiceManager.destroyAll()
    void client.destroy()
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  await client.login(config.discordToken)
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
