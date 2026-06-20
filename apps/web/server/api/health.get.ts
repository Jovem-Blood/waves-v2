import { defineEventHandler } from 'h3'

export const healthHandler = defineEventHandler(() => ({
  ok: true,
}))

export default healthHandler
