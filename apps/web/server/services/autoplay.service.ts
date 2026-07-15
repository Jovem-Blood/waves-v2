import {
  updateAutoplayInputSchema,
  type AutoplayFailureCode,
  type AutoplayState,
  type UpdateAutoplayInput,
} from '@waves/shared'

import type { AutoplayRepository } from '../repositories/autoplay.repository'
import type { AutoplaySuggestionRepository } from '../repositories/autoplay-suggestion.repository'

export class AutoplayService {
  constructor(
    private readonly repository: AutoplayRepository,
    private readonly suggestions?: AutoplaySuggestionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): AutoplayState {
    const state = this.repository.get()
    return { ...state, suggestions: this.publicSuggestions() }
  }

  update(input: UpdateAutoplayInput): AutoplayState {
    const parsed = updateAutoplayInputSchema.parse(input)
    if (!parsed.enabled) this.suggestions?.clear()
    const state = this.repository.update({ enabled: parsed.enabled, failureCode: null })
    return { ...state, suggestions: this.publicSuggestions() }
  }

  recordFailure(failureCode: AutoplayFailureCode): AutoplayState {
    const state = this.repository.update({ failureCode })
    return { ...state, suggestions: this.publicSuggestions() }
  }

  clearFailure(): AutoplayState {
    const state = this.repository.update({ failureCode: null })
    return { ...state, suggestions: this.publicSuggestions() }
  }

  rejectSuggestion(providerTrackId: string): AutoplayState {
    if (this.suggestions?.removeByProviderTrackId(providerTrackId))
      this.suggestions.compactPositions()
    return this.get()
  }

  private publicSuggestions(): AutoplayState['suggestions'] {
    return (this.suggestions?.list() ?? []).map(
      ({ track, provider, generatedAt, seedFingerprint, strategy }) => ({
        track,
        provider,
        generatedAt,
        seedFingerprint,
        strategy,
      }),
    )
  }
}
