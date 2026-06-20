import { AudiusClient } from '../clients/audius.client'
import { useDatabase } from '../db/client'
import { QueueRepository } from '../repositories/queue.repository'
import { ResolvedSourceRepository } from '../repositories/resolved-source.repository'
import { AudiusAudioSourceResolver } from '../services/audio-source-resolver'
import { AudioSourceService } from '../services/audio-source.service'

export interface InternalAudioSourceService {
  resolve(
    queueItemId: string,
    options?: { forceRefresh?: boolean },
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
      new AudiusAudioSourceResolver(new AudiusClient()),
    ),
  }
  return runtimeDependencies
}
