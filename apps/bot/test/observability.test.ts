import { describe, expect, it } from 'vitest'

import { WavesApiError } from '../src/api/waves-api.errors.js'
import { classifyPlaybackError, playbackFailureStage } from '../src/observability.js'

describe('playback observability', () => {
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
