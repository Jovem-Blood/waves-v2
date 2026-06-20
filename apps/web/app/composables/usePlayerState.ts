import { playerStateSchema, queueSchema, type PlayerState, type Queue } from '@waves/shared'
import { z } from 'zod'
import { onMounted, onUnmounted, ref } from 'vue'

const POLLING_INTERVAL_MS = 2500
const skipResultSchema = z.strictObject({ player: playerStateSchema, queue: queueSchema })

export function usePlayerState(apiBase: string) {
  const state = ref<PlayerState>()
  const loading = ref(true)
  const skipping = ref(false)
  const mutating = ref(false)
  const error = ref<string>()
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let requestInFlight = false

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

  async function skip(): Promise<{ player: PlayerState; queue: Queue } | undefined> {
    skipping.value = true
    try {
      const result = skipResultSchema.parse(
        await $fetch(`${apiBase}/player/skip`, { method: 'POST' }),
      )
      state.value = result.player
      error.value = undefined
      return result
    } catch {
      error.value = 'Não foi possível pular a faixa.'
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
    } catch {
      error.value = action === 'pause' ? 'Não foi possível pausar.' : 'Não foi possível retomar.'
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
    } catch {
      error.value = 'Não foi possível ajustar o volume.'
    } finally {
      mutating.value = false
    }
  }

  onMounted(() => {
    void load()
    pollingTimer = setInterval(() => void load(), POLLING_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer)
  })

  return { state, loading, skipping, mutating, error, refresh: load, skip, control, setVolume }
}
