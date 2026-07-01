import { describe, expect, it } from 'vitest'

import { classifyExternalError } from '../../server/utils/observability'

describe('classifyExternalError', () => {
  it('includes safe cause metadata without exposing messages', () => {
    const cause = Object.assign(new Error('signed-url-must-not-be-logged'), {
      code: 'EACCES',
    })
    const error = new Error('wrapper', { cause })
    error.name = 'ProviderUnavailableError'

    expect(classifyExternalError(error)).toEqual({
      errorCode: 'ProviderUnavailableError',
      causeCode: 'EACCES',
      causeName: 'Error',
    })
  })
})
