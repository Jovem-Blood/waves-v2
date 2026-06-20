import type {
  AddQueueItemInput,
  MoveQueueItemInput,
  PlayerState,
  QueueItem,
  TrackMetadata,
} from '@waves/shared'

import { SpotifyClient } from '../clients/spotify.client'
import { useDatabase } from '../db/client'
import { PlayerStateRepository } from '../repositories/player-state.repository'
import { QueueRepository } from '../repositories/queue.repository'
import { DatabaseUnitOfWork } from '../repositories/unit-of-work'
import type { SkipResult } from '../services/player-state.service'
import { PlayerStateService } from '../services/player-state.service'
import { QueueService } from '../services/queue.service'
import { SpotifyService } from '../services/spotify.service'
import { parseSpotifyConfig } from './spotify-config'

export interface PublicQueueService {
  list(): QueueItem[]
  add(input: AddQueueItemInput): QueueItem
  remove(id: string): QueueItem[]
  move(id: string, input: MoveQueueItemInput): QueueItem[]
}

export interface PublicPlayerStateService {
  get(): PlayerState
  skip(): SkipResult
  voiceConnected(guildId: string, voiceChannelId: string): PlayerState
  voiceDisconnected(guildId: string): PlayerState
  claimPlayback(): ReturnType<PlayerStateService['claimPlayback']>
  completePlayback(input: Parameters<PlayerStateService['completePlayback']>[0]): ReturnType<
    PlayerStateService['completePlayback']
  >
}

export interface PublicSpotifyService {
  searchTracks(query: string): Promise<TrackMetadata[]>
}

export interface PublicApiDependencies {
  playerStateService: PublicPlayerStateService
  queueService: PublicQueueService
  spotifyService: PublicSpotifyService
}

let runtimeDependencies: PublicApiDependencies | undefined

export function usePublicApiDependencies(): PublicApiDependencies {
  if (runtimeDependencies) {
    return runtimeDependencies
  }

  const db = useDatabase()
  const queueRepository = new QueueRepository(db)
  const playerStateRepository = new PlayerStateRepository(db)
  const unitOfWork = new DatabaseUnitOfWork(db)
  let spotifyService: SpotifyService | undefined

  runtimeDependencies = {
    queueService: new QueueService(queueRepository, unitOfWork),
    playerStateService: new PlayerStateService(playerStateRepository, unitOfWork),
    spotifyService: {
      searchTracks(query) {
        spotifyService ??= new SpotifyService(new SpotifyClient(parseSpotifyConfig()))
        return spotifyService.searchTracks(query)
      },
    },
  }

  return runtimeDependencies
}
