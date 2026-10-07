import type { z } from 'zod'

import type {
  playerStateSchema,
  playerStatusSchema,
  setPlayerCrossfadeInputSchema,
  setPlayerVolumeInputSchema,
  updatePlayerProgressInputSchema,
} from '../schemas/player.schema.js'

export type PlayerStatus = z.infer<typeof playerStatusSchema>
export type PlayerState = z.infer<typeof playerStateSchema>
export type SetPlayerCrossfadeInput = z.infer<typeof setPlayerCrossfadeInputSchema>
export type SetPlayerVolumeInput = z.infer<typeof setPlayerVolumeInputSchema>
export type UpdatePlayerProgressInput = z.infer<typeof updatePlayerProgressInputSchema>
