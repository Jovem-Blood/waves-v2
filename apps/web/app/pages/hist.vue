<script setup lang="ts">
import { useHead, useRuntimeConfig } from '#imports'
import { ArrowLeft, AudioWaveform } from '@lucide/vue'

import HistoryPanel from '../components/HistoryPanel.vue'
import { useHistory } from '../composables/useHistory'

defineOptions({ name: 'HistoryPage' })

const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const history = useHistory(apiBase)

useHead({ title: 'Histórico | Waves Panel' })
</script>

<template>
  <div class="history-page min-h-dvh bg-(--background) text-(--text)">
    <header class="app-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">
          <AudioWaveform :size="24" :stroke-width="1.8" />
        </span>
        <span>
          <strong class="brand-name">WAVES</strong>
          <small class="brand-subtitle">HISTÓRICO DA FILA</small>
        </span>
      </div>

      <NuxtLink class="history-back-link" to="/" aria-label="Voltar para a fila">
        <ArrowLeft :size="18" aria-hidden="true" />
        Voltar para a fila
      </NuxtLink>
    </header>

    <main>
      <HistoryPanel
        :items="history.items.value"
        :loading="history.loading.value"
        :loading-more="history.loadingMore.value"
        :error="history.error.value"
        :has-more="history.hasMore.value"
        @load-more="history.loadMore"
        @retry="history.retry"
      />
    </main>
  </div>
</template>
