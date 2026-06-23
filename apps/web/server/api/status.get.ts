import { operationalStatusSchema } from '@waves/shared'

import { definePublicApiHandler } from '../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../utils/public-api-dependencies'

export function createOperationalStatusHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler(() =>
    operationalStatusSchema.parse(getDependencies().operationalStatusService.get()),
  )
}

export default createOperationalStatusHandler()
