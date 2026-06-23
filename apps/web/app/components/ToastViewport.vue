<script setup lang="ts">
import { CheckCircle2, CircleAlert, X } from '@lucide/vue'

import { useToasts } from '../composables/useToasts'

const toasts = useToasts()

async function runAction(id: string, action: () => void | Promise<void>) {
  toasts.remove(id)
  await action()
}
</script>

<template>
  <div class="toast-viewport" aria-label="Notificações">
    <article
      v-for="toast in toasts.visible.value"
      :key="toast.id"
      class="toast"
      :data-tone="toast.tone"
      :role="toast.tone === 'error' ? 'alert' : 'status'"
      :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"
      @mouseenter="toasts.pause(toast.id)"
      @mouseleave="toasts.resume(toast.id)"
      @focusin="toasts.pause(toast.id)"
      @focusout="toasts.resume(toast.id)"
    >
      <CheckCircle2 v-if="toast.tone === 'success'" :size="19" aria-hidden="true" />
      <CircleAlert v-else :size="19" aria-hidden="true" />
      <span>{{ toast.message }}</span>
      <button
        v-if="toast.action"
        class="toast-action"
        type="button"
        @click="runAction(toast.id, toast.action.run)"
      >
        {{ toast.action.label }}
      </button>
      <button
        class="toast-close"
        type="button"
        aria-label="Fechar notificação"
        @click="toasts.remove(toast.id)"
      >
        <X :size="17" aria-hidden="true" />
      </button>
    </article>
  </div>
</template>

<style scoped>
.toast-viewport {
  position: fixed;
  z-index: 1200;
  right: 12px;
  bottom: 12px;
  left: 12px;
  display: grid;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: grid;
  min-height: 56px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--success) 32%, var(--border));
  border-radius: var(--radius-md);
  padding: 8px 8px 8px 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--surface-strong) 96%, transparent);
  box-shadow: 0 16px 40px rgb(0 0 0 / 42%);
  pointer-events: auto;
}

.toast[data-tone='success'] > svg {
  color: var(--success);
}

.toast[data-tone='error'] {
  border-color: color-mix(in srgb, var(--danger) 38%, var(--border));
}

.toast[data-tone='error'] > svg {
  color: var(--danger);
}

.toast span {
  font-size: 12px;
}

.toast-action,
.toast-close {
  min-height: 44px;
  border: 0;
  color: var(--accent-primary);
  background: transparent;
  font-weight: 700;
  cursor: pointer;
}

.toast-action {
  padding: 0 8px;
}

.toast-close {
  display: grid;
  width: 44px;
  place-items: center;
  color: var(--text-muted);
}

@media (min-width: 48rem) {
  .toast-viewport {
    top: 92px;
    right: 20px;
    bottom: auto;
    left: auto;
    width: min(390px, calc(100vw - 40px));
  }
}

@media (prefers-reduced-motion: no-preference) {
  .toast {
    animation: toast-in 160ms ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
}
</style>
