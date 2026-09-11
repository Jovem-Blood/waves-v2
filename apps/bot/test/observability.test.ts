import { describe, expect, it } from 'vitest'

import { WavesApiError } from '../src/api/waves-api.errors.js'
import {
  classifyPlaybackError,
  playbackFailureStage,
  playbackFailureClass,
  SafePlaybackError,
} from '../src/observability.js'

describe('playback observability', () => {
  it.each([
    ['SOURCE_DNS_FAILED', 'network'],
    ['SOURCE_RATE_LIMITED', 'provider'],
    ['SOURCE_NOT_FOUND', 'content'],
    ['DEMUX_PROBE_FAILED', 'media'],
    ['PLAYER_ERROR', 'player'],
    ['PLAYBACK_SYNC_FAILED', 'sync'],
    ['SOURCE_FETCH_CANCELLED', 'intentional'],
    ['UNKNOWN', 'internal'],
  ] as const)('classifies %s as %s', (code, expected) => {
    expect(playbackFailureClass(classifyPlaybackError(new SafePlaybackError(code)).errorCode)).toBe(
      expected,
    )
  })
  it('preserves source resolution API errors', () => {
    const error = classifyPlaybackError(new WavesApiError('SOURCE_NOT_FOUND', 404))

    expect(error).toEqual({ errorCode: 'SOURCE_NOT_FOUND', httpStatus: 404 })
    expect(playbackFailureStage(error.errorCode)).toBe('resolve')
  })

  it('keeps unrelated API errors generic', () => {
    expect(classifyPlaybackError(new WavesApiError('INTERNAL_ERROR', 500))).toEqual({
      errorCode: 'API_ERROR',
      httpStatus: 500,
    })
  })
})
