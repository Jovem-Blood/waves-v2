import type { z } from 'zod'

import type { botEventSchema, realtimeEventSchema } from '../schemas/events.schema.js'

export type BotEvent = z.infer<typeof botEventSchema>
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>
