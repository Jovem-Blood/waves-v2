import {
  type AudioPlayer,
  entersState,
  joinVoiceChannel,
  type PlayerSubscription,
  VoiceConnectionStatus,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
  type VoiceConnectionState,
} from '@discordjs/voice'

import type { BotLogger } from '../logger.js'
import type { JoinVoiceInput, JoinVoiceResult, VoiceManager } from './voice-manager.js'

interface VoiceRuntime {
  join(input: {
    guildId: string
    channelId: string
    adapterCreator: DiscordGatewayAdapterCreator
  }): VoiceConnection
  waitUntilReady(connection: VoiceConnection, timeoutMs: number): Promise<void>
}

interface VoiceSession {
  channelId: string
  connection: VoiceConnection
  intentionalDestroy: boolean
  recovering: boolean
}

const defaultRuntime: VoiceRuntime = {
  join(input) {
    return joinVoiceChannel({
      guildId: input.guildId,
      channelId: input.channelId,
      adapterCreator: input.adapterCreator,
      selfDeaf: true,
      selfMute: false,
    })
  },
  async waitUntilReady(connection, timeoutMs) {
    await entersState(connection, VoiceConnectionStatus.Ready, timeoutMs)
  },
}

export class VoiceConnectionError extends Error {
  constructor() {
    super('Voice connection did not become ready')
    this.name = 'VoiceConnectionError'
  }
}

export class DiscordVoiceManager implements VoiceManager {
  private readonly sessions = new Map<string, VoiceSession>()

  constructor(
    private readonly logger: BotLogger,
    private readonly onUnexpectedDisconnect: (guildId: string, channelId: string) => Promise<void>,
    private readonly runtime: VoiceRuntime = defaultRuntime,
    private readonly readyTimeoutMs = 15_000,
  ) {}

  async join(input: JoinVoiceInput): Promise<JoinVoiceResult> {
    const existing = this.sessions.get(input.guildId)
    if (
      existing?.channelId === input.channelId &&
      existing.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      await this.runtime.waitUntilReady(existing.connection, this.readyTimeoutMs)
      return 'already-connected'
    }

    if (existing) {
      this.destroySession(input.guildId, existing)
    }

    const connection = this.runtime.join(input)
    const session: VoiceSession = {
      channelId: input.channelId,
      connection,
      intentionalDestroy: false,
      recovering: false,
    }
    this.sessions.set(input.guildId, session)
    connection.on('stateChange', (_previousState, nextState) => {
      this.handleStateChange(input.guildId, session, nextState)
    })

    try {
      await this.runtime.waitUntilReady(connection, this.readyTimeoutMs)
      return 'connected'
    } catch {
      this.destroySession(input.guildId, session)
      throw new VoiceConnectionError()
    }
  }

  leave(guildId: string): boolean {
    const session = this.sessions.get(guildId)
    if (!session) {
      return false
    }

    this.destroySession(guildId, session)
    return true
  }

  isConnected(guildId: string): boolean {
    return this.sessions.get(guildId)?.connection.state.status === VoiceConnectionStatus.Ready
  }

  subscribe(guildId: string, player: AudioPlayer): PlayerSubscription | undefined {
    const session = this.sessions.get(guildId)
    if (!session || session.connection.state.status !== VoiceConnectionStatus.Ready) {
      return undefined
    }
    return session.connection.subscribe(player)
  }

  destroyAll(): void {
    for (const [guildId, session] of this.sessions) {
      this.destroySession(guildId, session)
    }
  }

  private destroySession(guildId: string, session: VoiceSession): void {
    session.intentionalDestroy = true
    if (session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      session.connection.destroy()
    }
    if (this.sessions.get(guildId) === session) {
      this.sessions.delete(guildId)
    }
  }

  private handleStateChange(
    guildId: string,
    session: VoiceSession,
    nextState: VoiceConnectionState,
  ): void {
    if (
      nextState.status === VoiceConnectionStatus.Disconnected &&
      !session.intentionalDestroy &&
      !session.recovering &&
      this.sessions.get(guildId) === session
    ) {
      session.recovering = true
      void this.runtime
        .waitUntilReady(session.connection, this.readyTimeoutMs)
        .then(() => {
          session.recovering = false
        })
        .catch(() => {
          if (session.intentionalDestroy || this.sessions.get(guildId) !== session) {
            return
          }
          this.destroySession(guildId, session)
          void this.notifyUnexpectedDisconnect(guildId, session.channelId)
        })
      return
    }

    if (
      nextState.status !== VoiceConnectionStatus.Destroyed ||
      session.intentionalDestroy ||
      this.sessions.get(guildId) !== session
    ) {
      return
    }

    this.sessions.delete(guildId)
    void this.notifyUnexpectedDisconnect(guildId, session.channelId)
  }

  private async notifyUnexpectedDisconnect(guildId: string, channelId: string): Promise<void> {
    await this.onUnexpectedDisconnect(guildId, channelId).catch(() => {
      this.logger.error({ guildId, voiceChannelId: channelId }, 'Voice event sync failed')
    })
  }
}
