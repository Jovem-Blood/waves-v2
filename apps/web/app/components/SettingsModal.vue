<script setup lang="ts">
import { Settings } from '@lucide/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { themes, useTheme, type ThemeId } from '../composables/useTheme'

defineProps<{
  isOnline: boolean
}>()

const { current, setTheme } = useTheme()
const open = ref(false)

function toggle() {
  open.value = !open.value
}

function select(id: ThemeId) {
  setTheme(id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="settings-trigger">
    <button class="gear-button" type="button" aria-label="Configurações" @click="toggle">
      <Settings :size="18" />
    </button>

    <Teleport to="body">
      <div v-if="open" class="modal-backdrop" @click.self="open = false">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Configurações">
          <div class="modal-header">
            <h2 class="modal-title">Configurações</h2>
            <button class="modal-close" type="button" aria-label="Fechar" @click="open = false">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          <div class="modal-body">
            <!-- Canal de voz e servidor entrarão aqui quando implementados -->
            <span class="settings-label">Status</span>
            <div class="status-card" :data-online="isOnline">
              <span class="status-dot" aria-hidden="true" />
              <span>{{ isOnline ? 'Bot online' : 'Bot offline' }}</span>
            </div>

            <span class="settings-label">Tema</span>
            <div class="theme-grid" role="listbox" aria-label="Selecionar tema">
              <button
                v-for="t in themes"
                :key="t.id"
                class="theme-card"
                :class="{ active: current === t.id }"
                role="option"
                :aria-selected="current === t.id"
                @click="select(t.id)"
              >
                <span class="swatches">
                  <span v-for="c in t.colors" :key="c" class="swatch" :style="{ background: c }" />
                </span>
                <span class="theme-name">{{ t.name }}</span>
                <span v-if="current === t.id" class="theme-check" aria-hidden="true">✓</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gear-button {
  display: inline-grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.gear-button:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 75%, transparent);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 60%);
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 380px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: 0 16px 48px rgb(0 0 0 / 50%);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 0;
}

.modal-title {
  margin: 0;
  font-family: 'Geist Variable', sans-serif;
  font-size: 18px;
  font-weight: 650;
}

.modal-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.modal-close:hover {
  color: var(--text);
  background: var(--surface-strong);
}

.modal-body {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.settings-label {
  color: var(--text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.theme-grid {
  display: grid;
  gap: 6px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  color: var(--text-muted);
  background: var(--surface-raised);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.theme-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-strong);
  color: var(--text);
}

.theme-card.active {
  border-color: var(--accent-primary);
  color: var(--text);
}

.swatches {
  display: flex;
  gap: 4px;
  flex: none;
}

.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex: none;
}

.theme-name {
  flex: 1;
  font-family: 'Geist Variable', sans-serif;
  font-weight: 500;
}

.theme-check {
  color: var(--accent-primary);
  font-family: 'Geist Mono Variable', monospace;
  font-weight: 700;
  font-size: 14px;
  flex: none;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
  border-radius: var(--radius-sm);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 7%, transparent);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  font-weight: 600;
}

.status-card[data-online='true'] {
  border-color: color-mix(in srgb, var(--success) 28%, transparent);
  color: var(--success);
  background: color-mix(in srgb, var(--success) 7%, transparent);
}

.status-card .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  box-shadow: 0 0 8px currentColor;
  flex: none;
}

.status-card[data-online='true'] .status-dot {
  background: var(--success);
}
</style>
