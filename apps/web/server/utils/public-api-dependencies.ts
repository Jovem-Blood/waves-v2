import type {
  AddQueueItemInput,
  BotHeartbeatInput,
  MoveQueueItemInput,
  OperationalStatus,
  PlayerState,
  QueueItem,
  RemoveQueueItemResult,
  RestoreQueueItemResult,
  TrackMetadata,
} from '@waves/shared'

import { SpotifyClient } from '../clients/spotify.client'
import { useDatabase } from '../db/client'
import { PlayerStateRepository } from '../repositories/player-state.repository'
import { OperationalStatusRepository } from '../repositories/operational-status.repository'
import { QueueRepository } from '../repositories/queue.repository'
import { DatabaseUnitOfWork } from '../repositories/unit-of-work'
import type { SkipResult } from '../services/player-state.service'
import { PlayerStateService } from '../services/player-state.service'
import { OperationalStatusService } from '../services/operational-status.service'
import { QueueService } from '../services/queue.service'
import { SpotifyService } from '../services/spotify.service'
import { parseSpotifyConfig } from './spotify-config'

export interface PublicQueueService {
  list(): QueueItem[]
  add(input: AddQueueItemInput): QueueItem
  remove(id: string): RemoveQueueItemResult
  restore(id: string): RestoreQueueItemResult
  move(id: string, input: MoveQueueItemInput): QueueItem[]
}

export interface PublicOperationalStatusService {
  get(): OperationalStatus
  heartbeat(input: BotHeartbeatInput): OperationalStatus
  setVoiceStatus(status: 'connected' | 'disconnected' | 'reconnecting'): OperationalStatus
}

export interface PublicPlayerStateService {
  get(): PlayerState
  skip(): SkipResult
  pause(): PlayerState
  resume(): PlayerState
  setVolume(input: { volume: number }): PlayerState
  updateProgress(input: { queueItemId: string; progressMs: number }): PlayerState
  voiceConnected(
    guildId: string,
    guildName: string,
    voiceChannelId: string,
    voiceChannelName: string,
  ): PlayerState
  voiceDisconnected(guildId: string): PlayerState
  claimPlayback(): ReturnType<PlayerStateService['claimPlayback']>
  completePlayback(
    input: Parameters<PlayerStateService['completePlayback']>[0],
  ): ReturnType<PlayerStateService['completePlayback']>
}

export interface PublicSpotifyService {
  searchTracks(query: string): Promise<TrackMetadata[]>
}

export interface PublicApiDependencies {
  playerStateService: PublicPlayerStateService
  queueService: PublicQueueService
  spotifyService: PublicSpotifyService
  operationalStatusService: PublicOperationalStatusService
}

let runtimeDependencies: PublicApiDependencies | undefined

export function usePublicApiDependencies(): PublicApiDependencies {
  if (runtimeDependencies) {
    return runtimeDependencies
  }

  const db = useDatabase()
  const queueRepository = new QueueRepository(db)
  const playerStateRepository = new PlayerStateRepository(db)
  const operationalStatusRepository = new OperationalStatusRepository(db)
  const unitOfWork = new DatabaseUnitOfWork(db)
  let spotifyService: SpotifyService | undefined

  runtimeDependencies = {
    queueService: new QueueService(queueRepository, unitOfWork),
    playerStateService: new PlayerStateService(playerStateRepository, unitOfWork),
    operationalStatusService: new OperationalStatusService(
      operationalStatusRepository,
      playerStateRepository,
    ),
    spotifyService: {
      searchTracks(query) {
        spotifyService ??= new SpotifyService(new SpotifyClient(parseSpotifyConfig()))
        return spotifyService.searchTracks(query)
      },
    },
  }

  return runtimeDependencies
}
