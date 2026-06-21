<script setup lang="ts">
import { useHead, useRuntimeConfig } from '#imports'
import { AudioWaveform, Headphones, Radio, Server } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import PlayerBar from './components/PlayerBar.vue'
import QueuePanel from './components/QueuePanel.vue'
import SpotifySearch from './components/SpotifySearch.vue'
import SettingsModal from './components/SettingsModal.vue'
import { usePlayerState } from './composables/usePlayerState'
import { useQueue } from './composables/useQueue'

const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const isOnline = ref(false)

const queue = useQueue(apiBase)
const player = usePlayerState(apiBase)

const activeTrackIds = computed(() =>
  queue.items.value
    .filter((item) => item.status === 'queued' || item.status === 'playing')
    .map((item) => item.track.id),
)

const currentItem = computed(() => {
  const currentId = player.state.value?.currentQueueItemId
  return currentId ? queue.items.value.find((item) => item.id === currentId) : undefined
})

const pageTitle = computed(() => {
  const item = currentItem.value
  const status = player.state.value?.status
  if (item && (status === 'playing' || status === 'paused')) {
    return `Waves Panel | ${item.track.title}`
  }
  return 'Waves Panel'
})

useHead({ title: pageTitle })

async function checkHealth() {
  try {
    const response = await $fetch<{ ok: boolean }>(`${apiBase}/health`)
    isOnline.value = response.ok
  } catch {
    isOnline.value = false
  }
}

async function handleSkip() {
  const result = await player.skip()
  if (result) queue.replace(result.queue)
}

onMounted(() => void checkHealth())
</script>

<template>
  <div class="min-h-dvh bg-(--background) text-(--text)">
    <header class="app-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">
          <AudioWaveform :size="24" :stroke-width="1.8" />
        </span>
        <span>
          <strong class="brand-name">WAVES</strong>
          <small class="brand-subtitle">DISCORD MUSIC PANEL</small>
        </span>
      </div>

      <div class="hidden items-center gap-6 md:flex">
        <div class="header-context">
          <Server :size="16" aria-hidden="true" />
          <span><small>SERVIDOR</small>Waves</span>
        </div>
        <div class="header-context">
          <Radio :size="16" aria-hidden="true" />
          <span><small>CANAL DE VOZ</small>ondas-da-noite</span>
        </div>
      </div>

      <div class="header-actions">
        <SettingsModal :is-online="isOnline" />
      </div>
    </header>

    <main class="dashboard-layout">
      <PlayerBar
        class="dashboard-player"
        :player="player.state.value"
        :current-item="currentItem"
        :loading="player.loading.value"
        :skipping="player.skipping.value"
        :mutating="player.mutating.value"
        :error="player.error.value"
        @skip="handleSkip"
        @control="player.control"
        @volume="player.setVolume"
      />

      <QueuePanel
        class="dashboard-queue"
        :items="queue.items.value"
        :loading="queue.loading.value"
        :refreshing="queue.refreshing.value"
        :error="queue.error.value"
        :mutating-id="queue.mutatingId.value"
        @refresh="queue.refresh"
        @remove="queue.remove"
        @move="queue.move"
        @move-to-position="queue.moveToPosition"
      />

      <SpotifySearch
        class="dashboard-search"
        :adding-track-id="queue.addingTrackId.value"
        :active-track-ids="activeTrackIds"
        @add="queue.add"
      />
    </main>

    <footer class="app-footer">
      <span><Headphones :size="14" aria-hidden="true" /> Player lógico · áudio na fase 2</span>
      <span>Waves sincroniza a fila automaticamente</span>
    </footer>
  </div>
</template>
