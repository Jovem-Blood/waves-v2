import { describe, expect, it } from 'vitest'

import {
  InternalApiConfigurationError,
  parseInternalApiConfig,
} from '../../server/utils/internal-api-config'

describe('parseInternalApiConfig', () => {
  it('accepts a non-empty internal API token', () => {
    expect(parseInternalApiConfig({ INTERNAL_API_TOKEN: 'internal-token' })).toEqual({
      token: 'internal-token',
    })
  })

  it('rejects missing tokens without exposing values', () => {
    expect(() => parseInternalApiConfig({})).toThrow(InternalApiConfigurationError)

    let error: unknown
    try {
      parseInternalApiConfig({ INTERNAL_API_TOKEN: '   ' })
    } catch (caught) {
      error = caught
    }

    expect(String(error)).toContain('BOT_INTERNAL_SECRET')
    expect(String(error)).not.toContain('internal-token')
  })
})
