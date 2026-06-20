import type { QueueItem } from '@waves/shared'
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  type AudioPlayer,
  type AudioPlayerState,
  type AudioResource,
} from '@discordjs/voice'

import type { WavesApi } from '../api/waves-api.client.js'
import type { BotLogger } from '../logger.js'
import type { VoiceManager } from '../voice/voice-manager.js'

export type StartPlaybackResult = 'started' | 'already-playing' | 'not-connected' | 'empty'
export type SkipPlaybackResult = 'skipped' | 'not-connected' | 'empty'

export interface PlaybackManager {
  start(guildId: string): Promise<StartPlaybackResult>
  skip(guildId: string): Promise<SkipPlaybackResult>
  destroyGuild(guildId: string): void
  destroyAll(): void
}

export interface PlaybackRuntime {
  createPlayer(): AudioPlayer
  createResource(streamUrl: string, queueItemId: string): AudioResource<{ queueItemId: string }>
}

interface CurrentPlayback {
  item: QueueItem
  retries: number
}

interface PlaybackSession {
  player: AudioPlayer
  current: CurrentPlayback | undefined
  settling: boolean
}

const defaultRuntime: PlaybackRuntime = {
  createPlayer() {
    return createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    })
  },
  createResource(streamUrl, queueItemId) {
    return createAudioResource(streamUrl, {
      metadata: { queueItemId },
    })
  },
}

export class AudioPlayerManager implements PlaybackManager {
  private readonly sessions = new Map<string, PlaybackSession>()

  constructor(
    private readonly api: WavesApi,
    private readonly voiceManager: VoiceManager,
    private readonly logger: BotLogger,
    private readonly runtime: PlaybackRuntime = defaultRuntime,
  ) {}

  async start(guildId: string): Promise<StartPlaybackResult> {
    if (!this.voiceManager.isConnected(guildId)) {
      return 'not-connected'
    }

    const session = this.getOrCreateSession(guildId)
    if (session.current && session.player.state.status !== AudioPlayerStatus.Idle) {
      return 'already-playing'
    }

    const claim = await this.api.claimPlayback()
    if (!claim.item) {
      return 'empty'
    }

    await this.playItem(guildId, session, claim.item, 0)
    return 'started'
  }

  async skip(guildId: string): Promise<SkipPlaybackResult> {
    if (!this.voiceManager.isConnected(guildId)) {
      return 'not-connected'
    }

    const result = await this.api.skip()
    const session = this.getOrCreateSession(guildId)
    session.settling = true
    session.current = undefined
    session.player.stop(true)
    session.settling = false

    const next = result.queue[0]
    if (!next) {
      return 'empty'
    }

    await this.playItem(guildId, session, next, 0)
    return 'skipped'
  }

  destroyGuild(guildId: string): void {
    const session = this.sessions.get(guildId)
    if (!session) {
      return
    }
    session.settling = true
    session.current = undefined
    session.player.stop(true)
    this.sessions.delete(guildId)
  }

  destroyAll(): void {
    for (const guildId of [...this.sessions.keys()]) {
      this.destroyGuild(guildId)
    }
  }

  private getOrCreateSession(guildId: string): PlaybackSession {
    const existing = this.sessions.get(guildId)
    if (existing) {
      return existing
    }

    const player = this.runtime.createPlayer()
    const session: PlaybackSession = { player, current: undefined, settling: false }
    player.on('stateChange', (previousState, nextState) => {
      this.handleStateChange(guildId, session, previousState, nextState)
    })
    player.on('error', () => {
      void this.handlePlayerError(guildId, session)
    })

    if (!this.voiceManager.subscribe(guildId, player)) {
      player.stop(true)
      throw new Error('Voice connection is not ready for playback')
    }

    this.sessions.set(guildId, session)
    return session
  }

  private async playItem(
    guildId: string,
    session: PlaybackSession,
    item: QueueItem,
    retries: number,
  ): Promise<void> {
    try {
      const resolved = await this.api.resolveSource(item.id, retries > 0)
      session.current = { item, retries }
      session.player.play(
        this.runtime.createResource(resolved.source.streamUrl, resolved.queueItemId),
      )
    } catch {
      if (retries < 1) {
        await this.playItem(guildId, session, item, retries + 1)
        return
      }
      await this.failAndAdvance(guildId, session, item)
    }
  }

  private handleStateChange(
    guildId: string,
    session: PlaybackSession,
    previousState: AudioPlayerState,
    nextState: AudioPlayerState,
  ): void {
    if (
      nextState.status === AudioPlayerStatus.Playing &&
      previousState.status !== AudioPlayerStatus.Playing &&
      session.current
    ) {
      void this.sendPlaybackEvent('playback.started', guildId, session.current.item.id)
      return
    }

    if (
      nextState.status === AudioPlayerStatus.Idle &&
      previousState.status !== AudioPlayerStatus.Idle &&
      !session.settling &&
      session.current
    ) {
      const completed = session.current.item
      session.current = undefined
      session.settling = true
      void this.completeAndAdvance(guildId, session, completed)
    }
  }

  private async handlePlayerError(
    guildId: string,
    session: PlaybackSession,
  ): Promise<void> {
    const current = session.current
    if (!current || session.settling) {
      return
    }

    session.settling = true
    session.current = undefined
    if (current.retries < 1) {
      session.settling = false
      await this.playItem(guildId, session, current.item, current.retries + 1)
      return
    }

    await this.failAndAdvance(guildId, session, current.item)
  }

  private async completeAndAdvance(
    guildId: string,
    session: PlaybackSession,
    item: QueueItem,
  ): Promise<void> {
    try {
      const result = await this.api.completePlayback({
        queueItemId: item.id,
        outcome: 'played',
      })
      void this.sendPlaybackEvent('playback.finished', guildId, item.id)
      session.settling = false
      if (result.nextItem) {
        await this.playItem(guildId, session, result.nextItem, 0)
      }
    } catch {
      session.settling = false
      this.logger.error({ guildId, queueItemId: item.id }, 'Playback completion sync failed')
    }
  }

  private async failAndAdvance(
    guildId: string,
    session: PlaybackSession,
    item: QueueItem,
  ): Promise<void> {
    session.settling = true
    session.current = undefined
    try {
      const result = await this.api.completePlayback({
        queueItemId: item.id,
        outcome: 'failed',
      })
      void this.sendPlaybackEvent('playback.failed', guildId, item.id)
      session.settling = false
      if (result.nextItem) {
        await this.playItem(guildId, session, result.nextItem, 0)
      }
    } catch {
      session.settling = false
      this.logger.error({ guildId, queueItemId: item.id }, 'Playback failure sync failed')
    }
  }

  private async sendPlaybackEvent(
    type: 'playback.started' | 'playback.finished' | 'playback.failed',
    guildId: string,
    queueItemId: string,
  ): Promise<void> {
    await this.api
      .sendEvent({
        type,
        occurredAt: new Date().toISOString(),
        guildId,
        payload: { queueItemId },
      })
      .catch(() => {
        this.logger.error({ guildId, queueItemId, eventType: type }, 'Playback event sync failed')
      })
  }
}
