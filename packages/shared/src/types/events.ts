import type { z } from 'zod'

import type { botEventSchema } from '../schemas/events.schema.js'

export type BotEvent = z.infer<typeof botEventSchema>
