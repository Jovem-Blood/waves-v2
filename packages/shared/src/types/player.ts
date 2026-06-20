import type { z } from 'zod'

import type { playerStateSchema, playerStatusSchema } from '../schemas/player.schema.js'

export type PlayerStatus = z.infer<typeof playerStatusSchema>
export type PlayerState = z.infer<typeof playerStateSchema>
