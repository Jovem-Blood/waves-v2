import {
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
} from 'discord.js'

import type { WavesApi } from './api/waves-api.client.js'
import { executeCommand } from './commands/index.js'
import type { CommandResponder } from './commands/types.js'
import type { BotLogger } from './logger.js'
import type { PlaybackManager } from './playback/audio-player-manager.js'
import type { VoiceManager } from './voice/voice-manager.js'

function createResponder(interaction: ChatInputCommandInteraction): CommandResponder {
  return {
    async deferEphemeral() {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      }
    },
    async public(content) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content })
        return
      }
      await interaction.reply({ content })
    },
    async ephemeral(content) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content })
        return
      }
      await interaction.reply({ content, flags: MessageFlags.Ephemeral })
    },
  }
}

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  api: WavesApi,
  voiceManager: VoiceManager,
  playbackManager: PlaybackManager,
  logger?: BotLogger,
): Promise<void> {
  const startedAt = Date.now()
  const member = interaction.member
  const displayName =
    member instanceof GuildMember
      ? member.displayName
      : (interaction.user.globalName ?? interaction.user.username)
  const voiceChannelId =
    member instanceof GuildMember ? (member.voice.channelId ?? undefined) : undefined

  logger?.info(
    {
      operation: 'command.execute',
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      voiceChannelId,
      discordUserId: interaction.user.id,
      outcome: 'received',
    },
    'Discord command received',
  )
  await executeCommand(
    {
      name: interaction.commandName,
      ...(interaction.guildId === null ? {} : { guildId: interaction.guildId }),
      ...(interaction.commandName === 'play'
        ? { query: interaction.options.getString('query', true) }
        : {}),
      ...(interaction.commandName === 'volume'
        ? { volume: interaction.options.getInteger('valor', true) }
        : {}),
      userId: interaction.user.id,
      displayName,
      ...(voiceChannelId === undefined ? {} : { voiceChannelId }),
      ...(interaction.guild === null
        ? {}
        : { voiceAdapterCreator: interaction.guild.voiceAdapterCreator }),
      ...(logger === undefined ? {} : { logger }),
      responder: createResponder(interaction),
    },
    api,
    voiceManager,
    playbackManager,
  )
  logger?.info(
    {
      operation: 'command.execute',
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      voiceChannelId,
      discordUserId: interaction.user.id,
      outcome: 'completed',
      durationMs: Date.now() - startedAt,
    },
    'Discord command completed',
  )
}

export function registerInteractionHandler(
  client: Client,
  api: WavesApi,
  voiceManager: VoiceManager,
  playbackManager: PlaybackManager,
  logger: BotLogger,
): void {
  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    void handleInteraction(interaction, api, voiceManager, playbackManager, logger).catch(
      (error: unknown) => {
        logger.error(
          {
            operation: 'command.execute',
            commandName: interaction.commandName,
            discordUserId: interaction.user.id,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            outcome: 'failed',
          },
          'Command handler failed',
        )
      },
    )
  })
}
