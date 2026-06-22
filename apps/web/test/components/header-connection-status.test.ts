// @vitest-environment happy-dom

import type { PlayerState } from '@waves/shared'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import HeaderConnectionStatus from '../../app/components/HeaderConnectionStatus.vue'

const connectedPlayer: PlayerState = {
  status: 'idle',
  guildId: 'guild-1',
  guildName: 'Waves',
  voiceChannelId: 'voice-1',
  voiceChannelName: 'ondas-da-noite',
  updatedAt: '2026-06-22T12:00:00.000Z',
}

describe('HeaderConnectionStatus', () => {
  it('renders loading, connected, disconnected and unavailable states', async () => {
    const wrapper = mount(HeaderConnectionStatus, {
      props: { loading: true },
    })

    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.attributes('data-state')).toBe('loading')
    expect(wrapper.text()).toContain('Carregando…')

    await wrapper.setProps({ loading: false, player: connectedPlayer })
    expect(wrapper.attributes('data-state')).toBe('connected')
    expect(wrapper.text()).toContain('Waves')
    expect(wrapper.text()).toContain('ondas-da-noite')

    await wrapper.setProps({ player: undefined })
    expect(wrapper.attributes('data-state')).toBe('disconnected')
    expect(wrapper.text()).toContain('Desconectado')

    await wrapper.setProps({ error: 'O estado do player está indisponível.' })
    expect(wrapper.attributes('data-state')).toBe('unavailable')
    expect(wrapper.text()).toContain('Status indisponível')
  })

  it('does not expose IDs when migrated connection names are missing', () => {
    const wrapper = mount(HeaderConnectionStatus, {
      props: {
        loading: false,
        player: {
          status: 'idle',
          guildId: 'guild-secret-id',
          voiceChannelId: 'voice-secret-id',
          updatedAt: '2026-06-22T12:00:00.000Z',
        },
      },
    })

    expect(wrapper.attributes('data-state')).toBe('unavailable')
    expect(wrapper.text()).toContain('Status indisponível')
    expect(wrapper.text()).not.toContain('guild-secret-id')
    expect(wrapper.text()).not.toContain('voice-secret-id')
  })

  it('preserves full long names in title attributes', () => {
    const longGuildName = 'Servidor com um nome muito longo para o cabeçalho operacional'
    const longChannelName = 'canal-de-voz-com-um-nome-muito-longo'
    const wrapper = mount(HeaderConnectionStatus, {
      props: {
        loading: false,
        player: {
          ...connectedPlayer,
          guildName: longGuildName,
          voiceChannelName: longChannelName,
        },
      },
    })

    const values = wrapper.findAll('.header-context strong')
    expect(values[0]?.attributes('title')).toBe(longGuildName)
    expect(values[1]?.attributes('title')).toBe(longChannelName)
  })
})
