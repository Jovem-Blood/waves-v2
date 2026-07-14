# History Page Design

## Goal

Add `/hist`, a mobile-first, infinitely scrollable history of completed playback
activity. It shows songs that finished, failed, or were skipped, who requested
them, and when their terminal status was recorded.

## Data and API

- History is derived from `queue_items`; no new history table is needed.
- Include the terminal statuses `played`, `failed`, and `skipped`.
- Sort newest first by `updatedAt`, then by `id` as a stable tie-breaker.
- Expose a cursor-paginated public API endpoint. Its response contains a bounded
  list of queue items and an optional cursor for the next older page.
- The cursor encodes the last item’s `updatedAt` and `id`. The next query selects
  items older than that pair, preventing duplicates or gaps while playback adds
  newer entries.
- Existing queue item requester metadata is reused. A terminal item that has no
  requester, including autoplay entries, is rendered as `Waves-Bot` without
  altering persisted queue data.

## Page Experience

- Add a visible navigation link from the dashboard to `/hist` and a return link
  from the history page.
- The page title is `Histórico`; the subtitle explains it contains playback
  activity from the room.
- Mobile uses compact Queue Social cards: cover art, title, artists, requester,
  duration, terminal status, and a localized timestamp derived from `updatedAt`.
- Desktop follows the established operational table language with track,
  requester, duration, outcome, and completion columns.
- `played` items use the ordinary surface and positive status treatment.
- `failed` and `skipped` items are visually muted with reduced artwork and row
  emphasis, while retaining readable text and an explicit status label. Failed
  items additionally use the restrained error palette.
- Loading the next page is announced politely. Initial loading, empty history,
  pagination failure, and end-of-history states are explicit.
- An intersection observer sentinel loads the next page automatically. It must
  not issue concurrent requests and must stop when no next cursor is returned.

## Boundaries

- The Nuxt server remains the source of truth and owns filtering and pagination.
- Shared Zod schemas define the history response and cursor contract.
- Repository code performs the terminal-status query; service code validates and
  applies pagination; the API route remains thin.
- The client composable owns page accumulation, loading states, and observer-safe
  pagination. The page and presentation components do not query the API directly.

## Tests

- Repository tests cover terminal-status filtering, descending stable ordering,
  and cursor boundaries.
- Service/API tests cover validated responses and traversal without duplicate or
  missing entries.
- Component tests cover requester fallback to `Waves-Bot`, muted failed/skipped
  presentation, and loading/empty/error/end states.
- Client tests cover one request per sentinel trigger while a request is pending
  and no request after the final page.
