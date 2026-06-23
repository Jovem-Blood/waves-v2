import type { z } from 'zod'

import type {
  botHeartbeatInputSchema,
  operationalStatusSchema,
  voiceOperationalStatusSchema,
} from '../schemas/operational-status.schema.js'

export type BotHeartbeatInput = z.infer<typeof botHeartbeatInputSchema>
export type OperationalStatus = z.infer<typeof operationalStatusSchema>
export type VoiceOperationalStatus = z.infer<typeof voiceOperationalStatusSchema>
