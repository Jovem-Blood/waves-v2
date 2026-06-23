<script setup lang="ts">
import type { OperationalStatus } from '@waves/shared'
import { Bot, Globe2, Radio } from '@lucide/vue'

defineProps<{
  status?: OperationalStatus
  loading: boolean
  webAvailable: boolean
}>()
</script>

<template>
  <div class="header-connection-status" aria-live="polite" aria-atomic="true">
    <div class="status-chip" :data-state="webAvailable ? 'online' : 'offline'">
      <Globe2 :size="14" aria-hidden="true" />
      <span>WEB {{ webAvailable ? 'DISPONÍVEL' : 'INDISPONÍVEL' }}</span>
    </div>
    <div class="status-chip" :data-state="status?.bot.status === 'online' ? 'online' : 'offline'">
      <Bot :size="14" aria-hidden="true" />
      <span
        >BOT {{ loading ? 'VERIFICANDO' : (status?.bot.status ?? 'offline').toUpperCase() }}</span
      >
    </div>
    <div class="status-chip voice-chip" :data-state="status?.voice.status ?? 'disconnected'">
      <Radio :size="14" aria-hidden="true" />
      <span>
        {{
          status?.voice.status === 'connected'
            ? `${status.voice.guildName} · ${status.voice.voiceChannelName}`
            : status?.voice.status === 'reconnecting'
              ? 'CANAL RECONECTANDO'
              : 'CANAL DESCONECTADO'
        }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.header-connection-status {
  display: none;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.status-chip {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 0 9px;
  color: var(--text-subtle);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
}

.status-chip[data-state='online'],
.status-chip[data-state='connected'] {
  border-color: color-mix(in srgb, var(--success) 28%, var(--border));
  color: var(--success);
}

.status-chip[data-state='reconnecting'] {
  border-color: color-mix(in srgb, var(--warning) 35%, var(--border));
  color: var(--warning);
}

.voice-chip span {
  overflow: hidden;
  max-width: 18rem;
  text-overflow: ellipsis;
}

@media (min-width: 48rem) {
  .header-connection-status {
    display: flex;
  }
}
</style>
