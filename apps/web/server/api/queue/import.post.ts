import { playlistInputSchema, playlistImportResultSchema } from '@waves/shared'
import { readBody } from 'h3'
import { definePublicApiHandler } from '../../utils/api-error'
import {
  usePublicApiDependencies,
  type PublicApiDependencies,
} from '../../utils/public-api-dependencies'
import { readSessionCookie, writeSessionCookie } from '../../utils/session-cookie'
import { UnauthorizedError } from '../../utils/internal-errors'

export function createPlaylistImportHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(async (event) => {
    const { url } = playlistInputSchema.parse(await readBody(event))
    const dependencies = getDependencies()
    const token = readSessionCookie(event)
    const session = dependencies.authService.getCurrentSession(token)
    if (!session) throw new UnauthorizedError()
    if (token && session.renewed) writeSessionCookie(event, token, { expiresAt: session.expiresAt })
    const playlist = await dependencies.spotifyService.getPlaylist(url, true)
    const result = dependencies.queueService.appendPlaylist(
      playlist.tracks,
      {
        requestedByUserId: session.user.id,
        requestedByDisplayName: session.user.displayName,
      },
      playlist.skipped,
    )
    await dependencies.autoplayOrchestrator.queueChanged().catch(() => undefined)
    return playlistImportResultSchema.parse(result)
  })
}

export default createPlaylistImportHandler()
