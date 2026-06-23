<script setup lang="ts">
import type { PlayerState, QueueItem } from '@waves/shared'
import {
  Disc3,
  ExternalLink,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  SkipForward,
  Volume2,
} from '@lucide/vue'

defineProps<{
  player?: PlayerState
  currentItem?: QueueItem
  loading: boolean
  skipping: boolean
  mutating?: boolean
  error?: string
  controlsDisabledReason?: string
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
          <small v-if="currentItem.track.albumName">{{ currentItem.track.albumName }}</small>
          <small>Pedido por {{ currentItem.requestedByDisplayName ?? 'Waves Web' }}</small>
          <a
            v-if="currentItem.track.externalUrl"
            :href="currentItem.track.externalUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Abrir ${currentItem.track.title} no Spotify`"
          >
            Abrir no Spotify <ExternalLink :size="12" aria-hidden="true" />
          </a>
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
          :disabled="mutating || Boolean(controlsDisabledReason)"
          :title="controlsDisabledReason"
          :aria-label="player?.status === 'paused' ? 'Retomar reprodução' : 'Pausar reprodução'"
          @click="$emit('control', player?.status === 'paused' ? 'resume' : 'pause')"
        >
          <LoaderCircle v-if="mutating" class="spinner" :size="19" aria-hidden="true" />
          <Play v-else-if="player?.status === 'paused'" :size="20" aria-hidden="true" />
          <Pause v-else :size="20" aria-hidden="true" />
        </button>
        <button
          class="action-button"
          type="button"
          :disabled="skipping || Boolean(controlsDisabledReason)"
          :title="controlsDisabledReason"
          @click="$emit('skip')"
        >
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
          :disabled="mutating || Boolean(controlsDisabledReason)"
          @change="$emit('volume', Number(($event.target as HTMLInputElement).value))"
        />
        <output>{{ player?.volume ?? 100 }}%</output>
      </label>
      <p v-if="controlsDisabledReason" class="controls-disabled-reason">
        {{ controlsDisabledReason }}
      </p>
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
  border-bottom: 1px solid var(--border);
  background:
    linear-gradient(
      155deg,
      color-mix(in srgb, var(--background) 96%, transparent),
      color-mix(in srgb, var(--surface-strong) 96%, transparent) 62%,
      color-mix(in srgb, var(--accent-tertiary) 4%, var(--background) 96%)
    ),
    var(--background);
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
  color: var(--text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  text-transform: uppercase;
}
.player-state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 55%, transparent);
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
    0 0 22px color-mix(in srgb, var(--accent-secondary) 11%, transparent);
}
.player-artwork-empty {
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  color: var(--accent-secondary);
  background: linear-gradient(145deg, var(--surface-muted), var(--surface-strong));
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
  color: var(--text-muted);
  font-size: 12px;
}
.player-metadata small {
  color: var(--accent-tertiary);
  font-size: 10px;
}
.player-metadata a {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  color: var(--accent-secondary);
  font-size: 10px;
  text-decoration: none;
}
.player-metadata a:hover {
  text-decoration: underline;
}
.logical-progress {
  overflow: hidden;
  height: 5px;
  border-radius: 3px;
  background: var(--surface-muted);
}
.logical-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  transition: width 300ms linear;
}
.progress-labels {
  justify-content: space-between;
  color: var(--text-subtle);
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
  color: var(--text-muted);
  font-size: 11px;
}
.volume-control input {
  min-width: 0;
  flex: 1;
  accent-color: var(--accent-primary);
}
.volume-control output {
  width: 38px;
  color: var(--text);
  font-family: 'Geist Mono Variable', monospace;
  text-align: right;
}
.player-idle {
  min-height: 120px;
  gap: 14px;
  color: var(--text-muted);
}
.player-idle strong {
  color: var(--text);
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
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-subtle);
  background: var(--surface-raised);
}
.player-error {
  margin: 12px 0 0;
  font-size: 10px;
  text-align: center;
}
.controls-disabled-reason {
  margin: 0;
  color: var(--warning);
  font-size: 10px;
  text-align: center;
}
@media (min-width: 72rem) {
  .player-panel {
    min-height: 310px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
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
