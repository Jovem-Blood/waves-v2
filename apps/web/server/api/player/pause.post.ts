import { playerStateSchema } from '@waves/shared'
import { definePublicApiHandler } from '../../utils/api-error'
import { usePublicApiDependencies } from '../../utils/public-api-dependencies'

export default definePublicApiHandler(() =>
  playerStateSchema.parse(usePublicApiDependencies().playerStateService.pause()),
)
