import { playlistInputSchema, playlistPreviewSchema } from '@waves/shared'
import { readBody } from 'h3'
import { definePublicApiHandler } from '../../utils/api-error'
import {
  usePublicApiDependencies,
  type PublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createPlaylistPreviewHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const { url } = playlistInputSchema.parse(await readBody(event))
    const result = await getDependencies().spotifyService.getPlaylist(url)
    return playlistPreviewSchema.parse(result.preview)
  })
}

export default createPlaylistPreviewHandler()
