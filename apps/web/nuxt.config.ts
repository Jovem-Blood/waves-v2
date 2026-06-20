import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  css: ['~/assets/css/main.css', '~/assets/css/themes.css'],
  compatibilityDate: '2026-06-18',
  devtools: {
    enabled: true,
  },
  future: {
    compatibilityVersion: 4,
  },
  runtimeConfig: {
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME ?? 'Waves',
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? '/api',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
