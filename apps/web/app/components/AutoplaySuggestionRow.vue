<script setup lang="ts">
import type { AutoplaySuggestion } from '@waves/shared'
import { LoaderCircle, Sparkles, X } from '@lucide/vue'

defineProps<{ suggestion: AutoplaySuggestion; rejecting?: boolean }>()
defineEmits<{ reject: [] }>()

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
      class="reject-button"
      :disabled="rejecting"
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
  grid-template-columns: 34px minmax(0, 1fr) 48px;
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
.reject-button {
  display: inline-grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}
.reject-button:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.reject-button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  opacity: 1;
}
.reject-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}
.reject-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (min-width: 72rem) {
  .autoplay-suggestion {
    grid-template-columns: 62px minmax(240px, 1fr) 164px 88px 112px 88px;
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
}
</style>
