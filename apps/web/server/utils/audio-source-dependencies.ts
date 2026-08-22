import { AudiusClient } from '../clients/audius.client'
import { YouTubeMusicClient } from '../clients/youtube-music.client'
import { useDatabase } from '../db/client'
import { QueueRepository } from '../repositories/queue.repository'
import { ResolvedSourceRepository } from '../repositories/resolved-source.repository'
import { AudiusAudioSourceResolver } from '../services/audio-source-resolver'
import { AudioSourceService } from '../services/audio-source.service'
import { FallbackAudioSourceResolver } from '../services/fallback-audio-source-resolver'
import { YouTubeMusicAudioSourceResolver } from '../services/youtube-music-audio-source-resolver'

export interface InternalAudioSourceService {
  resolve(
    queueItemId: string,
    options?: { forceRefresh?: boolean; playbackAttemptId?: string; attempt?: number },
  ): ReturnType<AudioSourceService['resolve']>
}

export interface AudioSourceApiDependencies {
  audioSourceService: InternalAudioSourceService
}

let runtimeDependencies: AudioSourceApiDependencies | undefined

export function useAudioSourceApiDependencies(): AudioSourceApiDependencies {
  if (runtimeDependencies) {
    return runtimeDependencies
  }

  const db = useDatabase()
  runtimeDependencies = {
    audioSourceService: new AudioSourceService(
      new QueueRepository(db),
      new ResolvedSourceRepository(db),
      new FallbackAudioSourceResolver(
        new YouTubeMusicAudioSourceResolver(new YouTubeMusicClient()),
        new AudiusAudioSourceResolver(new AudiusClient()),
      ),
    ),
  }
  return runtimeDependencies
}
