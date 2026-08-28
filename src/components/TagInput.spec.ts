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
  return ev[ev.length - 1] as unknown[]
}

it('selects an existing tag from dropdown', async () => {
  const w = make()
  const input = w.find('input')
  await input.trigger('focus')
  await input.setValue('框')
  await w.find('.opt').trigger('mousedown')
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
  expect(w.findAll('.chip').length).toBe(1)
})

it('removes a chip via ×', async () => {
  const w = make(['工具'])
  await w.find('.chip-x').trigger('click')
  expect(lastEmit(w)).toEqual([])
})
