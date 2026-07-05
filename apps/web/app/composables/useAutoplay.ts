import { autoplayStateSchema, type AutoplayState } from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'

import { useToasts } from './useToasts'

const POLLING_INTERVAL_MS = 2500

export function useAutoplay(apiBase: string) {
  const toasts = useToasts()
  const state = ref<AutoplayState>()
  const loading = ref(true)
  const updating = ref(false)
  const rejecting = ref(false)
  const error = ref<string>()
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let requestInFlight = false

  async function load() {
    if (requestInFlight || updating.value) return
    requestInFlight = true
    try {
      state.value = autoplayStateSchema.parse(await $fetch(`${apiBase}/autoplay`))
      error.value = undefined
    } catch {
      error.value = 'Não foi possível atualizar o autoplay.'
    } finally {
      requestInFlight = false
      loading.value = false
    }
  }

  async function setEnabled(enabled: boolean) {
    updating.value = true
    try {
      state.value = autoplayStateSchema.parse(
        await $fetch(`${apiBase}/autoplay`, { method: 'PUT', body: { enabled } }),
      )
      error.value = undefined
      toasts.success(enabled ? 'Autoplay ativado.' : 'Autoplay desativado.')
    } catch {
      toasts.error('Não foi possível alterar o autoplay.')
    } finally {
      updating.value = false
    }
  }

  async function rejectSuggestion() {
    rejecting.value = true
    try {
      state.value = autoplayStateSchema.parse(
        await $fetch(`${apiBase}/autoplay/suggestion`, { method: 'DELETE' }),
      )
      error.value = undefined
      toasts.success('Sugestão rejeitada.')
    } catch {
      toasts.error('Não foi possível rejeitar a sugestão.')
    } finally {
      rejecting.value = false
    }
  }

  onMounted(() => {
    void load()
    pollingTimer = setInterval(() => void load(), POLLING_INTERVAL_MS)
  })
  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer)
  })

  return { state, loading, updating, rejecting, error, setEnabled, rejectSuggestion }
}
