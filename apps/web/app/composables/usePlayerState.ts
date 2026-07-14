import { playerStateSchema, queueSchema, type PlayerState, type Queue } from '@waves/shared'
import { z } from 'zod'
import { onMounted, onUnmounted, ref } from 'vue'
import { useToasts } from './useToasts'

const POLLING_INTERVAL_MS = 2500
const skipResultSchema = z.strictObject({ player: playerStateSchema, queue: queueSchema })

export function usePlayerState(apiBase: string) {
  const toasts = useToasts()
  const state = ref<PlayerState>()
  const loading = ref(true)
  const skipping = ref(false)
  const mutating = ref(false)
  const error = ref<string>()
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let requestInFlight = false
  let mounted = false
  let realtimeConnected = false

  async function load() {
    if (requestInFlight) return
    requestInFlight = true
    try {
      state.value = playerStateSchema.parse(await $fetch(`${apiBase}/player`))
      error.value = undefined
    } catch {
      error.value = 'O estado do player está indisponível.'
    } finally {
      loading.value = false
      requestInFlight = false
    }
  }

  function replace(player: PlayerState) {
    state.value = playerStateSchema.parse(player)
    error.value = undefined
    loading.value = false
  }

  function startPolling() {
    if (!mounted || realtimeConnected || pollingTimer) return
    pollingTimer = setInterval(() => void load(), POLLING_INTERVAL_MS)
  }

  function stopPolling() {
    if (!pollingTimer) return
    clearInterval(pollingTimer)
    pollingTimer = undefined
  }

  function setRealtimeConnected(connected: boolean) {
    if (realtimeConnected === connected) return
    realtimeConnected = connected
    if (connected) {
      stopPolling()
      return
    }
    startPolling()
    void load()
  }

  async function skip(): Promise<{ player: PlayerState; queue: Queue } | undefined> {
    skipping.value = true
    try {
      const result = skipResultSchema.parse(
        await $fetch(`${apiBase}/player/skip`, { method: 'POST' }),
      )
      state.value = result.player
      error.value = undefined
      toasts.success('Faixa pulada.')
      return result
    } catch {
      toasts.error('Não foi possível pular a faixa.')
      return undefined
    } finally {
      skipping.value = false
    }
  }

  async function control(action: 'pause' | 'resume') {
    mutating.value = true
    try {
      state.value = playerStateSchema.parse(
        await $fetch(`${apiBase}/player/${action}`, { method: 'POST' }),
      )
      error.value = undefined
      toasts.success(action === 'pause' ? 'Reprodução pausada.' : 'Reprodução retomada.')
    } catch {
      toasts.error(action === 'pause' ? 'Não foi possível pausar.' : 'Não foi possível retomar.')
    } finally {
      mutating.value = false
    }
  }

  async function setVolume(volume: number) {
    mutating.value = true
    try {
      state.value = playerStateSchema.parse(
        await $fetch(`${apiBase}/player/volume`, { method: 'POST', body: { volume } }),
      )
      error.value = undefined
      toasts.success(`Volume ajustado para ${volume}%.`)
    } catch {
      toasts.error('Não foi possível ajustar o volume.')
    } finally {
      mutating.value = false
    }
  }

  onMounted(() => {
    mounted = true
    void load()
    startPolling()
  })

  onUnmounted(() => {
    mounted = false
    stopPolling()
  })

  return {
    state,
    loading,
    skipping,
    mutating,
    error,
    refresh: load,
    replace,
    skip,
    control,
    setVolume,
    setRealtimeConnected,
  }
}
