<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['action'])
const props = defineProps<{ x: number; y: number; items?: { kind: string; label: string; danger?: boolean }[] }>()
function act(kind: string) { emit('action', kind); store.clearSelection() }
</script>

<template>
  <div class="ctx" :style="{ left: props.x + 'px', top: props.y + 'px' }">
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
</template>