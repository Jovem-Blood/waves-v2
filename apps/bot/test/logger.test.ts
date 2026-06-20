import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { createBotLogger } from '../src/logger.js'

function captureLogger(level: 'debug' | 'info') {
  const lines: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { lines, logger: createBotLogger(level, destination) }
}

describe('bot logger', () => {
  it('supports configurable debug logging', () => {
    const debug = captureLogger('debug')
    debug.logger.debug({ operation: 'test' }, 'debug enabled')
    expect(debug.lines.join('')).toContain('debug enabled')

    const info = captureLogger('info')
    info.logger.debug({ operation: 'test' }, 'debug disabled')
    expect(info.lines.join('')).not.toContain('debug disabled')
  })

  it('redacts sensitive fields at multiple nesting levels', () => {
    const { lines, logger } = captureLogger('info')
    logger.info(
      {
        streamUrl: 'https://media.example/audio?signature=secret',
        authorization: 'Bearer internal-token',
        nested: {
          headers: { Authorization: 'Bearer nested-token' },
          query: 'private user query',
          source: { streamUrl: 'https://nested.example/signed' },
        },
      },
      'safe log',
    )

    const output = lines.join('')
    expect(output).toContain('safe log')
    expect(output).not.toContain('media.example')
    expect(output).not.toContain('internal-token')
    expect(output).not.toContain('nested-token')
    expect(output).not.toContain('private user query')
    expect(output).not.toContain('nested.example')
  })
})
