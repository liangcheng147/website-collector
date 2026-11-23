<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { NDropdown } from 'naive-ui'
import { Play, FolderInput, Tag, Pencil, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '../store/app'

const store = useAppStore()
const emit = defineEmits(['action', 'close'])
const props = defineProps<{ x: number; y: number; items?: { kind: string; label: string; danger?: boolean }[] }>()

type Item = { kind: string; label: string; danger?: boolean; icon?: () => ReturnType<typeof h> }

const defaultItems: Item[] = [
  { kind: 'check', label: '检测所选', icon: () => h(Play, { size: 14 }) },
  { kind: 'move', label: '移动分类…', icon: () => h(FolderInput, { size: 14 }) },
  { kind: 'tag', label: '添加标签…', icon: () => h(Tag, { size: 14 }) },
  { kind: 'edit', label: '编辑', icon: () => h(Pencil, { size: 14 }) },
  { kind: 'delete', label: '删除所选', danger: true, icon: () => h(Trash2, { size: 14 }) },
]

const options = computed(() => {
  const items: Item[] = props.items?.length ? props.items : defaultItems
  return items.map(it => ({
    key: it.kind,
    label: it.label,
    icon: it.icon,
    props: it.danger ? { class: 'danger', style: { color: 'var(--danger)' } } : undefined,
  }))
})

const pos = ref({ x: props.x, y: props.y })

function onSelect(key: string | number) {
  emit('action', String(key))
  store.clearSelection()
}

function onUpdateShow(show: boolean) {
  if (!show) emit('close')
}

function onWheel(e: WheelEvent) {
  const el = document.body.querySelector<HTMLElement>('.n-dropdown')
  if (el?.contains(e.target as Node)) return
  emit('close')
}

onMounted(async () => {
  await nextTick()
  // Naive 的菜单传送到 body，渲染后按视口做一次夹取，保留原右键菜单的定位行为
  const el = document.body.querySelector<HTMLElement>('.n-dropdown')
  if (el) {
    const w = el.offsetWidth
    const h = el.offsetHeight
    const pad = 6
    let nx = props.x
    let ny = props.y
    if (props.x + w > window.innerWidth - pad) nx = Math.max(pad, window.innerWidth - w - pad)
    if (props.y + h > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - h - pad)
    pos.value = { x: nx, y: ny }
  }
  document.addEventListener('wheel', onWheel)
})

onUnmounted(() => {
  document.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <n-dropdown
    :show="true"
    trigger="manual"
    :x="pos.x"
    :y="pos.y"
    :options="options"
    :on-clickoutside="() => emit('close')"
    @select="onSelect"
    @update:show="onUpdateShow"
  />
</template>
