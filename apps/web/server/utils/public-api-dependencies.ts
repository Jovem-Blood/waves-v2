import { SpotifyClient } from '../clients/spotify.client'
import { LastFmClient } from '../clients/lastfm.client'
import { YouTubeMusicClient } from '../clients/youtube-music.client'
import { AutoplayRepository } from '../repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../repositories/autoplay-suggestion.repository'
import { AutoplayCandidateRepository } from '../repositories/autoplay-candidate.repository'
import { PlaybackAttemptRepository } from '../repositories/playback-attempt.repository'
import { useDatabase } from '../db/client'
import { PlayerStateRepository } from '../repositories/player-state.repository'
import { OperationalStatusRepository } from '../repositories/operational-status.repository'
import { QueueRepository } from '../repositories/queue.repository'
import { DiscordLoginTokenRepository } from '../repositories/discord-login-token.repository'
import { SessionRepository } from '../repositories/session.repository'
import { DatabaseUnitOfWork } from '../repositories/unit-of-work'
import { UserRepository } from '../repositories/user.repository'
import { AuthService } from '../services/auth.service'
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
import { PlaybackHealthService } from '../services/playback-health.service'
import { parseLastFmConfig } from './lastfm-config'
import { parseSpotifyConfig } from './spotify-config'
import { getRealtimeEventBus } from './realtime-events'

type PublicQueueService = Pick<QueueService, 'list' | 'add' | 'remove' | 'restore' | 'move'>
type PublicHistoryService = Pick<HistoryService, 'list'>
type PublicPlaybackHealthService = Pick<PlaybackHealthService, 'get'>
export type PublicOperationalStatusService = Pick<
  OperationalStatusService,
  'get' | 'heartbeat' | 'setVoiceStatus'
>
export type PublicPlayerStateService = Pick<
  PlayerStateService,
  | 'get'
  | 'skip'
  | 'pause'
  | 'resume'
  | 'setVolume'
  | 'updateProgress'
  | 'voiceConnected'
  | 'voiceDisconnected'
  | 'claimPlayback'
  | 'completePlayback'
  | 'reportPlaybackAttempt'
>
export type PublicSpotifyService = Pick<SpotifyService, 'searchTracks'>
type PublicAutoplayService = Pick<AutoplayService, 'get' | 'update'>
export type PublicAutoplayOrchestrator = Pick<
  AutoplayOrchestrator,
  'completePlayback' | 'queueChanged' | 'skip' | 'rejectSuggestion' | 'voiceDisconnected'
>

export interface PublicApiDependencies {
  playerStateService: PublicPlayerStateService
  queueService: PublicQueueService
  historyService: PublicHistoryService
  playbackHealthService: PublicPlaybackHealthService
  spotifyService: PublicSpotifyService
  operationalStatusService: PublicOperationalStatusService
  authService: AuthService
  autoplayService: PublicAutoplayService
  autoplayOrchestrator: PublicAutoplayOrchestrator
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
  const autoplayCandidateRepository = new AutoplayCandidateRepository(db)
  const playbackAttemptRepository = new PlaybackAttemptRepository(db)
  const unitOfWork = new DatabaseUnitOfWork(db)
  const publishRealtime = getRealtimeEventBus().publish
  let spotifyService: SpotifyService | undefined
  let lastFmClient: LastFmClient | undefined
  const runtimeAutoplayService = new AutoplayService(
    autoplayRepository,
    autoplaySuggestionRepository,
  )
  const runtimeQueueService = new QueueService(
    queueRepository,
    unitOfWork,
    undefined,
    undefined,
    publishRealtime,
  )
  const runtimePlayerStateService = new PlayerStateService(
    playerStateRepository,
    unitOfWork,
    undefined,
    undefined,
    undefined,
    publishRealtime,
  )

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
        getArtistInfo: async (artist) => getLastFmClient().getArtistInfo(artist),
        getArtistTopTracks: async (artist, limit) =>
          getLastFmClient().getArtistTopTracks(artist, limit),
        getSimilarTags: async (tag) => getLastFmClient().getSimilarTags(tag),
        getTagTopTracks: async (tag, limit) => getLastFmClient().getTagTopTracks(tag, limit),
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
    playbackHealthService: new PlaybackHealthService(playbackAttemptRepository),
    playerStateService: runtimePlayerStateService,
    autoplayService: runtimeAutoplayService,
    autoplayOrchestrator: new AutoplayOrchestrator(
      runtimeAutoplayService,
      runtimeQueueService,
      queueRepository,
      autoplaySuggestionRepository,
      autoplayCandidateRepository,
      runtimePlayerStateService,
      recommendationService,
    ),
    operationalStatusService: new OperationalStatusService(
      operationalStatusRepository,
      playerStateRepository,
      undefined,
      publishRealtime,
    ),
    authService: new AuthService(
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
