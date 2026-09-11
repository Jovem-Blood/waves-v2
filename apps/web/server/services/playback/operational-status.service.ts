import {
  botHeartbeatInputSchema,
  operationalStatusSchema,
  type BotHeartbeatInput,
  type OperationalStatus,
  type PlayerState,
  type VoiceOperationalStatus,
} from '@waves/shared'

import type { OperationalStatusRepository } from '../../repositories/operational-status.repository'
import type { PlayerStateRepository } from '../../repositories/player-state.repository'
import type { RealtimePublisher } from '../../utils/realtime-events'

const BOT_OFFLINE_AFTER_MS = 15_000
const noopPublish: RealtimePublisher = (event) => ({ id: '0', event })

export class OperationalStatusService {
  constructor(
    private readonly operationalRepository: OperationalStatusRepository,
    private readonly playerRepository: PlayerStateRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly publishRealtime: RealtimePublisher = noopPublish,
    private readonly reconcilePlayback: (heartbeat: BotHeartbeatInput) => void = () => {},
  ) {}

  get(): OperationalStatus {
    const now = this.now()
    const operational = this.operationalRepository.get()
    const player = this.playerRepository.get()
    const lastSeenAt = operational.botLastSeenAt
    const online =
      lastSeenAt !== undefined &&
      now.getTime() - new Date(lastSeenAt).getTime() <= BOT_OFFLINE_AFTER_MS

    return operationalStatusSchema.parse({
      web: { status: 'available', checkedAt: now.toISOString() },
      bot: {
        status: online ? 'online' : 'offline',
        ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
      },
      voice: this.voiceStatus(online, operational.voiceStatus, player),
    })
  }

  heartbeat(input: BotHeartbeatInput): OperationalStatus {
    const parsed = botHeartbeatInputSchema.parse(input)
    this.reconcilePlayback(parsed)
    this.operationalRepository.update({
      botLastSeenAt: parsed.occurredAt,
      updatedAt: this.now().toISOString(),
    })
    const status = this.get()
    this.publishRealtime({ type: 'status.changed', status })
    return status
  }

  setVoiceStatus(status: VoiceOperationalStatus): OperationalStatus {
    this.operationalRepository.update({
      voiceStatus: status,
      updatedAt: this.now().toISOString(),
    })
    const next = this.get()
    this.publishRealtime({ type: 'status.changed', status: next })
    return next
  }

  private voiceStatus(
    botOnline: boolean,
    status: VoiceOperationalStatus,
    player: PlayerState,
  ): OperationalStatus['voice'] {
    if (!botOnline || status === 'disconnected') return { status: 'disconnected' }
    if (status === 'reconnecting') return { status: 'reconnecting' }
    if (!player.guildName || !player.voiceChannelName) return { status: 'disconnected' }
    return {
      status: 'connected',
      guildName: player.guildName,
      voiceChannelName: player.voiceChannelName,
    }
  }
}
