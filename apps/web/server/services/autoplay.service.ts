import {
  updateAutoplayInputSchema,
  type AutoplayFailureCode,
  type AutoplayState,
  type UpdateAutoplayInput,
} from '@waves/shared'

import type { AutoplayRepository } from '../repositories/autoplay.repository'
import type { AutoplaySuggestionRepository } from '../repositories/autoplay-suggestion.repository'

const REJECTION_TTL_MS = 60 * 60 * 1000

export class AutoplayService {
  constructor(
    private readonly repository: AutoplayRepository,
    private readonly suggestions?: AutoplaySuggestionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): AutoplayState {
    const state = this.repository.get()
    return { ...state, suggestion: this.suggestions?.get() ?? null }
  }

  update(input: UpdateAutoplayInput): AutoplayState {
    const parsed = updateAutoplayInputSchema.parse(input)
    if (!parsed.enabled) this.suggestions?.clear()
    const state = this.repository.update({ enabled: parsed.enabled, failureCode: null })
    return { ...state, suggestion: this.suggestions?.get() ?? null }
  }

  recordFailure(failureCode: AutoplayFailureCode): AutoplayState {
    const state = this.repository.update({ failureCode })
    return { ...state, suggestion: this.suggestions?.get() ?? null }
  }

  clearFailure(): AutoplayState {
    const state = this.repository.update({ failureCode: null })
    return { ...state, suggestion: this.suggestions?.get() ?? null }
  }

  rejectSuggestion(): AutoplayState {
    const suggestion = this.suggestions?.get()
    if (suggestion && this.suggestions) {
      const createdAt = this.now()
      this.suggestions.reject(
        suggestion.track.providerTrackId,
        createdAt.toISOString(),
        new Date(createdAt.getTime() + REJECTION_TTL_MS).toISOString(),
      )
      this.suggestions.clear()
    }
    return this.get()
  }
}
