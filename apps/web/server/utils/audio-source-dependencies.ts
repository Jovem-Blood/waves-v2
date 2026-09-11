import { YouTubeMusicClient } from '../clients/youtube-music.client'
import { useDatabase } from '../db/client'
import { QueueRepository } from '../repositories/queue.repository'
import { ResolvedSourceRepository } from '../repositories/resolved-source.repository'
import { AudioSourceService } from '../services/audio-source/service'
import { YouTubeMusicAudioSourceResolver } from '../services/audio-source/youtube-music-resolver'

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
      new YouTubeMusicAudioSourceResolver(new YouTubeMusicClient()),
    ),
  }
  return runtimeDependencies
}
