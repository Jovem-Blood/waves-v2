<script setup lang="ts">
import type { QueueItem } from '@waves/shared'
import { LoaderCircle, RotateCcw } from '@lucide/vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import HistoryItem from './HistoryItem.vue'

const props = defineProps<{
  items: QueueItem[]
  loading: boolean
  loadingMore: boolean
  error?: string
  hasMore: boolean
}>()

const emit = defineEmits<{
  loadMore: []
  retry: []
}>()

const sentinel = ref<HTMLElement>()
let observer: IntersectionObserver | undefined

function requestMore() {
  if (!props.loading && !props.loadingMore && props.hasMore) {
    emit('loadMore')
  }
}

function observeSentinel(element = sentinel.value) {
  if (!element || observer || typeof IntersectionObserver === 'undefined') return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) requestMore()
    },
    { rootMargin: '0px 0px 300px 0px' },
  )
  observer.observe(element)
}

watch(
  sentinel,
  (element) => {
    observeSentinel(element)
  },
  { flush: 'post' },
)

onMounted(() => observeSentinel())

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <section class="history-panel" aria-labelledby="history-title">
    <header class="history-heading">
      <p class="eyebrow">Atividade da sala</p>
      <h1 id="history-title">Histórico</h1>
      <p>Músicas tocadas, puladas e com falha registradas pela fila da sala.</p>
    </header>

    <div v-if="loading" class="state-message" aria-live="polite">
      <LoaderCircle class="spinner" :size="22" aria-hidden="true" />
      Carregando histórico...
    </div>

    <div v-else-if="!items.length && error" class="state-message error-message" role="alert">
      <span>{{ error }}</span>
      <button class="history-retry" type="button" @click="$emit('retry')">
        <RotateCcw :size="16" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!items.length" class="state-message" aria-live="polite">
      O histórico ainda está vazio.
    </div>

    <template v-else>
      <div class="history-table-head" aria-hidden="true">
        <span>Faixa</span>
        <span>Pedido por</span>
        <span>Duracao</span>
        <span>Resultado</span>
        <span>Concluida em</span>
      </div>
      <div class="history-list">
        <HistoryItem v-for="item in items" :key="item.id" :item="item" />
      </div>
      <p v-if="error" class="history-inline-error" role="alert">{{ error }}</p>
      <p v-if="loadingMore" class="history-loading-more" aria-live="polite">
        <LoaderCircle class="spinner" :size="18" aria-hidden="true" />
        Carregando mais histórico...
      </p>
      <p v-else-if="!hasMore" class="history-end" aria-live="polite">Fim do histórico</p>
      <div
        ref="sentinel"
        class="history-sentinel"
        data-history-sentinel
        aria-hidden="true"
        @intersect="requestMore"
      />
    </template>
  </section>
</template>

<style scoped>
.history-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.history-heading {
  display: grid;
  gap: 5px;
}

.history-heading h1 {
  margin: 0;
  color: var(--text);
  font-family: 'Geist Variable', sans-serif;
  font-size: 28px;
  line-height: 1.1;
}

.history-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.history-list {
  display: grid;
  gap: 8px;
}

.history-table-head {
  display: none;
}

.history-retry {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-sm);
  padding: 0 14px;
  color: var(--text);
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
  cursor: pointer;
}

.history-loading-more,
.history-end,
.history-inline-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.history-inline-error {
  color: var(--danger);
}

.history-sentinel {
  min-height: 1px;
}

@media (min-width: 72rem) {
  .history-panel {
    max-width: 1180px;
    margin: 0 auto;
    padding: 24px;
  }

  .history-table-head {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) 180px 90px 112px 170px;
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    padding: 12px 14px;
    color: var(--text-subtle);
    background: var(--surface-strong);
    font-family: 'Geist Mono Variable', monospace;
    font-size: 9px;
    font-weight: 750;
    text-transform: uppercase;
  }

  .history-list {
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    background: var(--surface-raised);
  }
}
</style>
