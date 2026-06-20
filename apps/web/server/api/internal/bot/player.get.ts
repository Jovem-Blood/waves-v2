import { playerStateSchema } from '@waves/shared'
import { defineInternalApiHandler } from '../../../utils/internal-auth'
import { usePublicApiDependencies } from '../../../utils/public-api-dependencies'

export default defineInternalApiHandler(() =>
  playerStateSchema.parse(usePublicApiDependencies().playerStateService.get()),
)
