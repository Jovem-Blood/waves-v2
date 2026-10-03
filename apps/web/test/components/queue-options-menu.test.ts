// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import QueueOptionsMenu from '../../app/components/QueueOptionsMenu.vue'

const mounted: ReturnType<typeof mount<typeof QueueOptionsMenu>>[] = []
function setup(overrides: Partial<InstanceType<typeof QueueOptionsMenu>['$props']> = {}) {
  const wrapper = mount(QueueOptionsMenu, {
    props: { autoplayEnabled: false, refreshing: false, canClear: true, ...overrides },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('Queue options menu', () => {
  it.each(['autoplay', 'import', 'refresh', 'clear'] as const)(
    'closes after selecting %s with the icon following its label',
    async (action) => {
      const wrapper = setup()
      const trigger = wrapper.get('[aria-haspopup="menu"]')
      await trigger.trigger('click')
      const index = ['autoplay', 'import', 'refresh', 'clear'].indexOf(action)
      const item = wrapper.findAll('[role="menuitem"]')[index]!
      expect(item.element.lastElementChild?.tagName.toLowerCase()).toBe('svg')
      await item.trigger('click')
      expect(wrapper.emitted('select')).toEqual([[action]])
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
      expect(document.activeElement).toBe(trigger.element)
    },
  )

  it('supports keyboard navigation, skips disabled actions and restores focus on Escape', async () => {
    const wrapper = setup({ autoplayEnabled: true, refreshing: true, canClear: false })
    const trigger = wrapper.get('[aria-haspopup="menu"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    const items = wrapper.findAll('[role="menuitem"]')
    expect(items[0]!.text()).toBe('Desativar autoplay')
    expect(document.activeElement).toBe(items[0]!.element)
    await items[0]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[1]!.element)
    await items[1]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0]!.element)
    await items[0]!.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
  })

  it('dismisses on outside touch/pointer interaction and does not invoke disabled actions', async () => {
    const wrapper = setup({ actionsDisabled: true })
    const trigger = wrapper.get('[aria-haspopup="menu"]')
    await trigger.trigger('click')
    await wrapper.findAll('[role="menuitem"]')[1]!.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })
})
