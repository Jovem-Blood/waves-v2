<script setup lang="ts">
import { LoaderCircle, LockKeyhole, Music2, X } from '@lucide/vue'
import {
  apiErrorSchema,
  clearQueueResultSchema,
  playlistImportResultSchema,
  playlistPreviewSchema,
  spotifyPlaylistUrlSchema,
  type PlaylistImportResult,
  type PlaylistPreview,
  type PlaylistSkippedItem,
  type Queue,
} from '@waves/shared'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useToasts } from '../composables/useToasts'

const props = defineProps<{ apiBase: string; items: Queue; disabled?: boolean }>()
const emit = defineEmits<{ updated: [queue: Queue] }>()
const toasts = useToasts()
const dialog = ref<HTMLDialogElement>()
const restrictedDialog = ref<HTMLDialogElement>()
let returnFocus: HTMLElement | undefined
const mode = ref<'import' | 'clear'>('import')
const open = ref(false)
const url = ref('')
const preview = ref<PlaylistPreview>()
const result = ref<PlaylistImportResult>()
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const previewAttempt = ref(0)
const restrictedInstructions = [
  '1. Abra a playlist no Spotify.',
  '2. Se ela for privada, torne-a pública, se desejar.',
  '3. Copie o link e tente importar novamente.',
].join('\n')
const upcomingCount = computed(() => props.items.filter((item) => item.status === 'queued').length)
const skipped = computed(() => result.value?.skipped ?? preview.value?.skipped ?? [])
const reasons: Record<PlaylistSkippedItem['reason'], string> = {
  unavailable: 'Indisponível no Spotify',
  local: 'Arquivo local',
  unsupported: 'Não é uma música',
  invalid: 'Metadados inválidos',
  duplicate: 'Já está na fila ou repetida na playlist',
}

function show(nextMode: 'import' | 'clear') {
  if (props.disabled || busy.value || (nextMode === 'clear' && !upcomingCount.value)) return
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  mode.value = nextMode
  url.value = ''
  preview.value = undefined
  result.value = undefined
  error.value = ''
  open.value = true
  dialog.value?.showModal()
  if (nextMode === 'import') {
    void nextTick(() => dialog.value?.querySelector('input')?.focus())
  }
}

function close() {
  if (busy.value) return
  open.value = false
  dialog.value?.close()
}

function errorCode(caught: unknown) {
  const parsed = apiErrorSchema.safeParse(
    typeof caught === 'object' && caught !== null && 'data' in caught ? caught.data : undefined,
  )
  return parsed.success ? parsed.data.data?.code : undefined
}

function showRestricted() {
  open.value = false
  dialog.value?.close()
  void nextTick(async () => {
    const animations = dialog.value?.getAnimations?.() ?? []
    await Promise.allSettled(animations.map((animation) => animation.finished))
    restrictedDialog.value?.showModal()
  })
}

function closeRestricted() {
  restrictedDialog.value?.close()
  returnFocus?.focus()
}

function message(caught: unknown) {
  if (errorCode(caught) === 'UNAUTHORIZED')
    return 'Identifique-se no painel para importar uma playlist.'
  return 'Não foi possível concluir a operação. Tente novamente.'
}

watch([url, open, previewAttempt], ([value, isOpen], _, onCleanup) => {
  if (!isOpen) {
    loading.value = false
    return
  }
  preview.value = undefined
  result.value = undefined
  error.value = ''
  loading.value = false
  if (mode.value !== 'import' || !value.trim()) return
  if (!spotifyPlaylistUrlSchema.safeParse(value).success) {
    error.value = 'Cole um link válido de playlist do Spotify (open.spotify.com/playlist/…).'
    return
  }
  loading.value = true
  let active = true
  const controller = new AbortController()
  const loadPreview = async () => {
    try {
      const data = await $fetch(`${props.apiBase}/spotify/playlist`, {
        method: 'POST',
        body: { url: value },
        signal: controller.signal,
      })
      if (active) preview.value = playlistPreviewSchema.parse(data)
    } catch (caught) {
      if (active) {
        if (errorCode(caught) === 'SPOTIFY_PLAYLIST_INACCESSIBLE') showRestricted()
        else error.value = message(caught)
      }
    } finally {
      if (active) loading.value = false
    }
  }
  const timer = setTimeout(() => {
    void loadPreview()
  }, 350)
  onCleanup(() => {
    active = false
    clearTimeout(timer)
    controller.abort()
  })
})

async function confirm() {
  if (busy.value || (mode.value === 'import' && (!preview.value || result.value))) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'import') {
      const imported = playlistImportResultSchema.parse(
        await $fetch(`${props.apiBase}/queue/import`, {
          method: 'POST',
          body: { url: url.value },
        }),
      )
      result.value = imported
      emit('updated', imported.queue)
      toasts.success(
        `${imported.imported} músicas importadas; ${imported.skipped.length} ignoradas.`,
      )
    } else {
      const cleared = clearQueueResultSchema.parse(
        await $fetch(`${props.apiBase}/queue/clear`, { method: 'POST' }),
      )
      emit('updated', cleared.queue)
      toasts.success(`${cleared.cleared} músicas removidas da fila.`)
      busy.value = false
      close()
    }
  } catch (caught) {
    if (errorCode(caught) === 'SPOTIFY_PLAYLIST_INACCESSIBLE') showRestricted()
    else {
      error.value = message(caught)
      toasts.error(error.value)
    }
  } finally {
    busy.value = false
  }
}

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  dialog.value?.close()
  restrictedDialog.value?.close()
})

defineExpose({ show, busy })
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="playlist-dialog"
      :class="{ expanded: !!preview }"
      aria-labelledby="playlist-dialog-title"
      @cancel.prevent="close"
      @close="open = false"
    >
      <div class="dialog-content" :aria-busy="busy || loading">
        <header>
          <h2 id="playlist-dialog-title">
            {{ mode === 'import' ? 'Importar playlist' : 'Limpar fila?' }}
          </h2>
          <button type="button" :disabled="busy" aria-label="Fechar" @click="close">
            <X :size="20" />
          </button>
        </header>
        <template v-if="mode === 'import'">
          <label for="playlist-url">Link da playlist no Spotify</label>
          <input
            id="playlist-url"
            v-model="url"
            type="url"
            placeholder="https://open.spotify.com/playlist/…"
            :disabled="busy || !!result"
            :readonly="loading"
            :aria-busy="loading"
            :aria-invalid="!!error"
            aria-describedby="playlist-help playlist-error"
            autocomplete="off"
          />
          <p id="playlist-help">
            As músicas serão adicionadas ao final da fila, na ordem da playlist. A reprodução atual
            continua.
          </p>
          <p v-if="loading" role="status">
            <LoaderCircle class="spinner" :size="18" aria-hidden="true" /> Carregando playlist…
          </p>
          <section v-if="preview" class="playlist-preview" aria-label="Prévia da playlist">
            <div class="playlist-meta">
              <img v-if="preview.coverUrl" :src="preview.coverUrl" alt="" class="playlist-cover" />
              <Music2 v-else class="playlist-cover" aria-hidden="true" />
              <div>
                <h3>{{ preview.name }}</h3>
                <p>{{ preview.owner }} · {{ preview.total }} músicas</p>
              </div>
            </div>
            <p v-if="preview.total === 0">Esta playlist está vazia.</p>
            <template v-else>
              <p>Prévia das primeiras 5 faixas</p>
              <ol class="preview-tracks">
                <li v-for="(track, index) in preview.tracks" :key="index">
                  <img v-if="track.coverUrl" :src="track.coverUrl" alt="" />
                  <Music2 v-else :size="40" aria-hidden="true" />
                  <div>
                    <strong>{{ track.title }}</strong
                    ><small>{{ track.artists.join(', ') }}</small>
                  </div>
                  <span>{{ duration(track.durationMs) }}</span>
                </li>
              </ol>
            </template>
          </section>
          <p v-if="result" class="import-result" role="status">
            {{ result.imported }} músicas importadas; {{ result.skipped.length }} ignoradas.
          </p>
          <details v-if="skipped.length" class="skipped-list" open>
            <summary>{{ skipped.length }} faixas ignoradas{{ result ? '' : ' na prévia' }}</summary>
            <ul>
              <li v-for="item in skipped" :key="item.position">
                {{ item.position }}. {{ item.title }} — {{ reasons[item.reason] }}
              </li>
            </ul>
          </details>
          <p v-if="preview && !result">
            Duplicatas, arquivos locais e faixas inválidas serão ignorados e listados ao concluir. O
            áudio será resolvido na reprodução.
          </p>
        </template>
        <template v-else>
          <p>Remover todas as {{ upcomingCount }} músicas que aguardam na fila?</p>
          <p>
            A música em reprodução continuará tocando. O autoplay mantém sua configuração atual.
          </p>
        </template>
        <p v-if="error" id="playlist-error" class="dialog-error" role="alert">{{ error }}</p>
        <button
          v-if="
            error &&
            mode === 'import' &&
            !preview &&
            spotifyPlaylistUrlSchema.safeParse(url).success
          "
          type="button"
          @click="previewAttempt++"
        >
          Tentar novamente
        </button>
        <footer>
          <button type="button" :disabled="busy" @click="close">
            {{ result ? 'Concluir' : 'Cancelar' }}
          </button>
          <button
            v-if="!result"
            type="button"
            :class="mode === 'clear' ? 'destructive' : 'primary'"
            :disabled="
              busy ||
              (mode === 'import' ? loading || !preview || preview.total === 0 : !upcomingCount)
            "
            @click="confirm"
          >
            <LoaderCircle v-if="busy" class="spinner" :size="17" aria-hidden="true" />
            {{
              busy
                ? mode === 'import'
                  ? 'Importando…'
                  : 'Limpando…'
                : mode === 'import'
                  ? 'Importar'
                  : 'Limpar fila'
            }}
          </button>
        </footer>
      </div>
    </dialog>
    <dialog
      ref="restrictedDialog"
      class="playlist-dialog restricted-dialog"
      aria-labelledby="restricted-playlist-title"
      aria-describedby="restricted-playlist-description"
      @cancel.prevent="closeRestricted"
    >
      <div class="dialog-content">
        <span class="restricted-icon" aria-hidden="true"
          ><LockKeyhole :size="26" :stroke-width="1.5"
        /></span>
        <h2 id="restricted-playlist-title">Playlist restrita</h2>
        <p id="restricted-playlist-description">
          O Spotify não permitiu acessar as músicas desta playlist. Ela pode estar
          <strong>privada</strong> ou ter acesso limitado para o Waves.
        </p>
        <code class="restricted-instructions">{{ restrictedInstructions }}</code>
        <hr />
        <p>
          Já é pública? Peça ao administrador do Waves para verificar as permissões da integração
          com o Spotify.
        </p>
        <footer>
          <button class="primary" type="button" @click="closeRestricted">Ok</button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--surface-strong);
  border-color: var(--accent-primary);
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
.playlist-dialog {
  width: min(440px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  background: var(--surface);
  box-shadow: 0 16px 48px rgb(0 0 0 / 50%);
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transition:
    width 180ms ease,
    opacity 180ms ease,
    transform 180ms ease,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}
.playlist-dialog[open] {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.playlist-dialog.expanded {
  width: min(580px, calc(100% - 32px));
}
.restricted-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--accent-secondary);
  background: var(--surface-raised);
}
.restricted-instructions {
  display: block;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.restricted-dialog footer button {
  min-width: 88px;
}
.playlist-dialog::backdrop {
  background: rgb(0 0 0 / 65%);
  opacity: 0;
  transition:
    opacity 180ms ease,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}
.playlist-dialog[open]::backdrop {
  opacity: 1;
}
@starting-style {
  .playlist-dialog[open] {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  .playlist-dialog[open]::backdrop {
    opacity: 0;
  }
}
.dialog-content {
  display: grid;
  gap: 14px;
  padding: 20px;
}
header,
footer {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: center;
}
header button {
  flex-shrink: 0;
  width: 48px;
  padding: 0;
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font-size: 20px;
}
h3 {
  font-size: 17px;
  overflow-wrap: anywhere;
}
p,
small {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}
label {
  font-size: 14px;
}
input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 50px;
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.playlist-preview {
  display: grid;
  gap: 14px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}
.playlist-meta {
  display: flex;
  align-items: center;
  gap: 14px;
}
.playlist-cover {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--radius-sm);
}
.preview-tracks {
  list-style: none;
  padding: 0;
  margin: 0;
}
.preview-tracks li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  border-bottom: 1px solid var(--border);
}
.preview-tracks img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-xs);
}
.preview-tracks li > div {
  flex: 1;
  min-width: 0;
}
.preview-tracks strong,
.preview-tracks small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-tracks strong {
  font-size: 14px;
}
.preview-tracks span {
  color: var(--text-muted);
  font-size: 12px;
}
.skipped-list {
  font-size: 13px;
  overflow-wrap: anywhere;
}
summary {
  cursor: pointer;
  min-height: 48px;
  align-content: center;
}
.skipped-list ul {
  max-height: 180px;
  overflow-y: auto;
  padding-left: 20px;
  color: var(--text-muted);
  line-height: 1.7;
}
.dialog-error {
  color: var(--danger);
}
.import-result {
  color: var(--success);
}
footer {
  flex-wrap: wrap;
  justify-content: flex-end;
  padding-top: 8px;
}
button.primary {
  background: var(--accent-primary);
  color: var(--on-accent, #04120b);
}
button.destructive {
  color: var(--danger);
  border-color: var(--danger);
}
button.primary:hover:not(:disabled) {
  background: var(--accent-primary);
  filter: brightness(1.1);
}
@media (max-width: 480px) {
  .dialog-content {
    padding: 16px;
  }
  footer button {
    flex: 1 1 auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .playlist-dialog,
  .playlist-dialog::backdrop {
    transition: none;
  }
}
</style>
