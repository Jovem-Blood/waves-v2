<script setup lang="ts">
import type { PlayerState } from '@waves/shared'
import { Radio, Server } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  player?: PlayerState
  loading: boolean
  error?: string
}>()

const connectionState = computed(() => {
  if (props.loading) return 'loading'
  if (props.error) return 'unavailable'
  if (props.player?.guildName && props.player.voiceChannelName) return 'connected'
  if (props.player?.guildId || props.player?.voiceChannelId) return 'unavailable'
  return 'disconnected'
})

const serverName = computed(() => {
  if (connectionState.value === 'connected') return props.player?.guildName
  if (connectionState.value === 'loading') return 'Carregando…'
  if (connectionState.value === 'unavailable') return 'Status indisponível'
  return 'Desconectado'
})

const voiceChannelName = computed(() => {
  if (connectionState.value === 'connected') return props.player?.voiceChannelName
  if (connectionState.value === 'loading') return 'Carregando…'
  if (connectionState.value === 'unavailable') return 'Status indisponível'
  return 'Desconectado'
})
</script>

<template>
  <div
    class="header-connection-status hidden items-center gap-6 md:flex"
    :data-state="connectionState"
    aria-live="polite"
    aria-atomic="true"
  >
    <div class="header-context">
      <Server :size="16" aria-hidden="true" />
      <span
        ><small>SERVIDOR</small><strong :title="serverName">{{ serverName }}</strong></span
      >
    </div>
    <div class="header-context">
      <Radio :size="16" aria-hidden="true" />
      <span
        ><small>CANAL DE VOZ</small
        ><strong :title="voiceChannelName">{{ voiceChannelName }}</strong></span
      >
    </div>
  </div>
</template>

<style scoped>
.header-connection-status {
  min-width: 0;
}

.header-context {
  min-width: 0;
}

.header-context span,
.header-context strong {
  display: block;
  min-width: 0;
}

.header-context strong {
  max-width: 18rem;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-state='connected'] .header-context svg {
  color: var(--accent-primary);
}

[data-state='unavailable'] .header-context strong {
  color: var(--warning);
}

[data-state='disconnected'] .header-context strong {
  color: var(--text-subtle);
}
</style>
