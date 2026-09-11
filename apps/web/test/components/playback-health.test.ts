// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { playbackHealthResponseSchema } from '@waves/shared'
import PlaybackHealthPanel from '../../app/components/PlaybackHealthPanel.vue'

const props = { loading: false, days: 30 as const, sourceProvider: '', errorCode: '' }
const data = playbackHealthResponseSchema.parse({
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' },
  summary: {
    plays: 2,
    successes: 1,
    failures: 1,
    cancelled: 0,
    retries: 1,
    successRate: 0.5,
    incomplete: 1,
    stale: 0,
    orphaned: 0,
    recoveredRetries: 1,
  },
  providers: [
    {
      sourceProvider: 'youtube_music',
      executions: 2,
      successes: 1,
      failures: 1,
      failureRate: 0.5,
      recoveredRetries: 1,
      lastOccurrence: '2026-09-01T01:00:00.000Z',
    },
  ],
  availableProviders: ['youtube_music'],
  topErrors: [],
  problematicTracks: [],
  recentFailures: [
    {
      playbackAttemptId: 'logical',
      queueItemId: 'q',
      trackTitle: 'Track',
      trackArtists: 'Artist',
      sourceProvider: 'youtube_music',
      errorCode: 'SOURCE_DNS_FAILED',
      failureStage: 'transport',
      failureClass: 'network',
      httpStatus: null,
      occurredAt: '2026-09-01T01:00:00.000Z',
    },
  ],
})
describe('Playback Health panel', () => {
  it('shows incomplete executions, provider denominators and safe diagnostic context', () => {
    const wrapper = mount(PlaybackHealthPanel, { props: { ...props, data } })
    expect(wrapper.text()).toContain('INCOMPLETAS')
    expect(wrapper.text()).toContain('1 sucessos / 2 execuções')
    expect(wrapper.text()).toContain('network')
    expect(wrapper.text()).toContain('transport')
    expect(wrapper.text()).toContain('HTTP: —')
  })
  it('emits filters and retry without mutating supplied data', async () => {
    const wrapper = mount(PlaybackHealthPanel, { props: { ...props, data } })
    await wrapper.findAll('select')[1]!.setValue('youtube_music')
    expect(wrapper.emitted('sourceProviderChange')).toEqual([['youtube_music']])
    await wrapper.get('.health-refresh').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
  it('renders loading and error states with accessible feedback', () => {
    const loading = mount(PlaybackHealthPanel, { props: { ...props, loading: true } })
    expect(loading.get('select').attributes('disabled')).toBeDefined()
    expect(loading.get('[aria-live="polite"]').text()).toContain('Carregando')
    const error = mount(PlaybackHealthPanel, { props: { ...props, error: 'Falha temporária' } })
    expect(error.get('[role="alert"]').text()).toContain('Falha temporária')
  })
})
