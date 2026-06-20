import { trackMetadataSchema, type TrackMetadata } from '@waves/shared'
import { z } from 'zod'
import { onUnmounted, ref, watch } from 'vue'

const searchResultsSchema = z.array(trackMetadataSchema)
const DEBOUNCE_MS = 350

export function useSpotifySearch(apiBase: string) {
  const query = ref('')
  const results = ref<TrackMetadata[]>([])
  const searching = ref(false)
  const error = ref<string>()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  async function search(value: string) {
    controller?.abort()
    controller = new AbortController()
    const activeController = controller
    searching.value = true

    try {
      results.value = searchResultsSchema.parse(
        await $fetch(`${apiBase}/spotify/search`, {
          query: { q: value },
          signal: activeController.signal,
        }),
      )
      error.value = undefined
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      results.value = []
      error.value = 'Spotify indisponível. Tente novamente.'
    } finally {
      if (!activeController.signal.aborted) searching.value = false
    }
  }

  watch(query, (value) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    controller?.abort()
    searching.value = false
    error.value = undefined

    const normalized = value.trim()
    if (!normalized) {
      results.value = []
      return
    }

    searching.value = true
    debounceTimer = setTimeout(() => void search(normalized), DEBOUNCE_MS)
  })

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    controller?.abort()
  })

  return { query, results, searching, error }
}
