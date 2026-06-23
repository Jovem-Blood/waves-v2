<script setup lang="ts">
import type { TrackMetadata } from '@waves/shared'
import { Check, Disc3, ExternalLink, ListPlus, LoaderCircle, Play } from '@lucide/vue'

defineProps<{
  track: TrackMetadata
  adding: boolean
  addingPlacement?: 'end' | 'next'
  added: boolean
}>()
defineEmits<{ add: [track: TrackMetadata]; playNext: [track: TrackMetadata] }>()

function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <article class="track-card">
    <img v-if="track.coverUrl" :src="track.coverUrl" :alt="`Capa de ${track.title}`" />
    <span v-else class="track-cover-empty"><Disc3 :size="22" aria-hidden="true" /></span>
    <div class="track-copy">
      <strong>{{ track.title }}</strong>
      <span>{{ track.artists.join(', ') }}</span>
      <small v-if="track.albumName">{{ track.albumName }}</small>
      <div class="track-links">
        <small>{{ formatDuration(track.durationMs) }}</small>
        <a
          v-if="track.externalUrl"
          :href="track.externalUrl"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Abrir ${track.title} no Spotify`"
        >
          Spotify <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </div>
    </div>
    <div class="track-actions">
      <button
        class="add-button"
        type="button"
        :disabled="adding || added"
        :aria-label="added ? `${track.title} já está na fila` : `Adicionar ${track.title} à fila`"
        @click="$emit('add', track)"
      >
        <Check v-if="added" class="check-icon" :size="18" aria-hidden="true" />
        <LoaderCircle
          v-else-if="adding && addingPlacement === 'end'"
          class="spinner"
          :size="18"
          aria-hidden="true"
        />
        <ListPlus v-else :size="19" aria-hidden="true" />
      </button>
      <button
        class="add-button next-button"
        type="button"
        :disabled="adding || added"
        :aria-label="`Tocar ${track.title} em seguida`"
        @click="$emit('playNext', track)"
      >
        <LoaderCircle
          v-if="adding && addingPlacement === 'next'"
          class="spinner"
          :size="18"
          aria-hidden="true"
        />
        <Play v-else :size="18" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.track-card {
  display: grid;
  min-height: 78px;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: var(--surface-raised);
}

.track-card img,
.track-cover-empty {
  width: 52px;
  height: 52px;
  border-radius: 6px;
}

.track-card img {
  object-fit: cover;
}

.track-cover-empty {
  display: grid;
  place-items: center;
  color: var(--text-subtle);
  background: var(--surface-strong);
}

.track-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.track-copy strong,
.track-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-copy strong {
  font-size: 12px;
}

.track-copy span,
.track-copy small {
  color: var(--text-muted);
  font-size: 9px;
}

.track-links,
.track-links a,
.track-actions {
  display: flex;
  align-items: center;
}

.track-links {
  gap: 10px;
}

.track-links a {
  gap: 3px;
  color: var(--accent-secondary);
  font-size: 9px;
  text-decoration: none;
}

.track-links a:hover {
  text-decoration: underline;
}

.track-actions {
  gap: 4px;
}

.track-copy small {
  font-family: 'Geist Mono Variable', monospace;
}

.next-button {
  color: var(--accent-secondary);
  border-color: color-mix(in srgb, var(--accent-secondary) 28%, transparent);
  background: color-mix(in srgb, var(--accent-secondary) 6%, transparent);
}

.add-button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.add-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.add-button:disabled .check-icon {
  opacity: 0.7;
}
</style>
