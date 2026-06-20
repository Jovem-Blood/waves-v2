import { playerStateSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createPlayerGetHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(() =>
    playerStateSchema.parse(getDependencies().playerStateService.get()),
  )
}

export default createPlayerGetHandler()
