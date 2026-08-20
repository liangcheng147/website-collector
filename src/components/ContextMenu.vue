<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['action', 'close'])
const props = defineProps<{ x: number; y: number; items?: { kind: string; label: string; danger?: boolean }[] }>()
const el = ref<HTMLDivElement | null>(null)
const pos = ref({ x: props.x, y: props.y })

function onGlobalDown(e: Event) {
  if (!el.value?.contains(e.target as Node)) emit('close')
}

onMounted(async () => {
  await nextTick()
  if (!el.value) return
  const w = el.value.offsetWidth
  const h = el.value.offsetHeight
  const pad = 6
  let nx = props.x
  let ny = props.y
  if (props.x + w > window.innerWidth - pad) nx = Math.max(pad, window.innerWidth - w - pad)
  if (props.y + h > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - h - pad)
  pos.value = { x: nx, y: ny }
  document.addEventListener('pointerdown', onGlobalDown)
  document.addEventListener('wheel', onGlobalDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onGlobalDown)
  document.removeEventListener('wheel', onGlobalDown)
})

function act(kind: string) { emit('action', kind); store.clearSelection() }
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="ctx" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent>
      <template v-if="props.items && props.items.length">
        <button v-for="it in props.items" :key="it.kind" class="ctx-item" :class="{ danger: it.danger }" @click="act(it.kind)">{{ it.label }}</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="act('check')">▶ 检测所选</button>
        <button class="ctx-item" @click="act('move')">移动分类…</button>
        <button class="ctx-item" @click="act('tag')">添加标签…</button>
        <button class="ctx-item" @click="act('edit')">编辑</button>
        <button class="ctx-item danger" @click="act('delete')">删除所选</button>
      </template>
    </div>
  </Teleport>
</template>
