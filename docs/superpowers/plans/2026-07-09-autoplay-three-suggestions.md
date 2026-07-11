# Autoplay Three Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build durable three-item autoplay suggestions that exclude recently played tracks, promote the first suggestion when needed, and continuously backfill suggestions so playback does not run out.

**Architecture:** Keep Nuxt as the source of truth. Convert the existing singleton `autoplay_suggestions` storage to an ordered list, add a focused exclusion helper for played/active/suggested/rejected tracks, and update the orchestrator to fill, promote, shift, reject, and backfill suggestions. The UI continues rendering ghost rows after real queue rows.

**Tech Stack:** Nuxt 4, Nitro API handlers, Vue 3, Drizzle ORM with SQLite, Zod shared schemas, Vitest, Tailwind/CSS variables, `mise exec node@25.5.0 -- pnpm ...` for verification.

---

## File Structure

- Modify `packages/shared/src/schemas/autoplay.schema.ts`: replace `suggestion` with `suggestions`, add reject payload schema with `providerTrackId`.
- Modify `packages/shared/src/types/autoplay.ts`: exported inferred types update automatically from schema names.
- Add `apps/web/drizzle/0008_autoplay_three_suggestions.sql`: migrate singleton suggestions into ordered rows and add constraints/indexes.
- Modify `apps/web/server/db/schema.ts`: add `position`, remove singleton check, add unique indexes for position and visible track.
- Modify `apps/web/server/repositories/autoplay-suggestion.repository.ts`: expose list/replace-all operations for up to three suggestions, targeted reject/remove, and compaction.
- Add `apps/web/server/services/autoplay-exclusions.ts`: centralize `RECENT_PLAYED_LIMIT = 20` and exclusion-set construction.
- Modify `apps/web/server/services/autoplay.service.ts`: return `suggestions`, clear all on disable, reject by `providerTrackId`.
- Modify `apps/web/server/services/autoplay-orchestrator.service.ts`: fill up to three, promote first suggestion, preserve/backfill remaining suggestions, keep human queue priority.
- Modify `apps/web/server/services/player-state.service.ts`: promote first suggestion from ordered repository instead of singleton.
- Modify `apps/web/server/api/autoplay/suggestion.delete.ts`: read/validate body and reject target suggestion idempotently.
- Modify `apps/web/app/composables/useAutoplay.ts`: pass `providerTrackId` when rejecting and keep target loading state.
- Modify `apps/web/app/components/QueuePanel.vue`: render `autoplay.suggestions` with `v-for` and emit target `providerTrackId`.
- Modify `apps/web/app/components/AutoplaySuggestionRow.vue`: accept `rejecting` per row; no visual redesign.
- Modify tests under `apps/web/test/repositories`, `apps/web/test/services`, `apps/web/test/api`, `apps/web/test/components`.

Implementation note: preserve existing uncommitted work unless it directly conflicts. Do not stop or restart Docker.

---

### Task 1: Shared Autoplay Schema Shape

**Files:**
- Modify: `packages/shared/src/schemas/autoplay.schema.ts`
- Modify: `packages/shared/src/types/autoplay.ts`
- Test: `packages/shared/test/contracts.test.ts`

- [ ] **Step 1: Update shared schema test**

In `packages/shared/test/contracts.test.ts`, add `autoplayStateSchema` and `rejectAutoplaySuggestionInputSchema` to the import list from `../src/index.js`, then add this block after the `trackMetadataSchema` describe block:

```ts
describe('autoplay schemas', () => {
  it('validates ordered suggestions and target rejection input', () => {
    const state = autoplayStateSchema.parse({
      enabled: true,
      failureCode: null,
      suggestions: [
        {
          track: {
            id: 'spotify:first',
            provider: 'spotify',
            providerTrackId: 'first',
            title: 'First',
            artists: ['Artist'],
            durationMs: 120000,
          },
          provider: 'spotify',
          generatedAt: '2026-06-18T12:00:00.000Z',
          seedFingerprint: 'seed',
        },
      ],
      updatedAt: '2026-06-18T12:00:00.000Z',
    })

    expect(state.suggestions).toHaveLength(1)
    expect(rejectAutoplaySuggestionInputSchema.parse({ providerTrackId: 'first' })).toEqual({
      providerTrackId: 'first',
    })
  })
})
```

- [ ] **Step 2: Run shared contract test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter @waves/shared test test/contracts.test.ts`

Expected: FAIL because `autoplayStateSchema` still expects `suggestion` and `rejectAutoplaySuggestionInputSchema` still expects an empty object.

- [ ] **Step 3: Modify `packages/shared/src/schemas/autoplay.schema.ts`**

Replace the autoplay state and reject input definitions with:

```ts
export const autoplayStateSchema = z
  .object({
    enabled: z.boolean(),
    failureCode: autoplayFailureCodeSchema.nullable(),
    suggestions: z.array(autoplaySuggestionSchema).max(3).default([]),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const updateAutoplayInputSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict()

export const rejectAutoplaySuggestionInputSchema = z
  .object({
    providerTrackId: z.string().trim().min(1),
  })
  .strict()
```

Do not keep the old `suggestion` field in the public schema.

- [ ] **Step 4: Typecheck shared package**

Run: `mise exec node@25.5.0 -- pnpm --filter @waves/shared typecheck`

Expected: TypeScript typecheck exits 0.

---

### Task 2: Database Schema And Migration For Ordered Suggestions

**Files:**
- Add: `apps/web/drizzle/0008_autoplay_three_suggestions.sql`
- Modify: `apps/web/server/db/schema.ts`
- Test: `apps/web/test/repositories/database.test.ts`

- [ ] **Step 1: Update database table expectation test**

In `apps/web/test/repositories/database.test.ts`, extend the existing schema/assertion test so it checks `autoplay_suggestions` has `position` and no singleton-only behavior. Add a query near existing table checks:

```ts
const suggestionColumns = connection.sqlite
  .prepare("pragma table_info('autoplay_suggestions')")
  .all() as Array<{ name: string }>

expect(suggestionColumns.map((column) => column.name)).toContain('position')
```

If the file already has a better schema assertion helper, use it but keep the assertion exact.

- [ ] **Step 2: Run database test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/repositories/database.test.ts`

Expected: FAIL because `position` does not exist yet.

- [ ] **Step 3: Add migration `apps/web/drizzle/0008_autoplay_three_suggestions.sql`**

Use a copy-table migration compatible with SQLite:

```sql
CREATE TABLE `autoplay_suggestions_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`track_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artists_json` text NOT NULL,
	`album_name` text,
	`duration_ms` integer NOT NULL,
	`cover_url` text,
	`external_url` text,
	`isrc` text,
	`generated_at` text NOT NULL,
	`seed_fingerprint` text NOT NULL,
	CONSTRAINT "autoplay_suggestions_position_range" CHECK("position" BETWEEN 0 AND 2),
	CONSTRAINT "autoplay_suggestions_duration_nonnegative" CHECK("duration_ms" >= 0)
);
--> statement-breakpoint
INSERT INTO `autoplay_suggestions_new` (
	`id`, `position`, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`, `seed_fingerprint`
)
SELECT
	`id`, 0, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`, `seed_fingerprint`
FROM `autoplay_suggestions`;
--> statement-breakpoint
DROP TABLE `autoplay_suggestions`;
--> statement-breakpoint
ALTER TABLE `autoplay_suggestions_new` RENAME TO `autoplay_suggestions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_position_unique` ON `autoplay_suggestions` (`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_track_unique` ON `autoplay_suggestions` (`provider`, `provider_track_id`);
```

- [ ] **Step 4: Update Drizzle schema**

In `apps/web/server/db/schema.ts`, update `autoplaySuggestions`:

```ts
export const autoplaySuggestions = sqliteTable(
  'autoplay_suggestions',
  {
    id: integer('id').primaryKey(),
    position: integer('position').notNull(),
    trackId: text('track_id').notNull(),
    provider: text('provider', { enum: ['spotify'] }).notNull(),
    providerTrackId: text('provider_track_id').notNull(),
    title: text('title').notNull(),
    artistsJson: text('artists_json').notNull(),
    albumName: text('album_name'),
    durationMs: integer('duration_ms').notNull(),
    coverUrl: text('cover_url'),
    externalUrl: text('external_url'),
    isrc: text('isrc'),
    generatedAt: text('generated_at').notNull(),
    seedFingerprint: text('seed_fingerprint').notNull(),
  },
  (table) => [
    uniqueIndex('autoplay_suggestions_position_unique').on(table.position),
    uniqueIndex('autoplay_suggestions_track_unique').on(table.provider, table.providerTrackId),
    check('autoplay_suggestions_position_range', sql`${table.position} between 0 and 2`),
    check('autoplay_suggestions_duration_nonnegative', sql`${table.durationMs} >= 0`),
  ],
)
```

- [ ] **Step 5: Run database test**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/repositories/database.test.ts`

Expected: PASS.

---

### Task 3: Repository Support For Three Suggestions

**Files:**
- Modify: `apps/web/server/repositories/autoplay-suggestion.repository.ts`
- Test: `apps/web/test/repositories/autoplay-suggestion.repository.test.ts`

- [ ] **Step 1: Replace singleton repository test with ordered-list behavior**

Update the first test in `apps/web/test/repositories/autoplay-suggestion.repository.test.ts` to:

```ts
it('persists ordered suggestions and removes one by provider track id', () => {
  const repository = new AutoplaySuggestionRepository(connection.db)
  repository.replaceAll([
    {
      track: {
        id: 'spotify:one',
        provider: 'spotify',
        providerTrackId: 'one',
        title: 'One',
        artists: ['Artist'],
        albumName: 'Album',
        durationMs: 123_000,
        isrc: 'BRABC1234567',
      },
      provider: 'spotify',
      generatedAt,
      seedFingerprint: 'seed-one',
    },
    {
      track: {
        id: 'spotify:two',
        provider: 'spotify',
        providerTrackId: 'two',
        title: 'Two',
        artists: ['Artist'],
        durationMs: 124_000,
      },
      provider: 'spotify',
      generatedAt,
      seedFingerprint: 'seed-one',
    },
  ])

  expect(repository.list().map((suggestion) => suggestion.track.providerTrackId)).toEqual([
    'one',
    'two',
  ])
  expect(repository.removeByProviderTrackId('one')).toBe(true)
  expect(repository.list().map((suggestion) => suggestion.track.providerTrackId)).toEqual(['two'])
  repository.compactPositions()
  expect(repository.list()).toMatchObject([{ track: { providerTrackId: 'two' } }])
})
```

Keep the rejection test and add an idempotency assertion:

```ts
expect(repository.removeByProviderTrackId('missing')).toBe(false)
```

- [ ] **Step 2: Run repository test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/repositories/autoplay-suggestion.repository.test.ts`

Expected: FAIL because `replaceAll`, `list`, `removeByProviderTrackId`, and `compactPositions` do not exist yet.

- [ ] **Step 3: Implement repository ordered methods**

In `apps/web/server/repositories/autoplay-suggestion.repository.ts`, add constants and methods while preserving `reject` and `listRejected`:

```ts
const MAX_AUTOPLAY_SUGGESTIONS = 3

type SuggestionRow = typeof autoplaySuggestions.$inferSelect

function mapRow(row: SuggestionRow): AutoplaySuggestion {
  const track: TrackMetadata = {
    id: row.trackId,
    provider: row.provider,
    providerTrackId: row.providerTrackId,
    title: row.title,
    artists: parseArtists(row.artistsJson),
    ...(row.albumName === null ? {} : { albumName: row.albumName }),
    durationMs: row.durationMs,
    ...(row.coverUrl === null ? {} : { coverUrl: row.coverUrl }),
    ...(row.externalUrl === null ? {} : { externalUrl: row.externalUrl }),
    ...(row.isrc === null ? {} : { isrc: row.isrc }),
  }
  return autoplaySuggestionSchema.parse({
    track,
    generatedAt: row.generatedAt,
    provider: row.provider,
    seedFingerprint: row.seedFingerprint,
  })
}
```

Replace singleton `get` and `replace` with:

```ts
list(): AutoplaySuggestion[] {
  return this.db
    .select()
    .from(autoplaySuggestions)
    .orderBy(asc(autoplaySuggestions.position))
    .all()
    .map(mapRow)
}

replaceAll(suggestions: AutoplaySuggestion[]): AutoplaySuggestion[] {
  const parsed = suggestions.slice(0, MAX_AUTOPLAY_SUGGESTIONS).map((suggestion) =>
    autoplaySuggestionSchema.parse(suggestion),
  )
  this.clear()
  parsed.forEach((suggestion, position) => {
    const { track } = suggestion
    this.db
      .insert(autoplaySuggestions)
      .values({
        id: position + 1,
        position,
        trackId: track.id,
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        title: track.title,
        artistsJson: JSON.stringify(track.artists),
        albumName: track.albumName ?? null,
        durationMs: track.durationMs,
        coverUrl: track.coverUrl ?? null,
        externalUrl: track.externalUrl ?? null,
        isrc: track.isrc ?? null,
        generatedAt: suggestion.generatedAt,
        seedFingerprint: suggestion.seedFingerprint,
      })
      .run()
  })
  return this.list()
}

clear(): boolean {
  return this.db.delete(autoplaySuggestions).run().changes > 0
}

removeByProviderTrackId(providerTrackId: string): boolean {
  return (
    this.db
      .delete(autoplaySuggestions)
      .where(eq(autoplaySuggestions.providerTrackId, providerTrackId))
      .run().changes > 0
  )
}

compactPositions(): AutoplaySuggestion[] {
  const current = this.list()
  return this.replaceAll(current)
}
```

Also update imports to include `asc` from `drizzle-orm`.

- [ ] **Step 4: Run repository test**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/repositories/autoplay-suggestion.repository.test.ts`

Expected: PASS.

---

### Task 4: Autoplay Exclusion Helper

**Files:**
- Create: `apps/web/server/services/autoplay-exclusions.ts`
- Test: `apps/web/test/services/autoplay-exclusions.test.ts`

- [ ] **Step 1: Write failing helper test**

Create `apps/web/test/services/autoplay-exclusions.test.ts`:

```ts
import type { AutoplaySuggestion, QueueItem, TrackMetadata } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import { buildAutoplayExcludedTrackIds, RECENT_PLAYED_LIMIT } from '../../server/services/autoplay-exclusions'

const track = (providerTrackId: string): TrackMetadata => ({
  id: `spotify:${providerTrackId}`,
  provider: 'spotify',
  providerTrackId,
  title: providerTrackId,
  artists: ['Artist'],
  durationMs: 120000,
})

const item = (providerTrackId: string, status: QueueItem['status']): QueueItem => ({
  id: `queue:${providerTrackId}`,
  track: track(providerTrackId),
  status,
  position: 0,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:00:00.000Z',
})

const suggestion = (providerTrackId: string): AutoplaySuggestion => ({
  track: track(providerTrackId),
  provider: 'spotify',
  generatedAt: '2026-06-18T12:00:00.000Z',
  seedFingerprint: 'seed',
})

describe('autoplay exclusions', () => {
  it('combines recent, active, visible, rejected and seed tracks', () => {
    const excluded = buildAutoplayExcludedTrackIds({
      active: [item('active', 'playing')],
      recent: [item('recent', 'played')],
      suggestions: [suggestion('visible')],
      rejected: new Set(['rejected']),
      seeds: [track('seed')],
    })

    expect(RECENT_PLAYED_LIMIT).toBe(20)
    expect([...excluded].sort()).toEqual(['active', 'recent', 'rejected', 'seed', 'visible'])
  })
})
```

- [ ] **Step 2: Run helper test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/services/autoplay-exclusions.test.ts`

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement helper**

Create `apps/web/server/services/autoplay-exclusions.ts`:

```ts
import type { AutoplaySuggestion, QueueItem, TrackMetadata } from '@waves/shared'

export const RECENT_PLAYED_LIMIT = 20

export interface AutoplayExclusionInput {
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
```

- [ ] **Step 4: Run helper test**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/services/autoplay-exclusions.test.ts`

Expected: PASS.

---

### Task 5: Autoplay Service And API Targeted Rejection

**Files:**
- Modify: `apps/web/server/services/autoplay.service.ts`
- Modify: `apps/web/server/api/autoplay/suggestion.delete.ts`
- Modify: `apps/web/test/api/public-api.test.ts`

- [ ] **Step 1: Update public API rejection test**

In `apps/web/test/api/public-api.test.ts`, update the rejection test to persist two suggestions and reject only one:

```ts
repository.replaceAll([
  {
    track: firstTrack,
    provider: 'spotify',
    generatedAt: '2026-06-18T16:00:00.000Z',
    seedFingerprint: 'seed',
  },
  {
    track: { ...secondTrack, providerTrackId: 'track-2' },
    provider: 'spotify',
    generatedAt: '2026-06-18T16:00:00.000Z',
    seedFingerprint: 'seed',
  },
])
```

Change the authenticated DELETE call to:

```ts
const rejected = await request('/api/autoplay/suggestion', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ providerTrackId: 'track-1' }),
})
```

Update expectations:

```ts
expect(rejected.response.status).toBe(200)
expect(rejected.body.suggestions).toHaveLength(1)
expect(rejected.body.suggestions[0].track.providerTrackId).toBe('track-2')
expect(repository.listRejected('2026-06-18T16:30:00.000Z')).toEqual(new Set(['track-1']))
```

- [ ] **Step 2: Run API test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/api/public-api.test.ts -t 'requires authentication to reject a persisted autoplay suggestion'`

Expected: FAIL because API still rejects singleton without reading body.

- [ ] **Step 3: Update `AutoplayService`**

Replace `get`, state-returning methods, and rejection with array shape:

```ts
get(): AutoplayState {
  const state = this.repository.get()
  return { ...state, suggestions: this.suggestions?.list() ?? [] }
}

update(input: UpdateAutoplayInput): AutoplayState {
  const parsed = updateAutoplayInputSchema.parse(input)
  if (!parsed.enabled) this.suggestions?.clear()
  const state = this.repository.update({ enabled: parsed.enabled, failureCode: null })
  return { ...state, suggestions: this.suggestions?.list() ?? [] }
}

recordFailure(failureCode: AutoplayFailureCode): AutoplayState {
  const state = this.repository.update({ failureCode })
  return { ...state, suggestions: this.suggestions?.list() ?? [] }
}

clearFailure(): AutoplayState {
  const state = this.repository.update({ failureCode: null })
  return { ...state, suggestions: this.suggestions?.list() ?? [] }
}

rejectSuggestion(providerTrackId: string): AutoplayState {
  if (this.suggestions?.removeByProviderTrackId(providerTrackId)) {
    const createdAt = this.now()
    this.suggestions.reject(
      providerTrackId,
      createdAt.toISOString(),
      new Date(createdAt.getTime() + REJECTION_TTL_MS).toISOString(),
    )
    this.suggestions.compactPositions()
  }
  return this.get()
}
```

- [ ] **Step 4: Update delete handler**

In `apps/web/server/api/autoplay/suggestion.delete.ts`, import `rejectAutoplaySuggestionInputSchema` and `readBody`, then replace the rejection call:

```ts
import { autoplayStateSchema, rejectAutoplaySuggestionInputSchema } from '@waves/shared'
import { readBody } from 'h3'
```

Inside handler after auth:

```ts
const input = rejectAutoplaySuggestionInputSchema.parse(await readBody(event))
dependencies.autoplayService.rejectSuggestion(input.providerTrackId)
await dependencies.autoplayOrchestrator?.queueChanged().catch(() => undefined)
return autoplayStateSchema.parse(dependencies.autoplayService.get())
```

Update the `PublicAutoplayService` interface in `apps/web/server/utils/public-api-dependencies.ts`:

```ts
export interface PublicAutoplayService {
  get(): AutoplayState
  update(input: UpdateAutoplayInput): AutoplayState
  rejectSuggestion(providerTrackId: string): AutoplayState
}
```

- [ ] **Step 5: Run targeted API test**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/api/public-api.test.ts -t 'requires authentication to reject a persisted autoplay suggestion'`

Expected: PASS.

---

### Task 6: Orchestrator Multi-Suggestion Fill And Continuous Backfill

**Files:**
- Modify: `apps/web/server/services/autoplay-orchestrator.service.ts`
- Modify: `apps/web/server/services/player-state.service.ts`
- Test: `apps/web/test/services/autoplay-orchestrator.service.test.ts`

- [ ] **Step 1: Update orchestrator tests for three suggestions and continuous backfill**

In `apps/web/test/services/autoplay-orchestrator.service.test.ts`, add helper tracks:

```ts
const secondRecommendation: TrackMetadata = {
  ...firstTrack,
  id: 'spotify:second-recommended',
  providerTrackId: 'second-recommended',
  title: 'Second Recommended',
}

const thirdRecommendation: TrackMetadata = {
  ...firstTrack,
  id: 'spotify:third-recommended',
  providerTrackId: 'third-recommended',
  title: 'Third Recommended',
}
```

Replace the prior single follow-up test with:

```ts
it('promotes the first suggestion and backfills from the promoted song', async () => {
  const getRecommendations = vi
    .fn()
    .mockResolvedValueOnce([recommendation, secondRecommendation, thirdRecommendation])
    .mockResolvedValueOnce([followUpRecommendation])
  const harness = createHarness(getRecommendations)
  const item = startTrack(harness)
  harness.autoplayService.update({ enabled: true })

  await harness.orchestrator.queueChanged()
  expect(harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)).toEqual([
    'recommended',
    'second-recommended',
    'third-recommended',
  ])

  const result = await harness.orchestrator.completePlayback({
    queueItemId: item.id,
    outcome: 'played',
  })

  expect(result.nextItem?.track.providerTrackId).toBe('recommended')
  expect(harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)).toEqual([
    'second-recommended',
    'third-recommended',
    'follow-up',
  ])
  expect(getRecommendations).toHaveBeenCalledTimes(2)
})
```

Add a played-track exclusion test:

```ts
it('does not persist recently played recommendations', async () => {
  const getRecommendations = vi.fn().mockResolvedValue([firstTrack, recommendation])
  const harness = createHarness(getRecommendations)
  const item = startTrack(harness)
  harness.autoplayService.update({ enabled: true })

  await harness.orchestrator.completePlayback({ queueItemId: item.id, outcome: 'played' })

  expect(harness.suggestionRepository.list().map((entry) => entry.track.providerTrackId)).not.toContain(
    'first',
  )
})
```

- [ ] **Step 2: Run orchestrator test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/services/autoplay-orchestrator.service.test.ts`

Expected: FAIL because orchestrator still assumes singleton suggestions.

- [ ] **Step 3: Update player promotion**

In `apps/web/server/services/player-state.service.ts`, update `promoteAutoplaySuggestion`:

```ts
const suggestions = autoplaySuggestion.list()
const suggestion = suggestions[0]
const active = queue.listActive()
const recentIds = new Set(queue.listRecentPlayed(RECENT_PLAYED_LIMIT).map((item) => item.track.providerTrackId))
```

Import `RECENT_PLAYED_LIMIT` from `./autoplay-exclusions`.

On successful insert, replace `autoplaySuggestion.clear()` with:

```ts
autoplaySuggestion.removeByProviderTrackId(suggestion.track.providerTrackId)
autoplaySuggestion.compactPositions()
```

Keep the same guards: autoplay enabled, no active queue, matching `seedFingerprint`, not recently played, not active by track, player has guild and voice channel.

- [ ] **Step 4: Update orchestrator generation**

In `apps/web/server/services/autoplay-orchestrator.service.ts`, import:

```ts
import {
  buildAutoplayExcludedTrackIds,
  RECENT_PLAYED_LIMIT,
} from './autoplay-exclusions'
```

Add class constant near top-level if preferred:

```ts
const TARGET_AUTOPLAY_SUGGESTIONS = 3
```

In `generateIfNeeded`, replace singleton logic with this flow:

```ts
const state = this.autoplayService.get()
const active = this.queueService.list()
if (!state.enabled) {
  this.suggestionRepository.clear()
  return
}

const existing = this.suggestionRepository.list()
if (active.length !== 1) {
  const recentIds = new Set(
    this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT).map((item) => item.track.providerTrackId),
  )
  const activeIds = new Set(active.map((item) => item.track.providerTrackId))
  const fingerprint = this.seedFingerprint(this.currentSeeds())
  const stillValid = existing.filter(
    (suggestion) =>
      suggestion.seedFingerprint === fingerprint &&
      !activeIds.has(suggestion.track.providerTrackId) &&
      !recentIds.has(suggestion.track.providerTrackId),
  )
  if (stillValid.length !== existing.length) this.suggestionRepository.replaceAll(stillValid)
  return
}

const seeds = this.currentSeeds()
if (seeds.length === 0) {
  this.autoplayService.recordFailure('no_seeds')
  return
}
const fingerprint = this.seedFingerprint(seeds)
const recent = this.queueRepository.listRecentPlayed(RECENT_PLAYED_LIMIT)
const rejected = this.suggestionRepository.listRejected(this.now().toISOString())
const validExisting = existing.filter((suggestion) => suggestion.seedFingerprint === fingerprint)
const excluded = buildAutoplayExcludedTrackIds({
  active,
  recent,
  suggestions: validExisting,
  rejected,
  seeds,
})

if (validExisting.length >= TARGET_AUTOPLAY_SUGGESTIONS) return
if (validExisting.length !== existing.length) this.suggestionRepository.replaceAll(validExisting)

const recommendations = await this.recommendationProvider.getRecommendations(seeds, excluded)
const nextSuggestions = [...validExisting]
for (const track of recommendations) {
  if (nextSuggestions.length >= TARGET_AUTOPLAY_SUGGESTIONS) break
  if (excluded.has(track.providerTrackId)) continue
  if (this.queueRepository.findActiveByTrack(track.provider, track.providerTrackId)) continue
  nextSuggestions.push({
    track,
    provider: 'spotify',
    generatedAt: this.now().toISOString(),
    seedFingerprint: fingerprint,
  })
  excluded.add(track.providerTrackId)
}

const currentSeeds = this.currentSeeds()
if (
  !this.autoplayService.get().enabled ||
  this.queueService.list().length !== 1 ||
  this.seedFingerprint(currentSeeds) !== fingerprint
) {
  return
}

this.suggestionRepository.replaceAll(nextSuggestions)
if (nextSuggestions.length === 0 || nextSuggestions.length === validExisting.length) {
  this.autoplayService.recordFailure('no_candidates')
  return
}
this.autoplayService.clearFailure()
```

In `completePlayback`, keep the previous fix pattern: call `safeQueueChanged()` before completion when autoplay is enabled, promote if no real next item, then call `safeQueueChanged()` again after promotion so the promoted suggested song triggers another suggestion.

- [ ] **Step 5: Run orchestrator tests**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/services/autoplay-orchestrator.service.test.ts`

Expected: PASS.

---

### Task 7: UI And Composable For Three Suggestion Rows

**Files:**
- Modify: `apps/web/app/composables/useAutoplay.ts`
- Modify: `apps/web/app/components/QueuePanel.vue`
- Modify: `apps/web/app/components/AutoplaySuggestionRow.vue`
- Modify: `apps/web/app/app.vue`
- Test: `apps/web/test/components/queue-social.test.ts`

- [ ] **Step 1: Update component test for three ghost rows and targeted rejection**

In `apps/web/test/components/queue-social.test.ts`, change autoplay state fixtures from `suggestion` to `suggestions`. Replace the ghost-row test with:

```ts
it('renders three autoplay ghosts after human tracks and rejects one target accessibly', async () => {
  const suggestions = ['Fantasma', 'Neblina', 'Aurora'].map((title, index) => ({
    track: {
      ...track,
      id: `spotify:ghost-${index + 1}`,
      providerTrackId: `ghost-${index + 1}`,
      title,
    },
    provider: 'spotify' as const,
    generatedAt: '2026-06-18T12:00:00.000Z',
    seedFingerprint: 'seed',
  }))
  const wrapper = mount(QueuePanel, {
    props: {
      items: [queuedItem],
      loading: false,
      refreshing: false,
      autoplay: {
        enabled: true,
        failureCode: null,
        suggestions,
        updatedAt: '2026-06-18T12:00:00.000Z',
      },
      autoplayRejectingId: 'ghost-2',
    },
  })

  expect(wrapper.findAll('.autoplay-suggestion')).toHaveLength(3)
  const rows = wrapper.findAll('.queue-items > *')
  expect(rows.at(-1)?.classes()).toContain('autoplay-suggestion')
  await wrapper.get('[aria-label="Rejeitar sugestão Neblina"]').trigger('click')
  expect(wrapper.emitted('autoplayReject')).toEqual([['ghost-2']])
})
```

- [ ] **Step 2: Run component test to verify failure**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/components/queue-social.test.ts`

Expected: FAIL because UI still expects one `suggestion` and emits no target.

- [ ] **Step 3: Update `QueuePanel.vue` props and emits**

Change props:

```ts
autoplayRejectingId?: string
```

Change emit type:

```ts
autoplayReject: [providerTrackId: string]
```

Replace singleton row rendering with:

```vue
<AutoplaySuggestionRow
  v-for="suggestion in autoplay?.suggestions ?? []"
  :key="suggestion.track.providerTrackId"
  :suggestion="suggestion"
  :rejecting="autoplayRejectingId === suggestion.track.providerTrackId"
  @reject="$emit('autoplayReject', suggestion.track.providerTrackId)"
/>
```

- [ ] **Step 4: Update `useAutoplay.ts`**

Replace `rejecting` with target state:

```ts
const rejectingId = ref<string>()
```

Replace `rejectSuggestion()`:

```ts
async function rejectSuggestion(providerTrackId: string) {
  rejectingId.value = providerTrackId
  try {
    state.value = autoplayStateSchema.parse(
      await $fetch(`${apiBase}/autoplay/suggestion`, {
        method: 'DELETE',
        body: { providerTrackId },
      }),
    )
    error.value = undefined
    toasts.success('Sugestão rejeitada.')
  } catch {
    toasts.error('Não foi possível rejeitar a sugestão.')
  } finally {
    rejectingId.value = undefined
  }
}
```

Return `rejectingId` instead of `rejecting`.

- [ ] **Step 5: Update `app.vue` bindings**

Replace `:autoplay-rejecting="autoplay.rejecting.value"` with:

```vue
:autoplay-rejecting-id="autoplay.rejectingId.value"
```

Keep `@autoplay-reject="autoplay.rejectSuggestion"`.

- [ ] **Step 6: Run component test**

Run: `mise exec node@25.5.0 -- pnpm --filter web test test/components/queue-social.test.ts`

Expected: PASS.

---

### Task 8: Full Focused Verification And Cleanup

**Files:**
- Review all modified files.
- Do not modify Docker state.

- [ ] **Step 1: Typecheck shared package**

Run: `mise exec node@25.5.0 -- pnpm --filter @waves/shared typecheck`

Expected: exit 0.

- [ ] **Step 2: Run focused web tests**

Run:

```bash
mise exec node@25.5.0 -- pnpm --filter web test test/repositories/autoplay-suggestion.repository.test.ts test/services/autoplay-exclusions.test.ts test/services/autoplay-orchestrator.service.test.ts test/api/public-api.test.ts test/components/queue-social.test.ts
```

Expected: all selected test files pass.

- [ ] **Step 3: Run typecheck**

Run: `mise exec node@25.5.0 -- pnpm --filter web typecheck`

Expected: exit 0.

- [ ] **Step 4: Inspect diff**

Run: `git diff -- apps/web packages/shared docs/superpowers/plans/2026-07-09-autoplay-three-suggestions.md`

Expected: only intended autoplay, schema, migration, UI, test, and plan changes appear. Do not revert unrelated `mise.toml` or unrelated user changes.

- [ ] **Step 5: Report verification evidence**

In the final response, include exact commands run and pass/fail results. If any command cannot run, state the blocker and the command output.
