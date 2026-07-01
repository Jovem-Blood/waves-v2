<script setup lang="ts">
import { LoaderCircle, UserRound } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  submitting: boolean
  error?: string
}>()

const emit = defineEmits<{ submit: [displayName: string] }>()

const displayName = ref('')
const touched = ref(false)
const trimmedName = computed(() => displayName.value.trim())
const localError = computed(() => {
  if (!touched.value) return props.error
  if (trimmedName.value.length === 0) return 'Informe um nome para continuar.'
  if (trimmedName.value.length > 40) return 'Use até 40 caracteres.'
  return props.error
})

watch(
  () => props.open,
  (open) => {
    if (open) touched.value = false
  },
)

function submit() {
  touched.value = true
  if (trimmedName.value.length === 0 || trimmedName.value.length > 40 || props.submitting) return
  emit('submit', trimmedName.value)
}
</script>

<template>
  <div v-if="open" class="guest-gate" role="presentation">
    <form class="guest-dialog" aria-labelledby="guest-title" @submit.prevent="submit">
      <span class="guest-icon" aria-hidden="true"><UserRound :size="22" /></span>
      <div>
        <span class="eyebrow">IDENTIDADE DA FILA</span>
        <h2 id="guest-title">Como devemos te chamar?</h2>
        <p>Esse nome vai aparecer na fila quando você pedir músicas.</p>
      </div>

      <label>
        <span>Nome</span>
        <input
          v-model="displayName"
          type="text"
          maxlength="40"
          autocomplete="nickname"
          :disabled="submitting"
          required
          autofocus
        />
      </label>

      <p v-if="localError" class="guest-error error-message" role="alert">{{ localError }}</p>

      <button
        class="action-button"
        type="submit"
        :disabled="submitting || trimmedName.length === 0"
      >
        <LoaderCircle v-if="submitting" class="spinner" :size="18" aria-hidden="true" />
        {{ submitting ? 'Entrando...' : 'Entrar na fila' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.guest-gate {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: color-mix(in srgb, var(--background) 82%, transparent);
  backdrop-filter: blur(18px);
}

.guest-dialog {
  display: grid;
  width: min(100%, 420px);
  gap: 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: 20px;
  background:
    linear-gradient(
      155deg,
      color-mix(in srgb, var(--accent-primary) 8%, transparent),
      color-mix(in srgb, var(--accent-tertiary) 7%, transparent)
    ),
    var(--surface-raised);
  box-shadow: 0 24px 80px rgb(0 0 0 / 42%);
}

.guest-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 32%, transparent);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
}

h2 {
  margin: 4px 0 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 24px;
}

p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

label {
  display: grid;
  gap: 7px;
  color: var(--text-muted);
  font-size: 11px;
}

label span {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}

input {
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 13px;
  color: var(--text);
  background: var(--surface);
}

input:disabled {
  opacity: 0.6;
}

.guest-error {
  margin: 0;
  font-size: 11px;
}
</style>
