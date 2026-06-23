import { operationalStatusSchema, type OperationalStatus } from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'

const POLLING_INTERVAL_MS = 2_500

export function useOperationalStatus(apiBase: string) {
  const status = ref<OperationalStatus>()
  const loading = ref(true)
  const webAvailable = ref(false)
  let requestInFlight = false
  let pollingTimer: ReturnType<typeof setInterval> | undefined

  async function load() {
    if (requestInFlight) return
    requestInFlight = true
    try {
      status.value = operationalStatusSchema.parse(await $fetch(`${apiBase}/status`))
      webAvailable.value = true
    } catch {
      webAvailable.value = false
    } finally {
      loading.value = false
      requestInFlight = false
    }
  }

  onMounted(() => {
    void load()
    pollingTimer = setInterval(() => void load(), POLLING_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer)
  })

  return { status, loading, webAvailable, refresh: load }
}
