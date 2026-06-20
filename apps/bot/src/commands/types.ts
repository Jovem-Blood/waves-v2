import type { WavesApi } from '../api/waves-api.client.js'
import type { DiscordGatewayAdapterCreator } from '@discordjs/voice'

import type { VoiceManager } from '../voice/voice-manager.js'
import type { PlaybackManager } from '../playback/audio-player-manager.js'

export interface CommandResponder {
  deferEphemeral(): Promise<void>
  public(content: string): Promise<void>
  ephemeral(content: string): Promise<void>
}

export interface CommandContext {
  name: string
  guildId?: string
  query?: string
  userId: string
  displayName: string
  voiceChannelId?: string
  voiceAdapterCreator?: DiscordGatewayAdapterCreator
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
