import { playbackHealthResponseSchema, type PlaybackHealthResponse } from '@waves/shared'
import { onMounted, ref } from 'vue'

export function usePlaybackHealth(apiBase: string) {
  const data = ref<PlaybackHealthResponse>()
  const loading = ref(true)
  const error = ref<string>()
  const days = ref<7 | 30>(30)
  const sourceProvider = ref('')
  const errorCode = ref('')
  let requestInFlight = false

  async function refresh() {
    if (requestInFlight) return
    requestInFlight = true
    loading.value = true
    error.value = undefined
    const to = new Date()
    const from = new Date(to.getTime() - days.value * 24 * 60 * 60 * 1000)
    try {
      data.value = playbackHealthResponseSchema.parse(
        await $fetch(`${apiBase}/playback-health`, {
          query: {
            from: from.toISOString(),
            to: to.toISOString(),
            ...(sourceProvider.value ? { sourceProvider: sourceProvider.value } : {}),
            ...(errorCode.value ? { errorCode: errorCode.value } : {}),
          },
        }),
      )
    } catch {
      error.value = 'Não foi possível carregar a saúde do playback.'
    } finally {
      requestInFlight = false
      loading.value = false
    }
  }

  function setDays(value: string) {
    days.value = value === '7' ? 7 : 30
    void refresh()
  }

  function setSourceProvider(value: string) {
    sourceProvider.value = value
    void refresh()
  }

  function setErrorCode(value: string) {
    errorCode.value = value
    void refresh()
  }

  onMounted(() => void refresh())

  return {
    data,
    loading,
    error,
    days,
    sourceProvider,
    errorCode,
    refresh,
    setDays,
    setSourceProvider,
    setErrorCode,
  }
}
