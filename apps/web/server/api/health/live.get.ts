import { defineEventHandler } from 'h3'

export const liveHealthHandler = defineEventHandler(() => ({
  ok: true,
}))

export default liveHealthHandler
