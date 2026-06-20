import { playerStateSchema, updatePlayerProgressInputSchema } from '@waves/shared'
import { readBody } from 'h3'
import { defineInternalApiHandler } from '../../../../utils/internal-auth'
import { usePublicApiDependencies } from '../../../../utils/public-api-dependencies'

export default defineInternalApiHandler(async (event) =>
  playerStateSchema.parse(
    usePublicApiDependencies().playerStateService.updateProgress(
      updatePlayerProgressInputSchema.parse(await readBody(event)),
    ),
  ),
)
