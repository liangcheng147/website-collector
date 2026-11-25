// @vitest-environment happy-dom
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clampSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
  useSidebarResize,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './useSidebarResize'

const Harness = defineComponent({
  props: { scale: { type: Number, default: 1 } },
  setup(props) {
    return useSidebarResize(() => props.scale)
  },
  template: '<div />',
})

function pointer(type: string, clientX: number, button = 0, buttons = 1): PointerEvent {
  // happy-dom 的 PointerEvent 构造支持不完整，用 MouseEvent 提供 clientX/button 后断言类型
  return new MouseEvent(type, { bubbles: true, clientX, button, buttons }) as unknown as PointerEvent
}

describe('useSidebarResize 纯函数', () => {
  beforeEach(() => localStorage.clear())

  it('clampSidebarWidth 限制在 160–360 并取整', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(1000)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(240.6)).toBe(241)
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('readSidebarWidth 处理缺失与脏数据', () => {
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '999')
    expect(readSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'abc')
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH)
  })

  it('writeSidebarWidth 写入 clamp 后的整数字符串', () => {
    writeSidebarWidth(999.4)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('360')
  })
})

describe('useSidebarResize 交互', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('拖动更新宽度，pointerup 时持久化', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 260))
    await nextTick()
    expect(w.vm.width).toBe(260)
    document.dispatchEvent(pointer('pointerup', 260))
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('260')
    w.unmount()
  })

  it('拖动越界被 clamp', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 5000))
    await nextTick()
    expect(w.vm.width).toBe(SIDEBAR_MAX_WIDTH)
    document.dispatchEvent(pointer('pointermove', -5000))
    await nextTick()
    expect(w.vm.width).toBe(SIDEBAR_MIN_WIDTH)
    document.dispatchEvent(pointer('pointerup', 0))
    w.unmount()
  })

  it('双击复位默认宽度并持久化', () => {
    const w = mount(Harness)
    w.vm.width = 300
    w.vm.onDoubleClick()
    expect(w.vm.width).toBe(SIDEBAR_DEFAULT_WIDTH)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('170')
    w.unmount()
  })

  it('按 scale 折算指针位移（zoom 放大时不过冲）', async () => {
    const w = mount(Harness, { props: { scale: 2 } })
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 350))
    await nextTick()
    expect(w.vm.width).toBe(260) // 170 + (350-170)/2
    document.dispatchEvent(pointer('pointerup', 350))
    w.unmount()
  })

  it('按键松开后继续移动不再跟随（指针可能在窗口外松开）', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 260))
    await nextTick()
    expect(w.vm.width).toBe(260)
    document.dispatchEvent(pointer('pointermove', 400, 0, 0))
    await nextTick()
    expect(w.vm.width).toBe(260)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('260')
    document.dispatchEvent(pointer('pointermove', 500, 0, 0))
    await nextTick()
    expect(w.vm.width).toBe(260)
    w.unmount()
  })

  it('重复 pointerup 后监听器已移除，不再跟随移动', async () => {
    const w = mount(Harness)
    w.vm.onPointerDown(pointer('pointerdown', 170))
    document.dispatchEvent(pointer('pointermove', 200))
    document.dispatchEvent(pointer('pointerup', 200))
    document.dispatchEvent(pointer('pointerup', 200))
    document.dispatchEvent(pointer('pointermove', 400))
    await nextTick()
    expect(w.vm.width).toBe(200)
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('200')
    w.unmount()
  })

  it('键盘 ←/→ 步进 10px，Home 复位', () => {
    const w = mount(Harness)
    w.vm.width = 200
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(w.vm.width).toBe(210)
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(w.vm.width).toBe(200)
    w.vm.onKeydown(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(w.vm.width).toBe(SIDEBAR_DEFAULT_WIDTH)
    w.unmount()
  })
})
