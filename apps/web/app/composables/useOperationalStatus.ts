import { operationalStatusSchema, type OperationalStatus } from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'

const POLLING_INTERVAL_MS = 2_500
const REALTIME_BACKUP_POLLING_INTERVAL_MS = 15_000

export function useOperationalStatus(apiBase: string) {
  const status = ref<OperationalStatus>()
  const loading = ref(true)
  const webAvailable = ref(false)
  let requestInFlight = false
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let mounted = false
  let realtimeConnected = false

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

  function replace(nextStatus: OperationalStatus) {
    status.value = operationalStatusSchema.parse(nextStatus)
    webAvailable.value = true
    loading.value = false
  }

  function startPolling() {
    if (!mounted || pollingTimer) return
    pollingTimer = setInterval(
      () => void load(),
      realtimeConnected ? REALTIME_BACKUP_POLLING_INTERVAL_MS : POLLING_INTERVAL_MS,
    )
  }

  function stopPolling() {
    if (!pollingTimer) return
    clearInterval(pollingTimer)
    pollingTimer = undefined
  }

  function setRealtimeConnected(connected: boolean) {
    if (realtimeConnected === connected) return
    realtimeConnected = connected
    stopPolling()
    startPolling()
    if (!connected) void load()
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

  return { status, loading, webAvailable, refresh: load, replace, setRealtimeConnected }
}
