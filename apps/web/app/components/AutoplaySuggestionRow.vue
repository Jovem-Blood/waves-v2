<script setup lang="ts">
import type { AutoplaySuggestion } from '@waves/shared'
import { LoaderCircle, Plus, Sparkles, X } from '@lucide/vue'

defineProps<{ suggestion: AutoplaySuggestion; rejecting?: boolean; committing?: boolean }>()
defineEmits<{ commit: []; reject: [] }>()

function duration(durationMs: number) {
  const seconds = Math.round(durationMs / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <article class="autoplay-suggestion" aria-label="Sugestão do autoplay">
    <span class="suggestion-icon" aria-hidden="true"><Sparkles :size="16" /></span>
    <div class="suggestion-track">
      <strong>{{ suggestion.track.title }}</strong>
      <span>{{ suggestion.track.artists.join(', ') }}</span>
      <small>Sugestão do autoplay</small>
    </div>
    <span class="suggestion-requester">Autoplay</span>
    <span class="suggestion-duration">{{ duration(suggestion.track.durationMs) }}</span>
    <span class="suggestion-state">SUGESTÃO</span>
    <button
      type="button"
      class="commit-button"
      :disabled="committing || rejecting"
      :aria-label="`Adicionar sugestão ${suggestion.track.title} à fila`"
      @click="$emit('commit')"
    >
      <LoaderCircle v-if="committing" class="spinner" :size="17" aria-hidden="true" />
      <Plus v-else :size="17" aria-hidden="true" />
      <span>Manter</span>
    </button>
    <button
      type="button"
      class="reject-button"
      :disabled="rejecting || committing"
      :aria-label="`Rejeitar sugestão ${suggestion.track.title}`"
      @click="$emit('reject')"
    >
      <LoaderCircle v-if="rejecting" class="spinner" :size="17" aria-hidden="true" />
      <X v-else :size="17" aria-hidden="true" />
    </button>
  </article>
</template>

<style scoped>
.autoplay-suggestion {
  display: grid;
  min-height: 68px;
  grid-template-columns: 34px minmax(0, 1fr) 96px 48px;
  align-items: center;
  gap: 9px;
  border-top: 1px dashed var(--border-strong);
  padding: 8px 10px;
  background: color-mix(in srgb, var(--accent-secondary) 5%, var(--surface-raised));
  opacity: 0.64;
}

.suggestion-icon {
  color: var(--accent-secondary);
}
.suggestion-track {
  min-width: 0;
}
.suggestion-track strong,
.suggestion-track span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.suggestion-track strong {
  font-size: 12px;
}
.suggestion-track span {
  color: var(--text-muted);
  font-size: 10px;
}
.suggestion-track small,
.suggestion-state {
  color: var(--accent-secondary);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
}
.suggestion-requester,
.suggestion-duration,
.suggestion-state {
  display: none;
}
.commit-button,
.reject-button {
  display: inline-grid;
  height: 48px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.commit-button {
  grid-template-columns: auto auto;
  gap: 5px;
  border-color: color-mix(in srgb, var(--accent-primary) 24%, transparent);
  color: var(--accent-primary);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
}

.reject-button {
  width: 48px;
}

.commit-button:hover:not(:disabled) {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
}

.commit-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--accent-primary) 16%, transparent);
}

.reject-button:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.commit-button:focus-visible,
.reject-button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  opacity: 1;
}
.reject-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}
.commit-button:disabled,
.reject-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (min-width: 72rem) {
  .autoplay-suggestion {
    grid-template-columns: 62px minmax(240px, 1fr) 164px 88px 112px 88px 52px;
    gap: 0;
    padding: 0;
  }
  .autoplay-suggestion > * {
    padding: 0 10px;
  }
  .suggestion-requester,
  .suggestion-duration,
  .suggestion-state {
    display: block;
    color: var(--text-muted);
    font-size: 10px;
  }
  .suggestion-state {
    color: var(--accent-secondary);
  }
  .reject-button {
    width: 48px;
    height: 48px;
    justify-self: center;
    padding: 0;
    opacity: 0.65;
  }
  .commit-button {
    width: 76px;
    height: 34px;
    justify-self: center;
    padding: 0;
  }
}
</style>
