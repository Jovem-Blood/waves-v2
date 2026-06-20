import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import {
  createWebLogger,
  parseWebLogLevel,
  WebLoggerConfigurationError,
} from '../../server/utils/logger'

function captureLogger(level: 'debug' | 'info') {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { lines, logger: createWebLogger(level, destination) }
}

describe('web logger', () => {
  it('uses development and production defaults and rejects invalid values safely', () => {
    expect(parseWebLogLevel({ NODE_ENV: 'development' })).toBe('debug')
    expect(parseWebLogLevel({ NODE_ENV: 'production' })).toBe('info')
    expect(() => parseWebLogLevel({ LOG_LEVEL: 'secret-invalid-value' })).toThrow(
      WebLoggerConfigurationError,
    )
    expect(() => parseWebLogLevel({ LOG_LEVEL: 'secret-invalid-value' })).not.toThrow(
      /secret-invalid-value/,
    )
  })

  it('redacts source URLs, credentials, payloads and nested external data', () => {
    const { lines, logger } = captureLogger('debug')
    logger.debug(
      {
        streamUrl: 'https://media.example/audio?signature=secret',
        token: 'private-token',
        payload: { visitorData: 'visitor-secret' },
        nested: {
          headers: { Authorization: 'Bearer nested-token' },
          query: 'private query',
          source: { streamUrl: 'https://nested.example/signed' },
        },
      },
      'safe web log',
    )

    const output = lines.join('')
    expect(output).toContain('safe web log')
    expect(output).not.toContain('media.example')
    expect(output).not.toContain('private-token')
    expect(output).not.toContain('visitor-secret')
    expect(output).not.toContain('nested-token')
    expect(output).not.toContain('private query')
    expect(output).not.toContain('nested.example')
  })
})
