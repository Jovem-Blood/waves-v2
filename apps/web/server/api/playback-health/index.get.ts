import { getQuery } from 'h3'
import { playbackHealthQuerySchema, playbackHealthResponseSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import { usePublicApiDependencies } from '../../utils/public-api-dependencies'

export default definePublicApiHandler((event) => {
  const query = playbackHealthQuerySchema.parse(getQuery(event))
  const service = usePublicApiDependencies().playbackHealthService
  if (!service) throw new Error('Playback health service is not configured')
  return playbackHealthResponseSchema.parse(service.get(query))
})
