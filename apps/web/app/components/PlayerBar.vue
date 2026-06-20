<script setup lang="ts">
import type { PlayerState, QueueItem } from '@waves/shared'
import { Disc3, LoaderCircle, Music2, Pause, Play, SkipForward, Volume2 } from '@lucide/vue'

defineProps<{
  player?: PlayerState
  currentItem?: QueueItem
  loading: boolean
  skipping: boolean
  mutating?: boolean
  error?: string
}>()

defineEmits<{ skip: []; control: [action: 'pause' | 'resume']; volume: [value: number] }>()

function formatTime(value: number) {
  const seconds = Math.floor(value / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <section class="player-panel" aria-labelledby="player-title" aria-live="polite">
    <div class="player-heading">
      <div>
        <span class="eyebrow">TOCANDO AGORA</span>
        <h2 id="player-title">Player da sala</h2>
      </div>
      <span class="player-state"
        ><span class="player-state-dot" />{{ player?.status ?? 'idle' }}</span
      >
    </div>

    <div v-if="loading" class="state-message">
      <LoaderCircle class="spinner" :size="24" aria-hidden="true" /> Carregando player…
    </div>

    <div v-else-if="currentItem" class="player-content">
      <div class="player-track">
        <img
          v-if="currentItem.track.coverUrl"
          class="player-artwork"
          :src="currentItem.track.coverUrl"
          :alt="`Capa de ${currentItem.track.title}`"
        />
        <span v-else class="player-artwork player-artwork-empty"
          ><Disc3 :size="42" aria-hidden="true"
        /></span>
        <div class="player-metadata">
          <strong>{{ currentItem.track.title }}</strong>
          <span>{{ currentItem.track.artists.join(', ') }}</span>
          <small>Pedido por {{ currentItem.requestedByDisplayName ?? 'Waves Web' }}</small>
        </div>
      </div>

      <div
        class="logical-progress"
        role="progressbar"
        :aria-valuenow="player?.progressMs ?? 0"
        :aria-valuemax="currentItem.track.durationMs"
        aria-label="Progresso da faixa"
      >
        <span
          :style="{
            width: `${Math.min(100, ((player?.progressMs ?? 0) / currentItem.track.durationMs) * 100)}%`,
          }"
        />
      </div>
      <div class="progress-labels">
        <span>{{ formatTime(player?.progressMs ?? 0) }}</span
        ><span>{{ formatTime(currentItem.track.durationMs) }}</span>
      </div>

      <div class="player-controls">
        <button
          class="icon-button"
          type="button"
          :disabled="mutating"
          :aria-label="player?.status === 'paused' ? 'Retomar reprodução' : 'Pausar reprodução'"
          @click="$emit('control', player?.status === 'paused' ? 'resume' : 'pause')"
        >
          <LoaderCircle v-if="mutating" class="spinner" :size="19" aria-hidden="true" />
          <Play v-else-if="player?.status === 'paused'" :size="20" aria-hidden="true" />
          <Pause v-else :size="20" aria-hidden="true" />
        </button>
        <button class="action-button" type="button" :disabled="skipping" @click="$emit('skip')">
          <LoaderCircle v-if="skipping" class="spinner" :size="19" aria-hidden="true" />
          <SkipForward v-else :size="19" aria-hidden="true" />{{
            skipping ? 'PULANDO…' : 'PULAR FAIXA'
          }}
        </button>
      </div>

      <label class="volume-control">
        <Volume2 :size="18" aria-hidden="true" /><span>Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          :value="player?.volume ?? 100"
          :disabled="mutating"
          @change="$emit('volume', Number(($event.target as HTMLInputElement).value))"
        />
        <output>{{ player?.volume ?? 100 }}%</output>
      </label>
    </div>

    <div v-else class="player-idle">
      <span class="idle-icon"><Music2 :size="32" aria-hidden="true" /></span>
      <div>
        <strong>Nenhuma música tocando</strong>
        <p>Adicione uma faixa para iniciar a reprodução.</p>
      </div>
    </div>
    <p v-if="error" class="player-error error-message">{{ error }}</p>
  </section>
</template>

<style scoped>
.player-panel {
  padding: 20px 18px 18px;
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(155deg, rgb(6 17 31/96%), rgb(9 20 38/96%) 62%, rgb(18 12 37/96%)),
    var(--color-background);
}
.player-heading,
.player-track,
.player-idle,
.player-controls,
.volume-control,
.progress-labels {
  display: flex;
  align-items: center;
}
.player-heading {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
h2 {
  margin: 3px 0 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 20px;
}
.player-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  text-transform: uppercase;
}
.player-state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-mint);
  box-shadow: 0 0 8px rgb(84 242 135/55%);
}
.player-content {
  display: grid;
  gap: 12px;
}
.player-track {
  min-width: 0;
  gap: 14px;
}
.player-artwork {
  width: 96px;
  height: 96px;
  flex: none;
  border-radius: var(--radius-sm);
  object-fit: cover;
  box-shadow:
    0 12px 28px rgb(0 0 0/28%),
    0 0 22px rgb(98 199 255/11%);
}
.player-artwork-empty {
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border-strong);
  color: var(--color-cyan);
  background: linear-gradient(145deg, #0c2432, #161127);
}
.player-metadata {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.player-metadata strong,
.player-metadata span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player-metadata strong {
  font-family: 'Geist Variable', sans-serif;
  font-size: 20px;
}
.player-metadata span {
  color: var(--color-text-muted);
  font-size: 12px;
}
.player-metadata small {
  color: #c8b9ff;
  font-size: 10px;
}
.logical-progress {
  overflow: hidden;
  height: 5px;
  border-radius: 3px;
  background: #17253a;
}
.logical-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-mint), var(--color-cyan));
  transition: width 300ms linear;
}
.progress-labels {
  justify-content: space-between;
  color: var(--color-text-subtle);
  font:
    10px 'Geist Mono Variable',
    monospace;
}
.player-controls {
  gap: 10px;
}
.player-controls .action-button {
  flex: 1;
}
.volume-control {
  min-height: 44px;
  gap: 9px;
  color: var(--color-text-muted);
  font-size: 11px;
}
.volume-control input {
  min-width: 0;
  flex: 1;
  accent-color: var(--color-mint);
}
.volume-control output {
  width: 38px;
  color: var(--color-text);
  font-family: 'Geist Mono Variable', monospace;
  text-align: right;
}
.player-idle {
  min-height: 120px;
  gap: 14px;
  color: var(--color-text-muted);
}
.player-idle strong {
  color: var(--color-text);
}
.player-idle p {
  margin: 5px 0 0;
  font-size: 12px;
}
.idle-icon {
  display: grid;
  width: 64px;
  height: 64px;
  flex: none;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-text-subtle);
  background: var(--color-surface-raised);
}
.player-error {
  margin: 12px 0 0;
  font-size: 10px;
  text-align: center;
}
@media (min-width: 72rem) {
  .player-panel {
    min-height: 310px;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }
  .player-artwork {
    width: 150px;
    height: 150px;
  }
  .player-metadata strong {
    font-size: 23px;
  }
  .player-track {
    align-items: stretch;
    gap: 16px;
  }
  .player-metadata {
    align-content: center;
  }
}
</style>
