import { z } from 'zod'

export const sourceErrorCodeSchema = z.enum([
  'SOURCE_NOT_FOUND',
  'SOURCE_UNAVAILABLE',
  'SOURCE_NO_PLAYABLE_FORMAT',
  'SOURCE_GEO_BLOCKED',
  'SOURCE_AUTH_REQUIRED',
  'SOURCE_RATE_LIMITED',
  'SOURCE_DNS_FAILED',
  'SOURCE_CONNECTION_RESET',
  'SOURCE_FETCH_TIMEOUT',
])
export type SourceErrorCode = z.infer<typeof sourceErrorCodeSchema>

/** Inspect only structured, allowlisted fields. Never expose provider messages or URLs. */
export function classifySourceFailure(
  error: unknown,
): { errorCode: SourceErrorCode; httpStatus?: number } | undefined {
  let current = error
  let fallback: { errorCode: SourceErrorCode; httpStatus?: number } | undefined
  const seen = new Set<unknown>()
  for (
    let depth = 0;
    depth < 8 && current && typeof current === 'object' && !seen.has(current);
    depth++
  ) {
    seen.add(current)
    const fields = current as Record<string, unknown>
    const status = fields.statusCode ?? fields.status
    const httpStatus =
      typeof status === 'number' && status >= 400 && status <= 599 ? status : undefined
    const code = sourceErrorCodeSchema.safeParse(fields.code)
    if (code.success) {
      const result = { errorCode: code.data, ...(httpStatus === undefined ? {} : { httpStatus }) }
      if (code.data !== 'SOURCE_NOT_FOUND' && code.data !== 'SOURCE_UNAVAILABLE') return result
      fallback ??= result
    }
    if (fields.code === 'ENOTFOUND' || fields.code === 'EAI_AGAIN')
      return { errorCode: 'SOURCE_DNS_FAILED' }
    if (fields.code === 'ECONNRESET' || fields.code === 'EPIPE' || fields.code === 'UND_ERR_SOCKET')
      return { errorCode: 'SOURCE_CONNECTION_RESET' }
    if (
      fields.code === 'ETIMEDOUT' ||
      fields.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      fields.name === 'TimeoutError'
    )
      return { errorCode: 'SOURCE_FETCH_TIMEOUT' }
    if (httpStatus === 429) return { errorCode: 'SOURCE_RATE_LIMITED', httpStatus }
    if (httpStatus === 401) return { errorCode: 'SOURCE_AUTH_REQUIRED', httpStatus }
    current = fields.cause
  }
  return fallback
}
