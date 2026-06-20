import { ref } from 'vue'

export type ThemeId = 'waves' | 'catppuccin' | 'neon' | 'nord' | 'dracula'

export interface ThemeMeta {
  id: ThemeId
  name: string
  colors: [string, string, string]
  favicon: {
    background: string
    primary: string
    secondary: string
  }
}

const THEME_STORAGE_KEY = 'waves-theme'

export const themes: ThemeMeta[] = [
  {
    id: 'waves',
    name: 'Waves',
    colors: ['#54f287', '#62c7ff', '#a879ff'],
    favicon: { background: '#06111f', primary: '#54f287', secondary: '#62c7ff' },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    colors: ['#a6e3a1', '#89dceb', '#cba6f7'],
    favicon: { background: '#1e1e2e', primary: '#a6e3a1', secondary: '#89dceb' },
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: ['#00ff88', '#00d4ff', '#cc44ff'],
    favicon: { background: '#0a0a0f', primary: '#00ff88', secondary: '#00d4ff' },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: ['#a3be8c', '#88c0d0', '#b48ead'],
    favicon: { background: '#2e3440', primary: '#a3be8c', secondary: '#88c0d0' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: ['#bd93f9', '#8be9fd', '#ff79c6'],
    favicon: { background: '#1e1f29', primary: '#bd93f9', secondary: '#8be9fd' },
  },
]

function getStoredTheme(): ThemeId {
  if (import.meta.client) {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && themes.some((t) => t.id === stored)) return stored as ThemeId
  }
  return 'waves'
}

function applyTheme(id: ThemeId) {
  const theme = themes.find((t) => t.id === id) ?? themes[0]!
  document.documentElement.dataset.theme = id
  setFavicon(theme.favicon)
  if (import.meta.client) localStorage.setItem(THEME_STORAGE_KEY, id)
}

export function useTheme() {
  const current = ref<ThemeId>(getStoredTheme())

  function setTheme(id: ThemeId) {
    current.value = id
    applyTheme(id)
  }

  if (import.meta.client) applyTheme(current.value)

  return { current, setTheme, themes }
}
