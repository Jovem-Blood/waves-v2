<script setup lang="ts">
import { useRuntimeConfig } from '#imports'
import type { TrackMetadata } from '@waves/shared'
import { LoaderCircle, Music2, Search, Sparkles } from '@lucide/vue'

import { useSpotifySearch } from '../composables/useSpotifySearch'
import TrackCard from './TrackCard.vue'

withDefaults(
  defineProps<{
    addingTrackId?: string
    addingPlacement?: 'end' | 'next'
    activeTrackIds?: string[]
  }>(),
  {
    addingTrackId: undefined,
    addingPlacement: undefined,
    activeTrackIds: () => [],
  },
)
defineEmits<{ add: [track: TrackMetadata]; playNext: [track: TrackMetadata] }>()

const config = useRuntimeConfig()
const search = useSpotifySearch(config.public.apiBase)
</script>

<template>
  <section class="search-panel" aria-labelledby="search-title">
    <div class="search-header">
      <div>
        <span class="eyebrow">DESCOBRIR</span>
        <h2 id="search-title">Buscar no Spotify</h2>
        <p>Adicione à fila ou escolha o que toca em seguida.</p>
      </div>
      <span class="provider-badge"><Music2 :size="14" /> Spotify</span>
    </div>

    <label class="search-input">
      <Search :size="19" aria-hidden="true" />
      <span class="sr-only">Buscar música no Spotify</span>
      <input
        id="spotify-search"
        v-model="search.query.value"
        name="spotify-search"
        type="search"
        placeholder="Música, artista ou álbum"
        autocomplete="off"
      />
      <LoaderCircle
        v-if="search.searching.value"
        class="spinner"
        :size="18"
        aria-label="Buscando"
      />
    </label>

    <div class="results-heading">
      <span>RESULTADOS</span>
      <small v-if="search.results.value.length">{{ search.results.value.length }} faixas</small>
    </div>

    <div v-if="search.error.value" class="search-state error-message">
      {{ search.error.value }}
    </div>
    <div v-else-if="!search.query.value.trim()" class="search-state">
      <Sparkles :size="24" aria-hidden="true" />
      Digite para encontrar a próxima música.
    </div>
    <div
      v-else-if="!search.searching.value && search.results.value.length === 0"
      class="search-state"
    >
      Nenhuma faixa encontrada.
    </div>
    <div v-else class="search-results" aria-live="polite">
      <TrackCard
        v-for="track in search.results.value"
        :key="track.id"
        :track="track"
        :adding="addingTrackId === track.id"
        :adding-placement="addingPlacement"
        :added="activeTrackIds.includes(track.id)"
        @add="$emit('add', $event)"
        @play-next="$emit('playNext', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.search-panel {
  padding: 20px 18px 24px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.search-header,
.provider-badge,
.search-input,
.results-heading {
  display: flex;
  align-items: center;
}

.search-header,
.results-heading {
  justify-content: space-between;
  gap: 12px;
}

h2 {
  margin: 3px 0 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 20px;
}

.search-header p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 10px;
}

.provider-badge {
  min-height: 28px;
  gap: 6px;
  border-radius: var(--radius-pill);
  padding: 0 10px;
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  font-size: 10px;
  font-weight: 700;
}

.search-input {
  min-height: 50px;
  gap: 10px;
  margin-top: 14px;
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-md);
  padding: 0 14px;
  color: var(--accent-primary);
  background: var(--surface-raised);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 4%, transparent);
}

.search-input:focus-within {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
}

.search-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font-size: 13px;
}

.search-input input::placeholder {
  color: var(--text-subtle);
}

.results-heading {
  min-height: 34px;
  color: var(--text-subtle);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  font-weight: 700;
}

.results-heading small {
  font-family: 'Inter Variable', sans-serif;
  font-size: 9px;
  font-weight: 500;
}

.search-results {
  display: grid;
  gap: 8px;
}

.search-state {
  display: grid;
  min-height: 86px;
  place-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 11px;
  text-align: center;
}

@media (min-width: 72rem) {
  .search-panel {
    height: fit-content;
    align-self: start;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
  }

  .search-panel h2 {
    font-size: 18px;
  }

  .search-results {
    gap: 10px;
  }
}
</style>
