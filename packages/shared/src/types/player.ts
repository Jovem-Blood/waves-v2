import type { z } from 'zod'

import type {
  playerStateSchema,
  playerStatusSchema,
  setPlayerVolumeInputSchema,
  updatePlayerProgressInputSchema,
} from '../schemas/player.schema.js'

export type PlayerStatus = z.infer<typeof playerStatusSchema>
export type PlayerState = z.infer<typeof playerStateSchema>
export type SetPlayerVolumeInput = z.infer<typeof setPlayerVolumeInputSchema>
export type UpdatePlayerProgressInput = z.infer<typeof updatePlayerProgressInputSchema>
