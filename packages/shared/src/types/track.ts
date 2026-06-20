import type { z } from 'zod'

import type { trackMetadataSchema, trackProviderSchema } from '../schemas/track.schema.js'

export type TrackProvider = z.infer<typeof trackProviderSchema>
export type TrackMetadata = z.infer<typeof trackMetadataSchema>
