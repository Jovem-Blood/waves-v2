import { describe, expect, it } from 'vitest'
import { classifySourceFailure } from '../src/playback-diagnostics.js'

describe('safe source diagnostics', () => {
  it.each([
    [{ code: 'ENOTFOUND' }, 'SOURCE_DNS_FAILED'],
    [{ code: 'ECONNRESET' }, 'SOURCE_CONNECTION_RESET'],
    [{ statusCode: 429 }, 'SOURCE_RATE_LIMITED'],
    [{ status: 401 }, 'SOURCE_AUTH_REQUIRED'],
    [{ code: 'SOURCE_NO_PLAYABLE_FORMAT' }, 'SOURCE_NO_PLAYABLE_FORMAT'],
    [{ code: 'SOURCE_GEO_BLOCKED' }, 'SOURCE_GEO_BLOCKED'],
    [{ code: 'ETIMEDOUT' }, 'SOURCE_FETCH_TIMEOUT'],
  ])('preserves structured diagnostics through provider wrappers', (cause, errorCode) => {
    expect(
      classifySourceFailure(
        Object.assign(new Error('private signed URL'), { code: 'SOURCE_UNAVAILABLE', cause }),
      ),
    ).toMatchObject({ errorCode })
  })
  it('does not infer geography/auth from ambiguous HTTP 403 or arbitrary messages', () => {
    expect(classifySourceFailure({ status: 403, message: 'geo blocked secret' })).toBeUndefined()
  })
  it('terminates on cycles', () => {
    const error: { cause?: unknown } = {}
    error.cause = error
    expect(classifySourceFailure(error)).toBeUndefined()
  })
})
