<script setup lang="ts">
import type { AutoplayState, Queue, QueueItem } from '@waves/shared'
import { Clock3, ListMusic, LoaderCircle, Radio, RefreshCw, Sparkles, Users } from '@lucide/vue'
import Sortable, { type SortableEvent } from 'sortablejs'
import { onBeforeUnmount, ref, watch } from 'vue'

import QueueItemRow from './QueueItem.vue'
import AutoplaySuggestionRow from './AutoplaySuggestionRow.vue'

defineProps<{
  items: Queue
  loading: boolean
  refreshing: boolean
  error?: string
  mutatingId?: string
  autoplay?: AutoplayState
  autoplayLoading?: boolean
  autoplayUpdating?: boolean
  autoplayError?: string
  autoplayRejectingId?: string
}>()

const emit = defineEmits<{
  refresh: []
  remove: [id: string]
  move: [item: QueueItem, direction: -1 | 1]
  moveToPosition: [fromIndex: number, toIndex: number]
  dragStateChange: [dragging: boolean]
  autoplayChange: [enabled: boolean]
  autoplayReject: [providerTrackId: string]
}>()

const queueItemsRef = ref<HTMLElement | null>(null)
let sortable: Sortable | undefined
let dragging = false

function totalDuration(items: Queue) {
  const minutes = Math.round(items.reduce((sum, item) => sum + item.track.durationMs, 0) / 60000)
  return `${minutes} min`
}

function initializeSortable() {
  if (sortable?.el === queueItemsRef.value) return
  sortable?.destroy()
  sortable = undefined
  if (!queueItemsRef.value) return

  sortable = Sortable.create(queueItemsRef.value, {
    animation: 180,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    handle: '.queue-order',
    draggable: '.queue-item[data-status="queued"]',
    ghostClass: 'queue-item-ghost',
    chosenClass: 'queue-item-chosen',
    dragClass: 'queue-item-drag',
    forceFallback: true,
    fallbackClass: 'queue-item-fallback',
    fallbackOnBody: true,
    fallbackTolerance: 4,
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    onStart() {
      dragging = true
      emit('dragStateChange', true)
    },
    onEnd(event: SortableEvent) {
      if (event.oldIndex !== undefined && event.newIndex !== undefined) {
        emit('moveToPosition', event.oldIndex, event.newIndex)
      }
      finishDragging()
    },
    onUnchoose() {
      queueMicrotask(finishDragging)
    },
  })
}

function finishDragging() {
  if (!dragging) return
  dragging = false
  emit('dragStateChange', false)
}

function removeOrphanedFallback() {
  document
    .querySelectorAll<HTMLElement>('body > .queue-item-fallback')
    .forEach((element) => element.remove())
}

watch(queueItemsRef, initializeSortable, { flush: 'post' })

onBeforeUnmount(() => {
  finishDragging()
  sortable?.destroy()
  removeOrphanedFallback()
})
</script>

<template>
  <section class="queue-panel" aria-labelledby="queue-title" aria-live="polite">
    <div class="queue-header">
      <div>
        <span class="eyebrow">FILA AO VIVO</span>
        <div class="queue-title-row">
          <ListMusic :size="24" aria-hidden="true" />
          <h1 id="queue-title">Fila da sala</h1>
          <span class="queue-count">{{ items.length }} músicas</span>
        </div>
        <p>Gerencie o que toca em seguida para todo mundo.</p>
      </div>

      <div class="queue-controls">
        <button
          class="autoplay-toggle"
          type="button"
          role="switch"
          :aria-checked="autoplay?.enabled ?? false"
          :disabled="autoplayLoading || autoplayUpdating"
          :aria-label="autoplay?.enabled ? 'Desativar autoplay' : 'Ativar autoplay'"
          @click="$emit('autoplayChange', !(autoplay?.enabled ?? false))"
        >
          <Sparkles :size="15" aria-hidden="true" />
          <span>Autoplay</span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
          <LoaderCircle v-if="autoplayUpdating" class="spinner" :size="14" aria-hidden="true" />
        </button>
        <button
          class="icon-button"
          type="button"
          :disabled="refreshing"
          aria-label="Atualizar fila"
          @click="$emit('refresh')"
        >
          <RefreshCw :class="{ spinner: refreshing }" :size="18" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="queue-summary">
      <div>
        <Clock3 :size="18" /><span><small>DURAÇÃO</small>{{ totalDuration(items) }}</span>
      </div>
      <div>
        <Users :size="18" /><span><small>PEDIDOS</small>{{ items.length }}</span>
      </div>
      <div>
        <Radio :size="18" />
        <span><small>SINCRONIZAÇÃO</small>{{ refreshing ? 'Atualizando' : 'Ao vivo' }}</span>
      </div>
    </div>

    <div v-if="error" class="queue-alert error-message">{{ error }}</div>
    <div v-if="autoplayError || autoplay?.failureCode" class="queue-alert autoplay-warning">
      {{
        autoplayError ??
        'O autoplay não encontrou uma recomendação agora. Ele tentará novamente depois.'
      }}
    </div>

    <div class="queue-table">
      <div class="queue-table-header" aria-hidden="true">
        <span>ORDEM</span><span>FAIXA</span><span>PEDIDO POR</span><span>DURAÇÃO</span
        ><span>ESTADO</span><span>AÇÕES</span>
      </div>

      <div v-if="loading" class="state-message">
        <LoaderCircle class="spinner" :size="25" aria-hidden="true" />
        Carregando a fila…
      </div>

      <div v-else-if="items.length === 0" class="state-message">
        <ListMusic :size="30" aria-hidden="true" />
        <div>
          <strong>A fila está vazia</strong>
          <p>Busque uma música abaixo para começar.</p>
        </div>
      </div>

      <div v-else ref="queueItemsRef" class="queue-items">
        <QueueItemRow
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :index="index"
          :total="items.length"
          :mutating="mutatingId === item.id"
          :can-move-up="
            item.status === 'queued' && index > 0 && items[index - 1]?.status !== 'playing'
          "
          :can-move-down="item.status === 'queued' && index < items.length - 1"
          @remove="$emit('remove', $event)"
          @move="(movedItem, direction) => $emit('move', movedItem, direction)"
        />
        <AutoplaySuggestionRow
          v-for="suggestion in autoplay?.suggestions ?? []"
          :key="suggestion.track.providerTrackId"
          :suggestion="suggestion"
          :rejecting="autoplayRejectingId === suggestion.track.providerTrackId"
          @reject="$emit('autoplayReject', suggestion.track.providerTrackId)"
        />
      </div>

      <div class="queue-footer">
        <span><span class="live-dot" /> Atualização automática a cada 2,5s</span>
        <span>{{ refreshing ? 'Sincronizando…' : 'Fila sincronizada' }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.queue-panel {
  padding: 18px;
  background: var(--surface);
}

.queue-header,
.queue-title-row,
.queue-summary,
.queue-summary div,
.queue-footer,
.queue-footer span {
  display: flex;
  align-items: center;
}

.queue-header {
  justify-content: space-between;
  gap: 16px;
}

.queue-controls,
.autoplay-toggle {
  display: flex;
  align-items: center;
}

.queue-controls {
  gap: 6px;
}

.autoplay-toggle {
  min-height: 48px;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: var(--text-muted);
  background: var(--surface-raised);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.autoplay-toggle:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.autoplay-toggle:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.autoplay-toggle:active:not(:disabled) {
  background: var(--surface-strong);
}

.autoplay-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.autoplay-toggle[aria-checked='true'] {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.switch-track {
  position: relative;
  width: 30px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-muted);
  transition:
    transform 140ms ease,
    background 140ms ease;
}

.autoplay-toggle[aria-checked='true'] .switch-track {
  background: color-mix(in srgb, var(--accent-primary) 35%, var(--surface-strong));
}

.autoplay-toggle[aria-checked='true'] .switch-thumb {
  transform: translateX(12px);
  background: var(--accent-primary);
}

.autoplay-warning {
  border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 7%, transparent);
}

@media (max-width: 32rem) {
  .queue-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .queue-controls {
    width: 100%;
    justify-content: space-between;
  }
}

.queue-title-row {
  gap: 9px;
  margin-top: 3px;
}

.queue-title-row svg {
  flex: none;
  color: var(--accent-primary);
}

h1 {
  margin: 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 24px;
}

.queue-header p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 11px;
}

.queue-count {
  color: var(--text-muted);
  font-size: 11px;
}

.queue-summary {
  display: none;
}

.queue-alert {
  margin-top: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  font-size: 11px;
}

.queue-table {
  overflow: hidden;
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.queue-table-header {
  display: none;
}

.queue-footer {
  min-height: 42px;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px;
  color: var(--text-subtle);
  font-size: 8px;
}

.queue-footer span {
  gap: 6px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 7px color-mix(in srgb, var(--success) 50%, transparent);
}

.state-message p {
  margin: 4px 0 0;
  font-size: 11px;
}

@media (min-width: 72rem) {
  .queue-panel {
    min-height: 100%;
    padding: 20px 20px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }

  .queue-header {
    min-height: 64px;
  }

  .queue-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    min-height: 58px;
    margin-top: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .queue-summary div {
    height: 100%;
    gap: 10px;
    padding: 0 16px;
    color: var(--accent-secondary);
  }

  .queue-summary div + div {
    border-left: 1px solid var(--border);
  }

  .queue-summary span {
    color: var(--text);
    font-family: 'Geist Mono Variable', monospace;
    font-size: 11px;
    font-weight: 700;
  }

  .queue-summary small {
    display: block;
    margin-bottom: 2px;
    color: var(--text-subtle);
    font-size: 8px;
  }

  .queue-table-header {
    display: grid;
    min-height: 38px;
    grid-template-columns: 62px minmax(240px, 1fr) 164px 88px 112px 88px;
    align-items: center;
    border-bottom: 1px solid var(--border);
    color: var(--text-subtle);
    background: var(--surface-muted);
    font-family: 'Geist Mono Variable', monospace;
    font-size: 8px;
    font-weight: 700;
  }

  .queue-table-header span {
    padding: 0 10px;
  }
}

.queue-items {
  position: relative;
}

.queue-items :deep(.queue-item-ghost) {
  opacity: 0.24;
  border: 1px dashed var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--surface-raised));
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.queue-items :deep(.queue-item-chosen) {
  border-color: var(--accent-primary);
}

.queue-items :deep(.queue-item-drag),
:global(.queue-item-fallback) {
  opacity: 0.92;
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  box-shadow: var(--glow-primary);
  cursor: grabbing;
}

@media (prefers-reduced-motion: reduce) {
  .queue-items :deep(.queue-item) {
    transition: none !important;
  }
}
</style>
