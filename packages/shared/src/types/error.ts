import type { z } from 'zod'

import type { apiErrorCodeSchema, apiErrorSchema } from '../schemas/error.schema.js'

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>
