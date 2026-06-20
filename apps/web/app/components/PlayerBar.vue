<script setup lang="ts">
import type { PlayerState, QueueItem } from '@waves/shared'
import { Disc3, LoaderCircle, Music2, SkipForward } from '@lucide/vue'

defineProps<{
  player?: PlayerState
  currentItem?: QueueItem
  loading: boolean
  skipping: boolean
  error?: string
}>()

defineEmits<{ skip: [] }>()
</script>

<template>
  <section class="player-panel" aria-labelledby="player-title" aria-live="polite">
    <div class="player-heading">
      <div>
        <span class="eyebrow">TOCANDO AGORA</span>
        <h2 id="player-title">Player da sala</h2>
      </div>
      <span class="player-state">
        <span class="player-state-dot" />
        {{ player?.status ?? 'idle' }}
      </span>
    </div>

    <div v-if="loading" class="state-message">
      <LoaderCircle class="spinner" :size="24" aria-hidden="true" />
      Carregando player…
    </div>

    <div v-else-if="currentItem" class="player-content">
      <div class="player-track">
        <img
          v-if="currentItem.track.coverUrl"
          class="player-artwork"
          :src="currentItem.track.coverUrl"
          :alt="`Capa de ${currentItem.track.title}`"
        />
        <span v-else class="player-artwork player-artwork-empty">
          <Disc3 :size="42" aria-hidden="true" />
        </span>

        <div class="player-metadata">
          <strong>{{ currentItem.track.title }}</strong>
          <span>{{ currentItem.track.artists.join(', ') }}</span>
          <small> Pedido por {{ currentItem.requestedByDisplayName ?? 'Waves Web' }} </small>
        </div>
      </div>

      <div class="logical-progress" aria-label="Progresso lógico indeterminado">
        <span />
      </div>

      <button
        class="action-button w-full"
        type="button"
        :disabled="skipping"
        @click="$emit('skip')"
      >
        <LoaderCircle v-if="skipping" class="spinner" :size="19" aria-hidden="true" />
        <SkipForward v-else :size="19" aria-hidden="true" />
        {{ skipping ? 'PULANDO…' : 'PULAR FAIXA' }}
      </button>
    </div>

    <div v-else class="player-idle">
      <span class="idle-icon"><Music2 :size="32" aria-hidden="true" /></span>
      <div>
        <strong>Nenhuma música tocando</strong>
        <p>Adicione uma faixa para iniciar o player lógico.</p>
      </div>
    </div>

    <p v-if="error" class="player-error error-message">{{ error }}</p>
    <p class="phase-note">Áudio real e progresso chegam na fase 2.</p>
  </section>
</template>

<style scoped>
.player-panel {
  padding: 20px 18px 18px;
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(155deg, rgb(6 17 31 / 96%), rgb(9 20 38 / 96%) 62%, rgb(18 12 37 / 96%)),
    var(--color-background);
}

.player-heading,
.player-track,
.player-idle {
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
  box-shadow: 0 0 8px rgb(84 242 135 / 55%);
}

.player-content {
  display: grid;
  gap: 14px;
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
    0 12px 28px rgb(0 0 0 / 28%),
    0 0 22px rgb(98 199 255 / 11%);
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

.player-metadata strong {
  overflow: hidden;
  font-family: 'Geist Variable', sans-serif;
  font-size: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-metadata span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  width: 46%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-mint), var(--color-cyan), var(--color-violet));
  box-shadow: 0 0 8px rgb(98 199 255 / 55%);
  animation: logical-progress 2.8s ease-in-out infinite alternate;
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

.phase-note,
.player-error {
  margin: 12px 0 0;
  font-size: 10px;
  text-align: center;
}

.phase-note {
  color: var(--color-text-subtle);
}

@keyframes logical-progress {
  to {
    transform: translateX(116%);
  }
}

@media (min-width: 72rem) {
  .player-panel {
    min-height: 286px;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }

  .player-heading {
    margin-bottom: 14px;
  }

  .player-artwork {
    width: 150px;
    height: 150px;
  }

  .player-metadata strong {
    font-size: 23px;
  }

  .player-content {
    gap: 12px;
  }

  .player-track {
    align-items: stretch;
    gap: 16px;
  }

  .player-metadata {
    align-content: center;
  }

  .phase-note {
    display: none;
  }
}
</style>
