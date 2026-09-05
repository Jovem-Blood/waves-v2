import type { AutoplaySuggestion, QueueItem, TrackMetadata } from '@waves/shared'

interface AutoplayExclusionInput {
  active: readonly QueueItem[]
  recent: readonly QueueItem[]
  suggestions: readonly AutoplaySuggestion[]
  rejected: ReadonlySet<string>
  seeds: readonly TrackMetadata[]
}

export function buildAutoplayExcludedTrackIds(input: AutoplayExclusionInput): Set<string> {
  const excluded = new Set<string>()
  input.active.forEach((item) => excluded.add(item.track.providerTrackId))
  input.recent.forEach((item) => excluded.add(item.track.providerTrackId))
  input.suggestions.forEach((suggestion) => excluded.add(suggestion.track.providerTrackId))
  input.rejected.forEach((trackId) => excluded.add(trackId))
  input.seeds.forEach((track) => excluded.add(track.providerTrackId))
  return excluded
}
