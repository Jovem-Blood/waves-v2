import type { WavesApi } from '../api/waves-api.client.js'
import type { DiscordGatewayAdapterCreator } from '@discordjs/voice'

import type { VoiceManager } from '../voice/voice-manager.js'
import type { PlaybackManager } from '../playback/audio-player-manager.js'
import type { BotLogger } from '../logger.js'

export interface CommandResponder {
  deferEphemeral(): Promise<void>
  public(content: string): Promise<void>
  followUpPublic(message: CommandMessage): Promise<void>
  ephemeral(content: string): Promise<void>
}

export interface CommandMessage {
  content: string
  files?: readonly CommandAttachment[]
}

export interface CommandAttachment {
  attachment: Buffer
  name: string
}

export interface CommandContext {
  name: string
  appHostname: string
  guildId?: string
  query?: string
  volume?: number
  userId: string
  displayName: string
  discordUsername?: string
  discordGlobalName?: string
  discordAvatarUrl?: string
  guildName?: string
  voiceChannelId?: string
  voiceChannelName?: string
  voiceAdapterCreator?: DiscordGatewayAdapterCreator
  logger?: BotLogger
  responder: CommandResponder
}

export interface BotCommand {
  name: string
  execute(
    context: CommandContext,
    api: WavesApi,
    voiceManager: VoiceManager,
    playbackManager: PlaybackManager,
  ): Promise<void>
}
