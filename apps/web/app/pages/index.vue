<script setup lang="ts">
import { useHead, useRuntimeConfig } from '#imports'
import { Activity, AudioWaveform, Headphones, History } from '@lucide/vue'
import { computed, watch } from 'vue'

import CurrentUserMenu from '../components/CurrentUserMenu.vue'
import GuestNamePrompt from '../components/GuestNamePrompt.vue'
import PlayerBar from '../components/PlayerBar.vue'
import HeaderConnectionStatus from '../components/HeaderConnectionStatus.vue'
import QueuePanel from '../components/QueuePanel.vue'
import SpotifySearch from '../components/SpotifySearch.vue'
import SettingsModal from '../components/SettingsModal.vue'
import ToastViewport from '../components/ToastViewport.vue'
import { useOperationalStatus } from '../composables/useOperationalStatus'
import { useAuth } from '../composables/useAuth'
import { usePlayerState } from '../composables/usePlayerState'
import { useQueue } from '../composables/useQueue'
import { useAutoplay } from '../composables/useAutoplay'
import { useRealtimeEvents } from '../composables/useRealtimeEvents'

defineOptions({ name: 'DashboardPage' })

const config = useRuntimeConfig()
const apiBase = config.public.apiBase

const queue = useQueue(apiBase)
const player = usePlayerState(apiBase)
const operational = useOperationalStatus(apiBase)
const auth = useAuth(apiBase)
const autoplay = useAutoplay(apiBase)
const realtime = useRealtimeEvents(apiBase, {
  snapshot(event) {
    queue.applyRealtimeQueue(event.queue)
    player.replace(event.player)
    operational.replace(event.status)
  },
  queueUpdated(event) {
    queue.applyRealtimeQueue(event.queue)
  },
  queueItemFailed(event) {
    queue.applyRealtimeFailedItem(event.item, event.queue)
  },
  playerUpdated(event) {
    player.replace(event.player)
  },
  statusChanged(event) {
    operational.replace(event.status)
  },
})

watch(realtime.connected, (connected) => {
  queue.setRealtimeConnected(connected)
  player.setRealtimeConnected(connected)
  operational.setRealtimeConnected(connected)
})

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

async function handleSkip() {
  const result = await player.skip()
  if (result) queue.replace(result.queue, { notifyFailures: false })
}

async function handleAutoplayCommit(
  suggestion: NonNullable<typeof autoplay.state.value>['suggestions'][number],
) {
  const added = await queue.add(suggestion.track, 'end')
  if (added) autoplay.removeSuggestion(suggestion.track.providerTrackId)
}

const controlsDisabledReason = computed(() => {
  if (!operational.webAvailable.value) return 'A interface web está indisponível.'
  if (operational.status.value?.bot.status !== 'online') return 'O bot está offline.'
  if (operational.status.value.voice.status === 'reconnecting') return 'O canal está reconectando.'
  if (operational.status.value.voice.status !== 'connected')
    return 'O bot não está em um canal de voz.'
  return undefined
})

const guestPromptOpen = computed(() => !auth.loading.value && !auth.user.value)
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

      <HeaderConnectionStatus
        :status="operational.status.value"
        :loading="operational.loading.value"
        :web-available="operational.webAvailable.value"
      />

      <div class="header-actions">
        <NuxtLink class="history-link" to="/hist">
          <History :size="17" aria-hidden="true" />
          Histórico
        </NuxtLink>
        <NuxtLink class="history-link" to="/playback-health">
          <Activity :size="17" aria-hidden="true" />
          Playback Health
        </NuxtLink>
        <CurrentUserMenu
          :user="auth.user.value"
          :loading="auth.loading.value"
          :disabled="auth.submitting.value"
          @logout="auth.logout"
        />
        <SettingsModal
          :status="operational.status.value"
          :web-available="operational.webAvailable.value"
        />
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
        :controls-disabled-reason="controlsDisabledReason"
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
        :autoplay="autoplay.state.value"
        :autoplay-loading="autoplay.loading.value"
        :autoplay-updating="autoplay.updating.value"
        :autoplay-error="autoplay.error.value"
        :autoplay-rejecting-id="autoplay.rejectingId.value"
        :autoplay-committing-track-id="queue.addingTrackId.value"
        @refresh="queue.refresh"
        @remove="queue.remove"
        @move="queue.move"
        @move-to-position="queue.moveToPosition"
        @drag-state-change="queue.setInteractionLocked"
        @autoplay-change="autoplay.setEnabled"
        @autoplay-commit="handleAutoplayCommit"
        @autoplay-reject="autoplay.rejectSuggestion"
      />

      <SpotifySearch
        class="dashboard-search"
        :adding-track-id="queue.addingTrackId.value"
        :adding-placement="queue.addingPlacement.value"
        :active-track-ids="activeTrackIds"
        @add="(track) => queue.add(track, 'end')"
        @play-next="(track) => queue.add(track, 'next')"
      />
    </main>

    <footer class="app-footer">
      <span>
        <Headphones :size="14" aria-hidden="true" />
        Player e fila sincronizados com o Discord
      </span>
      <span>Waves sincroniza a fila automaticamente</span>
    </footer>
    <GuestNamePrompt
      :open="guestPromptOpen"
      :submitting="auth.submitting.value"
      :error="auth.error.value"
      @submit="auth.createGuest"
    />
    <ToastViewport />
  </div>
</template>
