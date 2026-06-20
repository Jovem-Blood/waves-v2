import { trackMetadataSchema } from '@waves/shared'
import { getQuery } from 'h3'
import { z } from 'zod'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1),
})

export function createSpotifySearchHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const { q } = searchQuerySchema.parse(getQuery(event))
    const tracks = await getDependencies().spotifyService.searchTracks(q)
    return z.array(trackMetadataSchema).parse(tracks)
  })
}

export default createSpotifySearchHandler()
