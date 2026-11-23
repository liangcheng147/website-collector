<script setup lang="ts">
import { h, onMounted, onUnmounted, ref } from 'vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { NButton, NInput, useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'
import ContextMenu from './ContextMenu.vue'
import AddCategoryModal from './AddCategoryModal.vue'
import type { Category, View } from '../types'
const store = useAppStore()
const dialog = useDialog()
const props = defineProps<{ cat: Category; depth: number }>()
const menu = ref<{ x: number; y: number } | null>(null)
const addCat = ref(false)
const dragOver = ref(false)

function menuItems() {
  const items: { kind: string; label: string; danger?: boolean }[] = [{ kind: 'rename', label: '重命名' }]
  if (props.depth < 2) items.push({ kind: 'add-sub', label: '添加子分类' })
  items.push({ kind: 'delete', label: '删除分类', danger: true })
  return items
}
function setView(kind: View['kind'], id?: string) { store.view = { kind, id } }
function onCatMenu(e: MouseEvent) { menu.value = { x: e.clientX, y: e.clientY } }
function onAction(kind: string, cat: Category) {
  menu.value = null
  if (kind === 'rename') renameCategory(cat)
  else if (kind === 'add-sub') addCat.value = true
  else if (kind === 'delete') deleteCategory(cat)
}
function renameCategory(cat: Category) {
  const name = ref(cat.name)
  dialog.warning({
    title: '重命名分类',
    style: { width: 'min(520px, 92%)' },
    content: () => h('div', { class: 'modal-content' }, [
      h(NInput, {
        value: name.value,
        'onUpdate:value': (v: string) => { name.value = v },
        placeholder: '分类名',
      }),
      h('p', { class: 'muted' }, '修改后所有子分类与网站归属保持不变。'),
    ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      const v = name.value.trim()
      if (!v) return false
      store.renameCategory(cat.id, v)
    },
  })
}
function deleteCategory(cat: Category) {
  const d = dialog.warning({
    title: '删除分类',
    style: { width: 'min(520px, 92%)' },
    content: () => h('div', { class: 'modal-content' }, [
      h('div', { class: 'modal-cols' }, [
        h('div', null, [
          h('p', { class: 'muted' }, `删除「${cat.name}」及其子分类，其中网站如何处理？`),
          h('div', { class: 'actions', style: 'justify-content:flex-start; flex-wrap:wrap' }, [
            h(NButton, { onClick: () => { store.deleteCategory(cat.id, 'move-to-uncategorized'); d.destroy() } }, () => '网站移入未分类'),
            h(NButton, { type: 'error', onClick: () => { store.deleteCategory(cat.id, 'delete-sites'); d.destroy() } }, () => '连同网站删除'),
          ]),
        ]),
        h('div', { class: 'help' }, [
          h('label', null, '风险提示'),
          h('p', { class: 'muted' }, '「连同网站删除」会把该分类下所有网站移入回收站，可在回收站恢复。'),
        ]),
      ]),
    ]),
    positiveText: '',
    negativeText: '',
  })
}
function onCatDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-cat-id', props.cat.id)
  e.dataTransfer.effectAllowed = 'move'
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    store.moveSites(raw.split(','), props.cat.id)
    return
  }
  const catId = e.dataTransfer?.getData('application/x-cat-id')
  if (catId) store.moveCategory(catId, props.cat.id)
}
function onDragOver(e: DragEvent) {
  const types = e.dataTransfer?.types ?? []
  if (types.includes('application/x-site-id') || types.includes('application/x-cat-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    dragOver.value = true
  }
}
function onDragLeave() { dragOver.value = false }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') menu.value = null }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <div
      :class="[(depth > 0 ? 'row sub' : 'row'), { active: store.view.kind === 'category' && store.view.id === cat.id, 'drop-over': dragOver }]"
      :style="{ paddingLeft: (depth > 0 ? 12 : 0) + depth * 14 + 'px' }"
      draggable="true"
      @click="setView('category', cat.id)"
      @contextmenu.prevent="onCatMenu($event)"
      @dragstart="onCatDragStart($event)"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span
        v-if="cat.children.length > 0"
        class="collapse-arrow"
        @click.stop="store.toggleCategoryCollapse(cat.id)"
      ><ChevronRight v-if="store.settings.collapsedCategories.includes(cat.id)" :size="12" /><ChevronDown v-else :size="12" /></span>
      {{ cat.name }}
    </div>
    <div class="children" v-show="!store.settings.collapsedCategories.includes(cat.id)">
      <CategoryNode v-for="cc in cat.children" :key="cc.id" :cat="cc" :depth="depth + 1" />
    </div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems()" @action="(kind: string) => onAction(kind, cat)" @close="menu = null" />
    <AddCategoryModal v-if="addCat" :parent-id="cat.id" @created="setView('category', $event); addCat = false" @close="addCat = false" />
  </div>
</template>
