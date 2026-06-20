import type {
  AudioPlayer,
  DiscordGatewayAdapterCreator,
  PlayerSubscription,
} from '@discordjs/voice'

export interface JoinVoiceInput {
  guildId: string
  channelId: string
  adapterCreator: DiscordGatewayAdapterCreator
}

export type JoinVoiceResult = 'connected' | 'already-connected'

export interface VoiceManager {
  join(input: JoinVoiceInput): Promise<JoinVoiceResult>
  leave(guildId: string): boolean
  isConnected(guildId: string): boolean
  getConnectedGuildIds(): string[]
  getChannelId(guildId: string): string | undefined
  subscribe(guildId: string, player: AudioPlayer): PlayerSubscription | undefined
  destroyAll(): void
}
