import {
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
} from 'discord.js'

import type { WavesApi } from './api/waves-api.client.js'
import { executeCommand } from './commands/index.js'
import type { CommandExecutionResult, CommandResponder } from './commands/types.js'
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
    async followUpPublic(message) {
      await interaction.followUp({
        content: message.content,
        ...(message.files === undefined ? {} : { files: [...message.files] }),
      })
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
  appHostname: string,
  logger?: BotLogger,
): Promise<CommandExecutionResult> {
  const startedAt = Date.now()
  const member = interaction.member
  const displayName =
    member instanceof GuildMember
      ? member.displayName
      : (interaction.user.globalName ?? interaction.user.username)
  const discordAvatarUrl = interaction.user.avatarURL()
  const voiceChannelId =
    member instanceof GuildMember ? (member.voice.channelId ?? undefined) : undefined
  const voiceChannelName =
    member instanceof GuildMember ? (member.voice.channel?.name ?? undefined) : undefined

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
  const result = await executeCommand(
    {
      name: interaction.commandName,
      appHostname,
      ...(interaction.guildId === null ? {} : { guildId: interaction.guildId }),
      ...(interaction.guild === null ? {} : { guildName: interaction.guild.name }),
      ...(interaction.commandName === 'play'
        ? { query: interaction.options.getString('query', true) }
        : {}),
      ...(interaction.commandName === 'volume'
        ? { volume: interaction.options.getInteger('valor', true) }
        : {}),
      userId: interaction.user.id,
      displayName,
      discordUsername: interaction.user.username,
      ...(interaction.user.globalName === null
        ? {}
        : { discordGlobalName: interaction.user.globalName }),
      ...(discordAvatarUrl === null ? {} : { discordAvatarUrl }),
      ...(voiceChannelId === undefined ? {} : { voiceChannelId }),
      ...(voiceChannelName === undefined ? {} : { voiceChannelName }),
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
  const durationMs = Date.now() - startedAt
  const terminalLog = {
    operation: 'command.execute',
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    voiceChannelId,
    discordUserId: interaction.user.id,
    outcome: result.outcome,
    durationMs,
    ...(result.failure === undefined ? {} : { err: result.failure }),
  }
  if (result.outcome === 'dependency_error' || result.outcome === 'internal_error') {
    logger?.error(terminalLog, 'Discord command failed')
  } else if (
    result.outcome === 'degraded' ||
    result.outcome === 'rejected' ||
    result.outcome === 'user_error' ||
    result.outcome === 'unknown_command'
  ) {
    logger?.warn(terminalLog, 'Discord command did not complete normally')
  } else {
    logger?.info(terminalLog, 'Discord command completed')
  }
  return result
}

export function registerInteractionHandler(
  client: Client,
  api: WavesApi,
  voiceManager: VoiceManager,
  playbackManager: PlaybackManager,
  appHostname: string,
  logger: BotLogger,
): void {
  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    void handleInteraction(
      interaction,
      api,
      voiceManager,
      playbackManager,
      appHostname,
      logger,
    ).catch((error: unknown) => {
      logger.error(
        {
          operation: 'command.execute',
          commandName: interaction.commandName,
          discordUserId: interaction.user.id,
          outcome: 'internal_error',
          err: error,
        },
        'Command handler failed',
      )
    })
  })
}
