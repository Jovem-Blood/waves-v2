import { playerStateSchema, queueSchema, type PlayerState, type Queue } from '@waves/shared'
import { z } from 'zod'
import { onMounted, onUnmounted, ref } from 'vue'

const POLLING_INTERVAL_MS = 2500
const skipResultSchema = z.strictObject({ player: playerStateSchema, queue: queueSchema })

export function usePlayerState(apiBase: string) {
  const state = ref<PlayerState>()
  const loading = ref(true)
  const skipping = ref(false)
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

  onMounted(() => {
    void load()
    pollingTimer = setInterval(() => void load(), POLLING_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer)
  })

  return { state, loading, skipping, error, refresh: load, skip }
}
