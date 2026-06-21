<script setup lang="ts">
import type { QueueItem } from '@waves/shared'
import { ArrowDown, ArrowUp, Disc3, GripVertical, LoaderCircle, Trash2 } from '@lucide/vue'

defineProps<{
  item: QueueItem
  index: number
  total: number
  mutating: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}>()

defineEmits<{
  remove: [id: string]
  move: [item: QueueItem, direction: -1 | 1]
}>()

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
</script>

<template>
  <article class="queue-item" :data-status="item.status" :data-drag-item-id="item.id">
    <div
      class="queue-order"
      :class="{ 'queue-order-disabled': item.status !== 'queued' || mutating }"
      :aria-label="
        item.status === 'queued'
          ? `Arraste para reordenar ${item.track.title}`
          : `${item.track.title} está tocando e não pode ser reordenada`
      "
    >
      <GripVertical :size="16" aria-hidden="true" />
      <span>{{ String(index + 1).padStart(2, '0') }}</span>
    </div>

    <div class="queue-track">
      <img
        v-if="item.track.coverUrl"
        :src="item.track.coverUrl"
        :alt="`Capa de ${item.track.title}`"
      />
      <span v-else class="queue-cover-empty"><Disc3 :size="20" aria-hidden="true" /></span>
      <div>
        <strong>{{ item.track.title }}</strong>
        <span>{{ item.track.artists.join(', ') }}</span>
      </div>
    </div>

    <span class="queue-requester">{{ item.requestedByDisplayName ?? 'Waves Web' }}</span>
    <span class="queue-duration">{{ formatDuration(item.track.durationMs) }}</span>
    <span class="queue-status">{{ item.status }}</span>

    <div class="queue-actions">
      <button
        class="row-action"
        type="button"
        :disabled="mutating || !canMoveUp"
        :aria-label="`Mover ${item.track.title} para cima`"
        @click="$emit('move', item, -1)"
      >
        <ArrowUp :size="17" aria-hidden="true" />
      </button>
      <button
        class="row-action"
        type="button"
        :disabled="mutating || !canMoveDown"
        :aria-label="`Mover ${item.track.title} para baixo`"
        @click="$emit('move', item, 1)"
      >
        <ArrowDown :size="17" aria-hidden="true" />
      </button>
      <button
        class="row-action remove-action"
        type="button"
        :disabled="mutating"
        :aria-label="`Remover ${item.track.title} da fila`"
        @click="$emit('remove', item.id)"
      >
        <LoaderCircle v-if="mutating" class="spinner" :size="17" aria-hidden="true" />
        <Trash2 v-else :size="17" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.queue-item {
  display: grid;
  min-height: 68px;
  grid-template-columns: 35px minmax(0, 1fr) auto;
  align-items: center;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: var(--surface-raised);
}

.queue-item[data-status='playing'] {
  box-shadow: inset 3px 0 var(--accent-primary);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent-primary) 8%, transparent),
    var(--surface-raised) 42%
  );
}

.queue-item[data-status='failed'] {
  box-shadow: inset 3px 0 var(--danger);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--danger) 8%, transparent),
    var(--surface-raised) 42%
  );
}

.queue-order {
  display: grid;
  justify-items: center;
  gap: 2px;
  color: var(--text-subtle);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  cursor: grab;
  user-select: none;
}

.queue-order-disabled {
  cursor: default;
  opacity: 0.55;
}

@media (pointer: coarse) {
  .queue-order {
    cursor: default;
  }
}

.queue-item:not([data-status='playing']) .queue-order:active {
  cursor: grabbing;
}

.queue-item[data-status='queued'] .queue-order {
  touch-action: manipulation;
}

.queue-track {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.queue-track img,
.queue-cover-empty {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 6px;
}

.queue-track img {
  object-fit: cover;
}

.queue-cover-empty {
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  color: var(--text-subtle);
  background: var(--surface-strong);
}

.queue-track div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.queue-track strong,
.queue-track span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-track strong {
  font-size: 12px;
}

.queue-track span {
  color: var(--text-muted);
  font-size: 10px;
}

.queue-requester,
.queue-duration,
.queue-status {
  display: none;
}

.queue-actions {
  display: flex;
  padding-right: 4px;
}

.row-action {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  color: var(--text-subtle);
  background: transparent;
  cursor: pointer;
}

.row-action:hover:not(:disabled) {
  color: var(--text);
}

.row-action:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.remove-action:hover:not(:disabled) {
  color: var(--danger);
}

@media (min-width: 72rem) {
  .queue-item {
    grid-template-columns: 62px minmax(240px, 1fr) 164px 88px 112px 88px;
    min-height: 68px;
  }

  .queue-order {
    grid-template-columns: auto auto;
    place-content: center;
    gap: 5px;
  }

  .queue-track {
    padding: 0 10px;
  }

  .queue-requester,
  .queue-duration,
  .queue-status {
    display: block;
    padding: 0 10px;
    color: var(--text-muted);
    font-size: 10px;
  }

  .queue-requester {
    overflow: hidden;
    color: var(--accent-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .queue-duration {
    font-family: 'Geist Mono Variable', monospace;
  }

  .queue-status {
    width: fit-content;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 4px 8px;
    font-family: 'Geist Mono Variable', monospace;
    font-size: 8px;
    text-transform: uppercase;
  }

  [data-status='playing'] .queue-status {
    border-color: color-mix(in srgb, var(--accent-primary) 25%, transparent);
    color: var(--accent-primary);
  }

  [data-status='failed'] .queue-status {
    border-color: color-mix(in srgb, var(--danger) 25%, transparent);
    color: var(--danger);
  }

  .queue-actions {
    justify-content: flex-end;
  }

  .row-action {
    width: 28px;
  }
}
</style>
