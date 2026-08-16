<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../store/app'
import ContextMenu from './ContextMenu.vue'
const store = useAppStore()
defineProps<{ cat: any; depth: number }>()
const menu = ref<{ x: number; y: number } | null>(null)
const catItems = [
  { kind: 'rename', label: '重命名' },
  { kind: 'delete', label: '删除分类', danger: true },
]
function setView(kind: any, id?: string) { store.view = { kind, id } }
function onCatMenu(e: MouseEvent) { menu.value = { x: e.clientX, y: e.clientY } }
function onAction(kind: string, cat: any) {
  menu.value = null
  if (kind === 'rename') {
    const name = window.prompt('新名称', cat.name)
    if (name && name.trim()) store.renameCategory(cat.id, name.trim())
  } else if (kind === 'delete') {
    const mode = window.prompt('删除分类：输入 1=网站移入未分类，2=连同网站删除')
    if (mode === '1') store.deleteCategory(cat.id, 'move-to-uncategorized')
    else if (mode === '2') store.deleteCategory(cat.id, 'delete-sites')
  }
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') menu.value = null }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <div
      :class="[(depth > 0 ? 'row sub' : 'row'), { active: store.view.kind === 'category' && store.view.id === cat.id }]"
      :style="{ paddingLeft: (depth > 0 ? 12 : 0) + depth * 14 + 'px' }"
      @click="setView('category', cat.id)"
      @contextmenu.prevent="onCatMenu($event)"
    >
      {{ cat.name }}
    </div>
    <CategoryNode v-for="cc in cat.children" :key="cc.id" :cat="cc" :depth="depth + 1" />
    <div class="menu-mask" v-if="menu" @click="menu = null" @contextmenu.prevent="menu = null"></div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="catItems" @action="(kind: string) => onAction(kind, cat)" />
  </div>
</template>