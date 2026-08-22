<script setup lang="ts">
import { useHead, useRuntimeConfig } from '#imports'
import { ArrowLeft, AudioWaveform } from '@lucide/vue'

import PlaybackHealthPanel from '../components/PlaybackHealthPanel.vue'
import { usePlaybackHealth } from '../composables/usePlaybackHealth'

defineOptions({ name: 'PlaybackHealthPage' })

const config = useRuntimeConfig()
const health = usePlaybackHealth(config.public.apiBase)

useHead({ title: 'Playback Health | Waves Panel' })
</script>

<template>
  <div class="health-page min-h-dvh bg-(--background) text-(--text)">
    <header class="app-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"
          ><AudioWaveform :size="24" :stroke-width="1.8"
        /></span>
        <span
          ><strong class="brand-name">WAVES</strong
          ><small class="brand-subtitle">PLAYBACK HEALTH</small></span
        >
      </div>
      <NuxtLink class="history-back-link" to="/">
        <ArrowLeft :size="18" aria-hidden="true" />
        Voltar para a fila
      </NuxtLink>
    </header>
    <main>
      <PlaybackHealthPanel
        :data="health.data.value"
        :loading="health.loading.value"
        :error="health.error.value"
        :days="health.days.value"
        :source-provider="health.sourceProvider.value"
        :error-code="health.errorCode.value"
        @retry="health.refresh"
        @days-change="health.setDays"
        @source-provider-change="health.setSourceProvider"
        @error-code-change="health.setErrorCode"
      />
    </main>
  </div>
</template>
