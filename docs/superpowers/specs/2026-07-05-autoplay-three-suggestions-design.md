# Autoplay Three Suggestions Design

## Context

Autoplay currently stores and renders a single ghost suggestion. When the queue reaches the end, that suggestion can be promoted into playback. The next iteration should show three autoplay suggestions, avoid recommending songs that already played recently, and allow replacing only one rejected suggestion.

The UI must preserve the existing Queue Social direction from `DESIGN.md` and `pencil.pen`: the queue remains the primary operational area, mobile stays single-column, and autoplay suggestions remain visually quieter than committed queue items.

## Goals

- Display up to three ordered autoplay suggestions after the real queue rows.
- Never suggest tracks that were already played recently.
- Suggested songs should also trigger another suggestion, this way, the player will never run out of songs.
- Promote the first visible suggestion automatically when the real queue ends.
- Keep the remaining visible suggestions after promotion and backfill to three.
- Rejecting one suggestion removes and replaces only that suggestion.
- Keep the change backend-first and avoid adding a user-facing history screen in this scope.

## Non-Goals

- No full playback history UI.
- No new music provider or recommendation provider.
- No change to bot ownership boundaries: Nuxt remains the source of truth; the bot only consumes internal API state.
- No visual redesign of the queue beyond showing multiple existing-style ghost rows.

## Phase 1: History And Exclusion Foundation

Before changing suggestion count, add a small autoplay exclusion layer. This layer centralizes track IDs that autoplay must not recommend.

The exclusion set should include:

- Recently played queue items from `queueRepository.listRecentPlayed(...)`.
- Active queue items, including the currently playing track.
- Visible autoplay suggestions already stored.
- Rejected autoplay suggestions that have not expired.
- Any current seed track used to request recommendations.

This should be a backend/service helper, not a UI feature. It should make the rule “do not suggest songs that were already playing” explicit and testable.

The initial recent-history window is the current `20` recent played items. Name this value clearly so it can be tuned later.

## Phase 2: Persist Three Suggestions

Change persisted autoplay suggestions from a singleton to an ordered list of up to three suggestions.

Expected persistence model:

- Add an integer `position` to stored suggestions.
- Store positions `0`, `1`, and `2`.
- Preserve a unique constraint that prevents duplicate visible suggestion tracks.
- Preserve enough metadata to render without another Spotify lookup.

Shared API state should expose:

- `autoplay.suggestions`: ordered array of `AutoplaySuggestion`.
- Replace the old single `suggestion` field with `suggestions`. Internal code and UI should migrate to the array shape in the same implementation.

## Phase 3: Generation Behavior

Autoplay generation should fill missing suggestion slots until there are three visible suggestions or no valid candidates remain.

Generation rules:

- Use current seeds from the active track and recent played tracks.
- Ask the recommendation provider for candidates using the centralized exclusion set.
- Skip candidates that are excluded, active, already visible, rejected, or recently played.
- Persist candidates in order until three slots are filled.
- If no candidates can fill a missing slot, record `no_candidates` without clearing valid existing suggestions.

If autoplay is disabled, clear all visible suggestions.

If the active queue has more than one real item, existing suggestions may remain only when still valid for the current seed context; stale or conflicting suggestions should be cleared.

## Phase 4: Promotion Behavior

When playback completes and there is no real queued next item:

- Promote suggestion at position `0` into a real queue item with `requestedByDisplayName: 'Autoplay'` and `status: 'playing'`.
- Remove only that promoted suggestion.
- Shift remaining suggestions forward, preserving their relative order.
- Backfill missing suggestions until there are three visible suggestions again.

If there is no valid suggestion to promote, keep the current idle behavior and record the appropriate autoplay failure code.

If a human track is added while recommendation generation is in flight, the human queue item remains preferred over autoplay promotion.

## Phase 5: Rejection Behavior

Each visible suggestion row has its own reject action.

Rejecting a suggestion should:

- Record only that track in autoplay rejections.
- Remove only that suggestion row.
- Shift later suggestions forward.
- Backfill one replacement when possible.
- Leave other visible suggestions unchanged.

The public reject API should identify the target suggestion by `providerTrackId`. Track ID is safer than position because positions can shift between polling intervals.

## UI Design

Mobile and desktop should render up to three `AutoplaySuggestionRow` rows after committed queue rows.

Visual treatment:

- Reuse the current violet/sparkles ghost-row style.
- Keep opacity lower than real queue rows so suggestions do not look committed.
- Keep each row labelled `Sugestão do autoplay`.
- Each row has an individual reject button.

Accessibility:

- Each reject button label remains specific: `Rejeitar sugestão <title>`.
- Queue updates stay inside the existing `aria-live="polite"` region.
- Buttons support disabled/loading states when a suggestion is being rejected.

Loading state:

- If one suggestion is being rejected, only that row should show rejecting/loading if practical.
- If implementation cost is high, a shared rejecting disabled state is acceptable for the first pass, but the target row must still be removed/replaced correctly.

## Data Flow

1. Queue changes or playback completes.
2. Autoplay orchestrator asks the exclusion helper for unavailable track IDs.
3. Recommendation provider returns candidates.
4. Orchestrator persists enough valid suggestions to reach three.
5. Public autoplay state returns the ordered suggestions array.
6. Queue UI renders ghost rows after real queue rows.
7. Rejecting one suggestion calls the API with that suggestion's track ID.
8. Backend rejects/removes that one suggestion and backfills if possible.

## Error Handling

- Provider unavailable: preserve valid existing suggestions and record `recommendation_unavailable`.
- Metadata unavailable: preserve valid existing suggestions and record `metadata_unavailable`.
- No valid candidates: preserve valid existing suggestions and record `no_candidates`.
- Rejection target not found: treat as idempotent success if the suggestion is already gone.
- Autoplay disabled: clear all suggestions and do not generate replacements.

## Testing Plan

Backend tests:

- Exclusion helper includes recent played, active queue, visible suggestions, rejected suggestions, and seed tracks.
- Recently played tracks are not persisted as suggestions.
- Generation persists up to three ordered suggestions.
- Existing valid suggestions are preserved while missing slots are backfilled.
- Completing the final real queue item promotes the first suggestion, preserves the next two, and backfills to three.
- Rejecting one suggestion removes only that suggestion, records only that track as rejected, and backfills one replacement.
- Human queued tracks remain preferred over autoplay promotion.

Shared schema/API tests:

- `AutoplayState` validates an ordered `suggestions` array.
- Reject endpoint accepts a target suggestion track ID and remains idempotent when the target is absent.

Component tests:

- Queue panel renders three autoplay ghost rows after queue rows.
- Rejecting the second suggestion emits the correct target.
- Empty, loading, and failure messages remain accessible.

Verification commands:

- `mise exec node@25.5.0 -- pnpm --filter @waves/shared build`
- `mise exec node@25.5.0 -- pnpm --filter web test test/services/autoplay-orchestrator.service.test.ts`
- `mise exec node@25.5.0 -- pnpm --filter web test test/components/queue-social.test.ts`
- `mise exec node@25.5.0 -- pnpm --filter web typecheck`

Do not stop or restart Docker during implementation unless explicitly approved.
