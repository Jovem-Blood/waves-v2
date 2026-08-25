import { autoplayStateSchema } from '@waves/shared'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createAutoplayGetHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(() => {
    return autoplayStateSchema.parse(getDependencies().autoplayService.get())
  })
}

export default createAutoplayGetHandler()
