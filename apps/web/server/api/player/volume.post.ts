import { playerStateSchema, setPlayerVolumeInputSchema } from '@waves/shared'
import { readBody } from 'h3'
import { definePublicApiHandler } from '../../utils/api-error'
import { usePublicApiDependencies } from '../../utils/public-api-dependencies'

export default definePublicApiHandler(async (event) =>
  playerStateSchema.parse(
    usePublicApiDependencies().playerStateService.setVolume(
      setPlayerVolumeInputSchema.parse(await readBody(event)),
    ),
  ),
)
