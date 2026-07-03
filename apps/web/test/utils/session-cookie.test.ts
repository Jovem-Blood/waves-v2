import { describe, expect, it } from 'vitest'

import { shouldUseSecureSessionCookie } from '../../server/utils/session-cookie'

describe('session cookie options', () => {
  it('allows Docker HTTP deployments to disable secure cookies explicitly', () => {
    expect(
      shouldUseSecureSessionCookie({
        NODE_ENV: 'production',
        SESSION_COOKIE_SECURE: 'false',
      }),
    ).toBe(false)
  })

  it('keeps secure cookies enabled by default in production', () => {
    expect(shouldUseSecureSessionCookie({ NODE_ENV: 'production' })).toBe(true)
  })
})
