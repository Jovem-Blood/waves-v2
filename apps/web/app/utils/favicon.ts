interface FaviconTheme {
  background: string
  primary: string
  secondary?: string
}

const fallbackFaviconTheme: FaviconTheme = {
  background: '#06111f',
  primary: '#54f287',
  secondary: '#62c7ff',
}

export function createFaviconDataUrl(theme: FaviconTheme): string {
  const colors = { ...fallbackFaviconTheme, ...theme }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`,
    `<rect width="24" height="24" rx="6" fill="${colors.background}"/>`,
    `<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" fill="none" stroke="${colors.primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    colors.secondary ? `<circle cx="18.5" cy="18.5" r="2.2" fill="${colors.secondary}"/>` : '',
    `</svg>`,
  ].join('')

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function setFavicon(theme: FaviconTheme): void {
  if (!import.meta.client) return

  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")

  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }

  link.href = createFaviconDataUrl(theme)
}
