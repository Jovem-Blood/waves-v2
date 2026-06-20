<script setup lang="ts">
import type { Queue, QueueItem } from '@waves/shared'
import { Clock3, ListMusic, LoaderCircle, Radio, RefreshCw, Users } from '@lucide/vue'

import QueueItemRow from './QueueItem.vue'

defineProps<{
  items: Queue
  loading: boolean
  refreshing: boolean
  error?: string
  mutatingId?: string
}>()

defineEmits<{
  refresh: []
  remove: [id: string]
  move: [item: QueueItem, direction: -1 | 1]
}>()

function totalDuration(items: Queue) {
  const minutes = Math.round(items.reduce((sum, item) => sum + item.track.durationMs, 0) / 60000)
  return `${minutes} min`
}
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

      <div v-else>
        <QueueItemRow
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :index="index"
          :total="items.length"
          :mutating="mutatingId === item.id"
          @remove="$emit('remove', $event)"
          @move="(movedItem, direction) => $emit('move', movedItem, direction)"
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
  background: var(--color-surface);
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

.queue-title-row {
  gap: 9px;
  margin-top: 3px;
}

.queue-title-row svg {
  flex: none;
  color: var(--color-mint);
}

h1 {
  margin: 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 24px;
}

.queue-header p {
  margin: 5px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
}

.queue-count {
  color: var(--color-text-muted);
  font-size: 11px;
}

.queue-summary {
  display: none;
}

.queue-alert {
  margin-top: 12px;
  border: 1px solid rgb(255 107 134 / 24%);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: rgb(255 107 134 / 6%);
  font-size: 11px;
}

.queue-table {
  overflow: hidden;
  margin-top: 14px;
  border: 1px solid var(--color-border);
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
  color: var(--color-text-subtle);
  font-size: 8px;
}

.queue-footer span {
  gap: 6px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-mint);
  box-shadow: 0 0 7px rgb(84 242 135 / 50%);
}

.state-message p {
  margin: 4px 0 0;
  font-size: 11px;
}

@media (min-width: 72rem) {
  .queue-panel {
    min-height: 100%;
    padding: 20px 20px 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }

  .queue-header {
    min-height: 64px;
  }

  .queue-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    min-height: 58px;
    margin-top: 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .queue-summary div {
    height: 100%;
    gap: 10px;
    padding: 0 16px;
    color: var(--color-cyan);
  }

  .queue-summary div + div {
    border-left: 1px solid var(--color-border);
  }

  .queue-summary span {
    color: var(--color-text);
    font-family: 'Geist Mono Variable', monospace;
    font-size: 11px;
    font-weight: 700;
  }

  .queue-summary small {
    display: block;
    margin-bottom: 2px;
    color: var(--color-text-subtle);
    font-size: 8px;
  }

  .queue-table-header {
    display: grid;
    min-height: 38px;
    grid-template-columns: 62px minmax(240px, 1fr) 164px 88px 112px 88px;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-subtle);
    background: #07131e;
    font-family: 'Geist Mono Variable', monospace;
    font-size: 8px;
    font-weight: 700;
  }

  .queue-table-header span {
    padding: 0 10px;
  }
}
</style>
