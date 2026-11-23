// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { it, expect } from 'vitest'
import TagInput from './TagInput.vue'

const tags = ['工具', '框架']
function make(model: string[] = []) {
  return mount(TagInput, { props: { modelValue: model, available: tags } })
}
function lastEmit(w: ReturnType<typeof make>): unknown[] | undefined {
  const ev = w.emitted('update:modelValue')
  if (!ev || ev.length === 0) return undefined
  return ev[ev.length - 1][0] as unknown[]
}
async function openMenu(w: ReturnType<typeof make>) {
  await w.find('.n-base-selection').trigger('click')
}
function optionByText(text: string): HTMLElement {
  const opt = Array.from(document.body.querySelectorAll<HTMLElement>('.n-base-select-option'))
    .find(el => el.textContent?.includes(text))
  if (!opt) throw new Error(`option not found: ${text}`)
  return opt
}

it('renders chips as naive tags inside a naive select', () => {
  const w = make(['工具'])
  expect(w.find('.n-select').exists()).toBe(true)
  expect(w.findAll('.n-tag').length).toBe(1)
  expect(w.find('.chip').exists()).toBe(false)
  expect(w.find('.tag-opts').exists()).toBe(false)
})

it('selects an existing tag from dropdown', async () => {
  const w = make()
  await openMenu(w)
  await w.find('input').setValue('框')
  const opt = optionByText('框架')
  await opt.click()
  expect(lastEmit(w)).toEqual(['框架'])
})

it('creates a new tag on Enter when not existing', async () => {
  const w = make()
  const input = w.find('input')
  await input.setValue('新标签')
  await input.trigger('keydown', { key: 'Enter' })
  expect(lastEmit(w)).toEqual(['新标签'])
})

it('is case-insensitive dedupe (no emit on duplicate)', async () => {
  const w = make(['工具'])
  const input = w.find('input')
  await input.setValue('工具')
  await input.trigger('keydown', { key: 'Enter' })
  expect(w.emitted('update:modelValue')).toBeUndefined()
  expect(w.findAll('.n-tag').length).toBe(1)
})

it('removes a chip via close icon', async () => {
  const w = make(['工具'])
  await w.find('.n-tag .n-base-close').trigger('click')
  expect(lastEmit(w)).toEqual([])
})

it('removes a chip via close icon even when the input still equals that tag', async () => {
  const w = make(['工具'])
  await w.find('input').setValue('工具')
  await w.find('.n-tag .n-base-close').trigger('click')
  expect(lastEmit(w)).toEqual([])
})

it('splits typed tags on separators', async () => {
  const w = make()
  const input = w.find('input')
  await input.setValue('甲, 乙')
  await input.trigger('keydown', { key: 'Enter' })
  expect(lastEmit(w)).toEqual(['甲', '乙'])
})
