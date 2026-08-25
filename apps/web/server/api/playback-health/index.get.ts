import { getQuery } from 'h3'
import { playbackHealthQuerySchema, playbackHealthResponseSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import { usePublicApiDependencies } from '../../utils/public-api-dependencies'

export default definePublicApiHandler((event) => {
  const query = playbackHealthQuerySchema.parse(getQuery(event))
  return playbackHealthResponseSchema.parse(
    usePublicApiDependencies().playbackHealthService.get(query),
  )
})
