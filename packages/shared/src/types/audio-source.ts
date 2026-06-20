import type { z } from 'zod'

import type {
  audioSourceProviderSchema,
  queueItemAudioSourceSchema,
  resolvedAudioSourceSchema,
} from '../schemas/audio-source.schema.js'

export type AudioSourceProvider = z.infer<typeof audioSourceProviderSchema>
export type ResolvedAudioSource = z.infer<typeof resolvedAudioSourceSchema>
export type QueueItemAudioSource = z.infer<typeof queueItemAudioSourceSchema>
