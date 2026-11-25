import { onUnmounted, ref } from 'vue'

export const SIDEBAR_MIN_WIDTH = 160
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_DEFAULT_WIDTH = 170
export const SIDEBAR_WIDTH_STORAGE_KEY = 'site-collector-sidebar-width'
const KEYBOARD_STEP = 10

/** 统一收敛宽度：取整后限制在 160–360；非法值回退默认。 */
export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readSidebarWidth(storage: Storage | null = getStorage()): number {
  if (!storage) return SIDEBAR_DEFAULT_WIDTH
  try {
    const raw = storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (raw === null) return SIDEBAR_DEFAULT_WIDTH
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

export function writeSidebarWidth(width: number, storage: Storage | null = getStorage()): void {
  if (!storage) return
  try {
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)))
  } catch {
    /* 隐私模式等写入失败时忽略 */
  }
}

/**
 * 侧栏宽度拖动：pointer 拖动实时更新，pointerup 持久化；
 * 双击复位；←/→ 步进，Home 复位。
 */
export function useSidebarResize() {
  const width = ref(readSidebarWidth())
  const dragging = ref(false)
  let startX = 0
  let startWidth = width.value

  function persist() {
    writeSidebarWidth(width.value)
  }

  function onPointerMove(e: PointerEvent) {
    width.value = clampSidebarWidth(startWidth + (e.clientX - startX))
  }

  function stopDrag() {
    if (!dragging.value) return
    dragging.value = false
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', stopDrag)
    document.removeEventListener('pointercancel', stopDrag)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persist()
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.value = true
    startX = e.clientX
    startWidth = width.value
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', stopDrag)
    document.addEventListener('pointercancel', stopDrag)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function onDoubleClick() {
    width.value = SIDEBAR_DEFAULT_WIDTH
    persist()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') width.value = clampSidebarWidth(width.value - KEYBOARD_STEP)
    else if (e.key === 'ArrowRight') width.value = clampSidebarWidth(width.value + KEYBOARD_STEP)
    else if (e.key === 'Home') width.value = SIDEBAR_DEFAULT_WIDTH
    else return
    e.preventDefault()
    persist()
  }

  onUnmounted(stopDrag)

  return { width, dragging, onPointerDown, onDoubleClick, onKeydown }
}
