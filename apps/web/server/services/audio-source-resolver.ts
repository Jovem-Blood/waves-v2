import type { ResolvedAudioSource, TrackMetadata } from '@waves/shared'

export interface AudioSourceResolver {
  resolve(track: TrackMetadata, options?: AudioSourceResolveOptions): Promise<ResolvedAudioSource>
}

export interface AudioSourceResolveOptions {
  preferredSource?: Pick<ResolvedAudioSource, 'sourceIdentifier'>
}
