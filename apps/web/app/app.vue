<script setup lang="ts">
import { useHead, useRequestURL, useSeoMeta } from '#imports'

const siteTitle = 'Waves — Painel de música para Discord'
const siteDescription =
  'Controle a fila e o player de música do seu servidor Discord em um painel privado, colaborativo e mobile-first.'
const requestUrl = useRequestURL()
const pageUrl = new URL(requestUrl.pathname, requestUrl.origin).href
const socialImageUrl = new URL('/images/waves-banner.png', requestUrl.origin).href

useSeoMeta({
  title: siteTitle,
  description: siteDescription,
  ogTitle: siteTitle,
  ogDescription: siteDescription,
  ogType: 'website',
  ogUrl: pageUrl,
  ogSiteName: 'Waves',
  ogLocale: 'pt_BR',
  ogImage: socialImageUrl,
  ogImageAlt: 'Waves — painel de música para Discord com waveform neon',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: 'summary_large_image',
  twitterTitle: siteTitle,
  twitterDescription: siteDescription,
  twitterImage: socialImageUrl,
  twitterImageAlt: 'Waves — painel de música para Discord com waveform neon',
})

useHead({
  htmlAttrs: { lang: 'pt-BR' },
  link: [{ rel: 'canonical', href: pageUrl }],
  meta: [{ name: 'theme-color', content: '#06111f' }],
})
</script>

<template>
  <NuxtPage />
</template>
