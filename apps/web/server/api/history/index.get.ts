import { historyPageSchema, historyQuerySchema } from '@waves/shared'
import { getQuery } from 'h3'

import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createHistoryListHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    const { cursor } = historyQuerySchema.parse(getQuery(event))
    return historyPageSchema.parse(getDependencies().historyService.list(cursor))
  })
}

export default createHistoryListHandler()
