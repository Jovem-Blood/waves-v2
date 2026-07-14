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
  AutoplayState,
  HistoryPage,
  UpdateAutoplayInput,
  PlaybackTransitionResult,
  CompletePlaybackInput,
} from '@waves/shared'

import { SpotifyClient } from '../clients/spotify.client'
import { LastFmClient } from '../clients/lastfm.client'
import { YouTubeMusicClient } from '../clients/youtube-music.client'
import { AutoplayRepository } from '../repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../repositories/autoplay-suggestion.repository'
import { useDatabase } from '../db/client'
import { PlayerStateRepository } from '../repositories/player-state.repository'
import { OperationalStatusRepository } from '../repositories/operational-status.repository'
import { QueueRepository } from '../repositories/queue.repository'
import { DiscordLoginTokenRepository } from '../repositories/discord-login-token.repository'
import { SessionRepository } from '../repositories/session.repository'
import { DatabaseUnitOfWork } from '../repositories/unit-of-work'
import { UserRepository } from '../repositories/user.repository'
import type { AuthService } from '../services/auth.service'
import { AuthService as RuntimeAuthService } from '../services/auth.service'
import type { SkipResult } from '../services/player-state.service'
import { PlayerStateService } from '../services/player-state.service'
import { OperationalStatusService } from '../services/operational-status.service'
import { QueueService } from '../services/queue.service'
import { HistoryService } from '../services/history.service'
import { SpotifyService } from '../services/spotify.service'
import { AutoplayService } from '../services/autoplay.service'
import { AutoplayOrchestrator } from '../services/autoplay-orchestrator.service'
import { LastFmRecommendationProvider } from '../services/lastfm-recommendation.provider'
import { YouTubeMusicRecommendationProvider } from '../services/youtube-music-recommendation.provider'
import { SpotifyCandidateResolver } from '../services/spotify-candidate-resolver.service'
import { DualProviderRecommendationService } from '../services/dual-provider-recommendation.service'
import { parseLastFmConfig } from './lastfm-config'
import { parseSpotifyConfig } from './spotify-config'

export interface PublicQueueService {
  list(): QueueItem[]
  add(input: AddQueueItemInput): QueueItem
  remove(id: string): RemoveQueueItemResult
  restore(id: string): RestoreQueueItemResult
  move(id: string, input: MoveQueueItemInput): QueueItem[]
}

export interface PublicHistoryService {
  list(cursor?: string): HistoryPage
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

export interface PublicAutoplayService {
  get(): AutoplayState
  update(input: UpdateAutoplayInput): AutoplayState
  rejectSuggestion(providerTrackId: string): AutoplayState
}

export interface PublicAutoplayOrchestrator {
  completePlayback(input: CompletePlaybackInput): Promise<PlaybackTransitionResult>
  queueChanged(): Promise<void>
}

export interface PublicApiDependencies {
  playerStateService: PublicPlayerStateService
  queueService: PublicQueueService
  historyService: PublicHistoryService
  spotifyService: PublicSpotifyService
  operationalStatusService: PublicOperationalStatusService
  authService: AuthService
  autoplayService?: PublicAutoplayService
  autoplayOrchestrator?: PublicAutoplayOrchestrator
}

let runtimeDependencies: PublicApiDependencies | undefined

export function usePublicApiDependencies(): PublicApiDependencies {
  if (runtimeDependencies) {
    return runtimeDependencies
  }

  const db = useDatabase()
  const queueRepository = new QueueRepository(db)
  const userRepository = new UserRepository(db)
  const sessionRepository = new SessionRepository(db)
  const discordLoginTokenRepository = new DiscordLoginTokenRepository(db)
  const playerStateRepository = new PlayerStateRepository(db)
  const operationalStatusRepository = new OperationalStatusRepository(db)
  const autoplayRepository = new AutoplayRepository(db)
  const autoplaySuggestionRepository = new AutoplaySuggestionRepository(db)
  const unitOfWork = new DatabaseUnitOfWork(db)
  let spotifyService: SpotifyService | undefined
  let lastFmClient: LastFmClient | undefined
  const runtimeAutoplayService = new AutoplayService(
    autoplayRepository,
    autoplaySuggestionRepository,
  )
  const runtimeQueueService = new QueueService(queueRepository, unitOfWork)
  const runtimePlayerStateService = new PlayerStateService(playerStateRepository, unitOfWork)

  const getSpotifyService = () => {
    spotifyService ??= new SpotifyService(new SpotifyClient(parseSpotifyConfig()))
    return spotifyService
  }
  const getLastFmClient = () => {
    lastFmClient ??= new LastFmClient(parseLastFmConfig())
    return lastFmClient
  }
  const recommendationService = new DualProviderRecommendationService(
    [
      new LastFmRecommendationProvider({
        getSimilarTracks: async (seed, limit) => getLastFmClient().getSimilarTracks(seed, limit),
      }),
      new YouTubeMusicRecommendationProvider(new YouTubeMusicClient()),
    ],
    new SpotifyCandidateResolver({
      searchTracks: (query) => getSpotifyService().searchTracks(query),
    }),
  )

  runtimeDependencies = {
    queueService: runtimeQueueService,
    historyService: new HistoryService(queueRepository),
    playerStateService: runtimePlayerStateService,
    autoplayService: runtimeAutoplayService,
    autoplayOrchestrator: new AutoplayOrchestrator(
      runtimeAutoplayService,
      runtimeQueueService,
      queueRepository,
      autoplaySuggestionRepository,
      runtimePlayerStateService,
      recommendationService,
    ),
    operationalStatusService: new OperationalStatusService(
      operationalStatusRepository,
      playerStateRepository,
    ),
    authService: new RuntimeAuthService(
      userRepository,
      sessionRepository,
      discordLoginTokenRepository,
      queueRepository,
    ),
    spotifyService: {
      searchTracks(query) {
        return getSpotifyService().searchTracks(query)
      },
    },
  }

  return runtimeDependencies
}
