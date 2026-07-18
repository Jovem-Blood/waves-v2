<script setup lang="ts">
import type { QueueItem } from '@waves/shared'
import { Music2 } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  item: QueueItem
}>()

const statusLabels: Record<'played' | 'skipped' | 'failed', string> = {
  played: 'Tocada',
  skipped: 'Pulada',
  failed: 'Falhou',
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function formatCompletedAt(updatedAt: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(updatedAt))
}

function requesterName(item: QueueItem) {
  return item.requestedByUser?.displayName ?? item.requestedByDisplayName ?? 'Waves-Bot'
}

const statusLabel = computed(() =>
  props.item.status === 'played' ||
  props.item.status === 'skipped' ||
  props.item.status === 'failed'
    ? statusLabels[props.item.status]
    : props.item.status,
)
</script>

<template>
  <article
    class="history-item"
    :class="{ 'is-muted': item.status === 'failed' || item.status === 'skipped' }"
    :data-history-status="item.status"
  >
    <div class="history-cover">
      <img
        v-if="item.track.coverUrl"
        :src="item.track.coverUrl"
        :alt="`Capa de ${item.track.title}`"
      />
      <span v-else class="history-cover-empty"><Music2 :size="20" aria-hidden="true" /></span>
    </div>

    <div class="history-track">
      <strong>{{ item.track.title }}</strong>
      <span>{{ item.track.artists.join(', ') }}</span>
    </div>

    <span class="history-requester">{{ requesterName(item) }}</span>
    <span class="history-duration">{{ formatDuration(item.track.durationMs) }}</span>
    <span class="history-status">{{ statusLabel }}</span>
    <time class="history-completed" :datetime="item.updatedAt">
      {{ formatCompletedAt(item.updatedAt) }}
    </time>
  </article>
</template>

<style scoped>
.history-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 76px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  background: var(--surface-raised);
}

.history-item.is-muted {
  background: color-mix(in srgb, var(--surface-raised) 76%, var(--background));
}

.history-item[data-history-status='failed'] {
  border-color: color-mix(in srgb, var(--danger) 46%, var(--border));
  box-shadow: inset 3px 0 color-mix(in srgb, var(--danger) 82%, transparent);
}

.history-cover,
.history-cover img,
.history-cover-empty {
  width: 52px;
  height: 52px;
}

.history-cover img {
  border-radius: 7px;
  object-fit: cover;
}

.is-muted .history-cover img {
  filter: saturate(0.45);
  opacity: 0.72;
}

.history-cover-empty {
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-subtle);
  background: var(--surface-strong);
}

.history-track {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.history-track strong,
.history-track span,
.history-requester,
.history-completed {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-track strong {
  color: var(--text);
  font-size: 13px;
}

.history-track span,
.history-requester,
.history-completed {
  color: var(--text-muted);
  font-size: 10px;
}

.history-duration {
  display: none;
  color: var(--text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
}

.history-status {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
  border-radius: var(--radius-pill);
  padding: 4px 8px;
  color: var(--success);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  font-weight: 750;
  text-transform: uppercase;
}

[data-history-status='skipped'] .history-status {
  border-color: color-mix(in srgb, var(--warning) 32%, transparent);
  color: var(--warning);
}

[data-history-status='failed'] .history-status {
  border-color: color-mix(in srgb, var(--danger) 42%, transparent);
  color: var(--danger);
}

.history-requester {
  grid-column: 2;
  color: var(--accent-tertiary);
}

.history-completed {
  grid-column: 2 / -1;
}

@media (min-width: 72rem) {
  .history-item {
    grid-template-columns: minmax(280px, 1fr) 180px 90px 112px 170px;
    gap: 0;
    min-height: 68px;
    border-radius: 0;
    border-width: 0 0 1px;
    padding: 0 14px;
  }

  .history-cover {
    display: none;
  }

  .history-track,
  .history-requester,
  .history-duration,
  .history-status,
  .history-completed {
    grid-column: auto;
  }

  .history-duration {
    display: block;
  }
}
</style>
