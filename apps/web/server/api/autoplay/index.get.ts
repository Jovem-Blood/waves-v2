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
    const service = getDependencies().autoplayService
    if (!service) throw new Error('Autoplay service is unavailable')
    return autoplayStateSchema.parse(service.get())
  })
}

export default createAutoplayGetHandler()
