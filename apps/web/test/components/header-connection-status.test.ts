// @vitest-environment happy-dom

import type { OperationalStatus } from '@waves/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HeaderConnectionStatus from '../../app/components/HeaderConnectionStatus.vue'

const connectedStatus: OperationalStatus = {
  web: { status: 'available', checkedAt: '2026-06-22T12:00:00.000Z' },
  bot: { status: 'online', lastSeenAt: '2026-06-22T12:00:00.000Z' },
  voice: { status: 'connected', guildName: 'Waves', voiceChannelName: 'ondas-da-noite' },
}

describe('HeaderConnectionStatus', () => {
  it('renders independent web, bot and connected voice states', () => {
    const wrapper = mount(HeaderConnectionStatus, {
      props: { loading: false, webAvailable: true, status: connectedStatus },
    })

    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.text()).toContain('WEB DISPONÍVEL')
    expect(wrapper.text()).toContain('BOT ONLINE')
    expect(wrapper.text()).toContain('Waves · ondas-da-noite')
  })

  it('renders offline and reconnecting without fixed server data', async () => {
    const wrapper = mount(HeaderConnectionStatus, {
      props: {
        loading: false,
        webAvailable: false,
        status: {
          ...connectedStatus,
          bot: { status: 'offline' },
          voice: { status: 'disconnected' },
        },
      },
    })

    expect(wrapper.text()).toContain('WEB INDISPONÍVEL')
    expect(wrapper.text()).toContain('BOT OFFLINE')
    expect(wrapper.text()).toContain('CANAL DESCONECTADO')
    expect(wrapper.text()).not.toContain('ondas-da-noite')

    await wrapper.setProps({
      webAvailable: true,
      status: { ...connectedStatus, voice: { status: 'reconnecting' } },
    })
    expect(wrapper.text()).toContain('CANAL RECONECTANDO')
  })
})
