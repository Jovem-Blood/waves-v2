import { describe, expect, it } from 'vitest'

import {
  ExternalHttpConfigurationError,
  parseExternalHttpTimeout,
} from '../../server/utils/external-http-config'

describe('external HTTP configuration', () => {
  it('defaults to ten seconds and accepts bounded integer values', () => {
    expect(parseExternalHttpTimeout({})).toBe(10_000)
    expect(parseExternalHttpTimeout({ EXTERNAL_HTTP_TIMEOUT_MS: '2500' })).toBe(2_500)
  })

  it.each(['999', '60001', 'not-a-number', '1.5'])(
    'rejects unsafe timeout value %s without echoing it',
    (value) => {
      const read = () => parseExternalHttpTimeout({ EXTERNAL_HTTP_TIMEOUT_MS: value })
      expect(read).toThrow(ExternalHttpConfigurationError)
      expect(read).not.toThrow(value)
    },
  )
})
