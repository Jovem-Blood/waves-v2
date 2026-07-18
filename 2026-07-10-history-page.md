# History Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/hist`, a cursor-paginated, infinitely scrollable playback history for played, skipped, and failed songs.

**Architecture:** Terminal `queue_items` remain the sole history store. A dedicated history repository and service produce a stable `(updatedAt, id)` cursor page through a thin public API route. A page-scoped composable accumulates validated pages, while focused presentation components render responsive Queue Social cards and a desktop table.

**Tech Stack:** Nuxt 4 file-based pages, Vue 3 Composition API, TypeScript, Zod 4, Drizzle ORM with SQLite, Vitest, Vue Test Utils, Lucide Vue.

---

## File Structure

- Modify: `packages/shared/src/schemas/queue.schema.ts` to define the history cursor, page response, and query contracts.
- Modify: `packages/shared/src/types/queue.ts` and `packages/shared/src/index.ts` to export history types and schemas.
- Modify: `packages/shared/test/contracts.test.ts` to validate new shared contracts.
- Modify: `apps/web/server/repositories/queue.repository.ts` to query terminal queue items with cursor pagination.
- Create: `apps/web/server/services/history.service.ts` to apply the fixed page size and derive the next cursor.
- Modify: `apps/web/server/utils/public-api-dependencies.ts` to expose and construct the history service.
- Create: `apps/web/server/api/history/index.get.ts` to parse query parameters and return the history page.
- Modify: `apps/web/test/repositories/queue.repository.test.ts`, `apps/web/test/services/history.service.test.ts`, and `apps/web/test/api/public-api.test.ts` for persistence, service, and HTTP behavior.
- Modify: `apps/web/app/app.vue` to become the Nuxt page router entry point.
- Create: `apps/web/app/pages/index.vue` by moving the existing dashboard unchanged from `app.vue`, adding a history navigation link.
- Create: `apps/web/app/pages/hist.vue` for the `/hist` page and its return navigation.
- Create: `apps/web/app/composables/useHistory.ts` to load and append cursor pages without concurrent requests.
- Create: `apps/web/app/components/HistoryPanel.vue` and `apps/web/app/components/HistoryItem.vue` for the responsive history UI and observer sentinel.
- Modify: `apps/web/app/assets/css/main.css` for shared page-shell rules only; keep history-specific rules scoped in its components.
- Create: `apps/web/test/components/history-page.test.ts` for rendering and pagination behavior.

### Task 1: Define the Shared History Contract

**Files:**

- Modify: `packages/shared/src/schemas/queue.schema.ts`
- Modify: `packages/shared/src/types/queue.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/test/contracts.test.ts`

- [ ] **Step 1: Write failing contract tests for valid and invalid cursors/pages**

Append tests that assert a page accepts a `null` next cursor and terminal queue items, and rejects malformed cursor values:

```ts
import { historyPageSchema, historyQuerySchema } from '../src/index.js'

it('validates cursor-paginated playback history', () => {
  expect(
    historyQuerySchema.parse({
      cursor: 'eyJ1cGRhdGVkQXQiOiIyMDI2LTA2LTE4VDEyOjAwOjAwLjAwMFoiLCJpZCI6InEtMSJ9',
    }),
  ).toEqual({ cursor: 'eyJ1cGRhdGVkQXQiOiIyMDI2LTA2LTE4VDEyOjAwOjAwLjAwMFoiLCJpZCI6InEtMSJ9' })

  expect(historyPageSchema.parse({ items: [], nextCursor: null })).toEqual({
    items: [],
    nextCursor: null,
  })
  expect(historyQuerySchema.safeParse({ cursor: ['first', 'second'] }).success).toBe(false)
})
```

- [ ] **Step 2: Run the shared contract test to verify it fails**

Run: `pnpm --filter @waves/shared test -- contracts.test.ts`

Expected: FAIL because `historyPageSchema` and `historyQuerySchema` are not exported.

- [ ] **Step 3: Add history schemas and exports**

In `queue.schema.ts`, add the following after `queueSchema`:

```ts
export const historyCursorSchema = z
  .object({
    updatedAt: z.iso.datetime({ offset: true }),
    id: requiredTextSchema,
  })
  .strict()

export const historyQuerySchema = z
  .object({
    cursor: requiredTextSchema.optional(),
  })
  .strict()

export const historyPageSchema = z
  .object({
    items: z.array(queueItemSchema),
    nextCursor: requiredTextSchema.nullable(),
  })
  .strict()
```

In `types/queue.ts`, import the three schemas and export `HistoryCursor`, `HistoryQuery`, and `HistoryPage` with `z.infer`. Re-export the schema module and types from `src/index.ts` using the existing queue export pattern.

- [ ] **Step 4: Run the shared contract test to verify it passes**

Run: `pnpm --filter @waves/shared test -- contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the shared contract**

```bash
git add packages/shared/src packages/shared/test/contracts.test.ts
git commit -m "feat: add playback history contracts"
```

### Task 2: Add Stable Terminal-Item Pagination

**Files:**

- Modify: `apps/web/server/repositories/queue.repository.ts`
- Modify: `apps/web/test/repositories/queue.repository.test.ts`

- [ ] **Step 1: Write a failing repository test for terminal filtering and cursor boundaries**

Add a test that inserts `played`, `failed`, `skipped`, and active items; uses distinct `updatedAt` values plus two equal timestamps; and expects the first page sorted by `updatedAt DESC, id DESC` and the second page to contain the remaining older item without duplicates.

```ts
const firstPage = repository.listHistory({ limit: 2 })
expect(firstPage.map(({ id }) => id)).toEqual(['skipped', 'played-b'])

const secondPage = repository.listHistory({
  limit: 2,
  cursor: { updatedAt: firstPage[1]!.updatedAt, id: firstPage[1]!.id },
})
expect(secondPage.map(({ id }) => id)).toEqual(['played-a', 'failed'])
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `pnpm --filter web test -- test/repositories/queue.repository.test.ts`

Expected: FAIL because `listHistory` does not exist.

- [ ] **Step 3: Implement the repository query**

Import `or` and `lt` from `drizzle-orm`, plus `HistoryCursor` from `@waves/shared`. Add:

```ts
listHistory({ cursor, limit }: { cursor?: HistoryCursor; limit: number }): QueueItem[] {
  const cursorPredicate = cursor
    ? or(
        lt(queueItems.updatedAt, cursor.updatedAt),
        and(eq(queueItems.updatedAt, cursor.updatedAt), lt(queueItems.id, cursor.id)),
      )
    : undefined

  return this.db
    .select({ item: queueItems, user: users })
    .from(queueItems)
    .leftJoin(users, eq(queueItems.requestedByUserId, users.id))
    .where(
      cursorPredicate
        ? and(inArray(queueItems.status, ['played', 'failed', 'skipped']), cursorPredicate)
        : inArray(queueItems.status, ['played', 'failed', 'skipped']),
    )
    .orderBy(desc(queueItems.updatedAt), desc(queueItems.id))
    .limit(limit)
    .all()
    .map(mapJoinedRow)
}
```

Keep `listRecentPlayed` unchanged because autoplay recommendation seeding intentionally uses only successful plays.

- [ ] **Step 4: Run the repository test to verify it passes**

Run: `pnpm --filter web test -- test/repositories/queue.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the repository change**

```bash
git add apps/web/server/repositories/queue.repository.ts apps/web/test/repositories/queue.repository.test.ts
git commit -m "feat: paginate terminal playback history"
```

### Task 3: Expose a Public History API

**Files:**

- Create: `apps/web/server/services/history.service.ts`
- Create: `apps/web/test/services/history.service.test.ts`
- Modify: `apps/web/server/utils/public-api-dependencies.ts`
- Create: `apps/web/server/api/history/index.get.ts`
- Modify: `apps/web/test/api/public-api.test.ts`

- [ ] **Step 1: Write failing service tests for look-ahead pagination**

Create the test with a fake repository that returns `PAGE_SIZE + 1` queue items. Assert the service returns the first `PAGE_SIZE` and a cursor based on its final returned item; assert a short repository response returns `nextCursor: null`.

```ts
expect(service.list()).toMatchObject({
  items: [{ id: 'item-1' }],
  nextCursor: expect.any(String),
})
expect(shortService.list()).toEqual({ items: shortItems, nextCursor: null })
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `pnpm --filter web test -- test/services/history.service.test.ts`

Expected: FAIL because `HistoryService` does not exist.

- [ ] **Step 3: Implement cursor encoding and the history service**

Create `history.service.ts`:

```ts
import {
  historyCursorSchema,
  historyPageSchema,
  type HistoryCursor,
  type HistoryPage,
  type QueueItem,
} from '@waves/shared'
import type { QueueRepository } from '../repositories/queue.repository'

const PAGE_SIZE = 20

export function decodeHistoryCursor(cursor: string | undefined): HistoryCursor | undefined {
  if (!cursor) return undefined
  return historyCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
}

function encodeHistoryCursor(item: QueueItem): string {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt, id: item.id })).toString(
    'base64url',
  )
}

export class HistoryService {
  constructor(private readonly queueRepository: QueueRepository) {}

  list(cursor?: string): HistoryPage {
    const items = this.queueRepository.listHistory({
      ...(decodeHistoryCursor(cursor) === undefined ? {} : { cursor: decodeHistoryCursor(cursor) }),
      limit: PAGE_SIZE + 1,
    })
    const hasMore = items.length > PAGE_SIZE
    const pageItems = hasMore ? items.slice(0, PAGE_SIZE) : items
    const finalItem = pageItems.at(-1)
    return historyPageSchema.parse({
      items: pageItems,
      nextCursor: hasMore && finalItem ? encodeHistoryCursor(finalItem) : null,
    })
  }
}
```

Refine the implementation to decode once into a local `decodedCursor` before calling the repository.

- [ ] **Step 4: Add the API dependency and handler**

Add `PublicHistoryService` with `list(cursor?: string): HistoryPage`, add required `historyService` to `PublicApiDependencies`, construct it from the existing `queueRepository`, and create the handler:

```ts
import { historyPageSchema, historyQuerySchema } from '@waves/shared'
import { getQuery } from 'h3'
import { definePublicApiHandler } from '../../utils/api-error'
import {
  type PublicApiDependencies,
  usePublicApiDependencies,
} from '../../utils/public-api-dependencies'

export function createHistoryListHandler(
  getDependencies: () => PublicApiDependencies = usePublicApiDependencies,
) {
  return definePublicApiHandler((event) => {
    const { cursor } = historyQuerySchema.parse(getQuery(event))
    return historyPageSchema.parse(getDependencies().historyService.list(cursor))
  })
}

export default createHistoryListHandler()
```

Register `router.get('/api/history', createHistoryListHandler(getDependencies))` in the test API setup. Add HTTP tests for the terminal-only response, `nextCursor`, and a malformed repeated `cursor` query yielding the standard validation error.

- [ ] **Step 5: Run service and API tests to verify they pass**

Run: `pnpm --filter web test -- test/services/history.service.test.ts test/api/public-api.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the API layer**

```bash
git add apps/web/server apps/web/test/services/history.service.test.ts apps/web/test/api/public-api.test.ts
git commit -m "feat: expose playback history API"
```

### Task 4: Enable Nuxt Page Routing and Preserve the Dashboard

**Files:**

- Modify: `apps/web/app/app.vue`
- Create: `apps/web/app/pages/index.vue`
- Modify: `apps/web/app/assets/css/main.css`

- [ ] **Step 1: Write a failing page-routing smoke test**

Create a component test that imports the dashboard page and asserts it retains `Fila da sala`, then imports the history page after it is created in Task 5. The test initially fails because `pages/index.vue` is absent.

- [ ] **Step 2: Run the routing smoke test to verify it fails**

Run: `pnpm --filter web test -- test/components/history-page.test.ts`

Expected: FAIL with a missing `app/pages/index.vue` module.

- [ ] **Step 3: Move the dashboard into the index page**

Move the complete script/template content from `apps/web/app/app.vue` into `apps/web/app/pages/index.vue`. In the dashboard header action group, add an accessible `NuxtLink`:

```vue
<NuxtLink class="history-link" to="/hist">
  <History :size="17" aria-hidden="true" />
  Histórico
</NuxtLink>
```

Import `History` from `@lucide/vue`. Preserve the dashboard’s existing fetches, polling, guest prompt, and toast viewport exactly.

Replace `app.vue` with:

```vue
<template>
  <NuxtPage />
</template>
```

Add `.history-link` global styles beside `.header-actions`: minimum 44px target, muted secondary surface, visible focus ring through the existing global rule, hover contrast, and icon/text alignment. At narrow widths retain the text label rather than an icon-only control.

- [ ] **Step 4: Run the routing smoke test to verify it passes**

Run: `pnpm --filter web test -- test/components/history-page.test.ts`

Expected: PASS for the dashboard page import and existing queue heading.

- [ ] **Step 5: Commit the routing migration**

```bash
git add apps/web/app/app.vue apps/web/app/pages/index.vue apps/web/app/assets/css/main.css apps/web/test/components/history-page.test.ts
git commit -m "feat: enable dashboard page routing"
```

### Task 5: Build the Infinite History Feed

**Files:**

- Create: `apps/web/app/composables/useHistory.ts`
- Create: `apps/web/app/components/HistoryItem.vue`
- Create: `apps/web/app/components/HistoryPanel.vue`
- Create: `apps/web/app/pages/hist.vue`
- Modify: `apps/web/test/components/history-page.test.ts`

- [ ] **Step 1: Write failing client and component tests**

In `history-page.test.ts`, stub `$fetch` with a first page containing a normal played item and an autoplay failed item, then a terminal page. Assert:

```ts
expect(wrapper.text()).toContain('Waves-Bot')
expect(wrapper.get('[data-history-status="failed"]').classes()).toContain('is-muted')
expect(fetchMock).toHaveBeenCalledTimes(1)
await wrapper.get('[data-history-sentinel]').trigger('intersect')
expect(fetchMock).toHaveBeenCalledTimes(2)
```

Use a `IntersectionObserver` test double that captures its callback and invokes it twice before resolving the second request; assert only one additional request is made. Add assertions for loading, empty, retryable error, and `Fim do histórico` states.

- [ ] **Step 2: Run the history component test to verify it fails**

Run: `pnpm --filter web test -- test/components/history-page.test.ts`

Expected: FAIL because the composable, components, and history page do not exist.

- [ ] **Step 3: Implement `useHistory`**

Create a composable that imports `historyPageSchema` and `HistoryPage`, calls `$fetch(`${apiBase}/history`, { query: cursor ? { cursor } : undefined })`, and exposes `items`, `loading`, `loadingMore`, `error`, `hasMore`, `loadInitial`, `loadMore`, and `retry`.

`loadMore` must return immediately when `loading`, `loadingMore`, `!hasMore`, or no cursor after the first page. Parse every response, append only after successful validation, update the cursor from `nextCursor`, and set Portuguese error text without clearing previously loaded items. Call `loadInitial` in `onMounted`.

- [ ] **Step 4: Implement the history presentation**

`HistoryItem.vue` receives a `QueueItem` and renders:

- Artwork or a Lucide `Music2` fallback.
- Track title, joined artist names, duration, and a localized `updatedAt` timestamp using `Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })`.
- Requester `item.requestedByUser?.displayName ?? item.requestedByDisplayName ?? 'Waves-Bot'`.
- Explicit status labels: `Tocada`, `Pulada`, or `Falhou`.

Apply `data-history-status` to the row. For `failed` and `skipped`, apply `is-muted`; use opacity and desaturated cover treatment without lowering text contrast. For failed, add a restrained danger border and status chip. The mobile card is the default; at `72rem`, expose the same content in the table grid columns.

`HistoryPanel.vue` owns the section heading, state messages, item loop, a retry button for errors, and a `ref` sentinel with `data-history-sentinel`. On mount, create `IntersectionObserver` with a `300px` bottom root margin; call `loadMore` only when `entry.isIntersecting`; disconnect it on unmount. Also listen for the test-only `intersect` event on the sentinel and call the same guarded loader.

`hist.vue` uses `useRuntimeConfig`, `useHead({ title: 'Histórico | Waves Panel' })`, `useHistory(apiBase)`, and a compact branded header with:

```vue
<NuxtLink class="history-back-link" to="/" aria-label="Voltar para a fila">
  <ArrowLeft :size="18" aria-hidden="true" />
  Voltar para a fila
</NuxtLink>
```

Pass all composable state to `HistoryPanel` and keep the page limited to history browsing; do not instantiate queue polling, player polling, or autoplay there.

- [ ] **Step 5: Run the history component test to verify it passes**

Run: `pnpm --filter web test -- test/components/history-page.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the history page**

```bash
git add apps/web/app/composables/useHistory.ts apps/web/app/components/HistoryItem.vue apps/web/app/components/HistoryPanel.vue apps/web/app/pages/hist.vue apps/web/test/components/history-page.test.ts
git commit -m "feat: add infinite playback history page"
```

### Task 6: Run Quality Gates and Verify Responsive States

**Files:**

- Modify only if a quality gate exposes a defect in the preceding tasks.

- [ ] **Step 1: Run focused history tests**

Run: `pnpm --filter @waves/shared test -- contracts.test.ts && pnpm --filter web test -- test/repositories/queue.repository.test.ts test/services/history.service.test.ts test/api/public-api.test.ts test/components/history-page.test.ts`

Expected: PASS.

- [ ] **Step 2: Run repository quality gates**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`

Expected: all commands exit 0. Do not run `pnpm build` unless requested.

- [ ] **Step 3: Manually verify the responsive and accessible states**

Run: `pnpm dev:web`

Verify `/hist` at mobile, an intermediate width, and desktop: header navigation, card/table layout, artwork fallback, `Waves-Bot`, terminal labels, muted failed/skipped states, focus-visible links and retry action, initial/loading-more/empty/error/end states, and no duplicate loads while the sentinel remains visible.

- [ ] **Step 4: Commit quality fixes if needed**

```bash
git add packages/shared/src/index.ts packages/shared/src/schemas/queue.schema.ts packages/shared/src/types/queue.ts packages/shared/test/contracts.test.ts apps/web/server/repositories/queue.repository.ts apps/web/server/services/history.service.ts apps/web/server/utils/public-api-dependencies.ts apps/web/server/api/history/index.get.ts apps/web/app/app.vue apps/web/app/assets/css/main.css apps/web/app/pages/index.vue apps/web/app/pages/hist.vue apps/web/app/composables/useHistory.ts apps/web/app/components/HistoryItem.vue apps/web/app/components/HistoryPanel.vue apps/web/test/repositories/queue.repository.test.ts apps/web/test/services/history.service.test.ts apps/web/test/api/public-api.test.ts apps/web/test/components/history-page.test.ts
git commit -m "fix: polish playback history"
```

Do not create this commit when no fixes were needed.

## Self-Review

- Spec coverage: Tasks 1-3 provide a validated stable cursor API over all terminal statuses; Tasks 4-5 provide `/hist`, dashboard navigation, mobile cards, desktop table, requester fallback, outcome presentation, and guarded infinite scroll; Task 6 verifies all required states and gates.
- Placeholder scan: passed. The only conditional commit is explicitly scoped to actual gate fixes.
- Type consistency: the API passes a serialized cursor; `HistoryService` decodes it into the `HistoryCursor` supplied to `QueueRepository.listHistory`; client code treats cursors as opaque `string | null` values from `HistoryPage`.
