<script setup lang="ts">
import { Download, EllipsisVertical, LoaderCircle, RefreshCw, Sparkles, Trash2 } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{
  autoplayEnabled: boolean
  autoplayBusy?: boolean
  refreshing: boolean
  actionsDisabled?: boolean
  canClear: boolean
}>()
const emit = defineEmits<{ select: [action: 'autoplay' | 'import' | 'refresh' | 'clear'] }>()
const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const menuId = useId()

function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function buttons() {
  return [...(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
}

function show(last = false) {
  open.value = true
  void nextTick(() => {
    const items = buttons()
    ;(last ? items.at(-1) : items[0])?.focus()
  })
}

function select(action: 'autoplay' | 'import' | 'refresh' | 'clear') {
  close(true)
  emit('select', action)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
  } else if (event.key === 'Tab') close(true)
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const items = buttons()
    const index = items.findIndex((item) => item === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
}

function dismissOutside(event: Event) {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) close()
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissOutside)
  document.addEventListener('focusin', dismissOutside)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissOutside)
  document.removeEventListener('focusin', dismissOutside)
})
</script>

<template>
  <div ref="root" class="queue-options">
    <button
      ref="trigger"
      class="options-trigger"
      type="button"
      aria-label="Opções da fila"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="open ? close(true) : show()"
      @keydown.down.prevent="show()"
      @keydown.up.prevent="show(true)"
      @keydown.esc.prevent="close(true)"
    >
      <EllipsisVertical :size="22" :stroke-width="1.5" aria-hidden="true" />
    </button>
    <Transition name="queue-menu">
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        class="options-menu"
        role="menu"
        aria-label="Opções da fila"
        @keydown="onKeydown"
      >
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="autoplayBusy"
          @click="select('autoplay')"
        >
          <span>{{ autoplayEnabled ? 'Desativar autoplay' : 'Ativar autoplay' }}</span>
          <LoaderCircle v-if="autoplayBusy" class="spinner" :size="18" aria-hidden="true" />
          <Sparkles v-else :size="18" :stroke-width="1.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="actionsDisabled"
          @click="select('import')"
        >
          <span>Importar</span><Download :size="18" :stroke-width="1.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="refreshing"
          @click="select('refresh')"
        >
          <span>Recarregar</span
          ><RefreshCw
            :class="{ spinner: refreshing }"
            :size="18"
            :stroke-width="1.5"
            aria-hidden="true"
          />
        </button>
        <button
          class="clear-option"
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="actionsDisabled || !canClear"
          @click="select('clear')"
        >
          <span>Limpar</span><Trash2 :size="18" :stroke-width="1.5" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.queue-options {
  position: relative;
  flex: none;
  align-self: flex-start;
}
.options-trigger {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}
.options-trigger:hover,
.options-trigger[aria-expanded='true'] {
  color: var(--text);
  background: var(--surface-strong);
}
button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
button:active:not(:disabled) {
  background: var(--surface-active);
}
.options-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 25;
  width: min(248px, calc(100vw - 36px));
  padding: 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-strong);
  box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
  transform-origin: top right;
}
.options-menu button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 48px;
  padding: 12px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.options-menu button:hover:not(:disabled),
.options-menu button:focus-visible {
  background: var(--surface-active);
}
.options-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.options-menu svg {
  flex: none;
}
.options-menu .clear-option {
  color: var(--danger);
}
.queue-menu-enter-active,
.queue-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.queue-menu-enter-from,
.queue-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.queue-menu-leave-active {
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .queue-menu-enter-active,
  .queue-menu-leave-active,
  .options-trigger {
    transition: none;
  }
}
</style>
