<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../store/app'
import ContextMenu from './ContextMenu.vue'
import PromptModal from './PromptModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import AddCategoryModal from './AddCategoryModal.vue'
const store = useAppStore()
const props = defineProps<{ cat: any; depth: number }>()
const menu = ref<{ x: number; y: number } | null>(null)
const renameCat = ref<any | null>(null)
const delCat = ref<any | null>(null)
const addCat = ref(false)

function menuItems() {
  const items: { kind: string; label: string; danger?: boolean }[] = [{ kind: 'rename', label: '重命名' }]
  if (props.depth < 2) items.push({ kind: 'add-sub', label: '添加子分类' })
  items.push({ kind: 'delete', label: '删除分类', danger: true })
  return items
}
function setView(kind: any, id?: string) { store.view = { kind, id } }
function onCatMenu(e: MouseEvent) { menu.value = { x: e.clientX, y: e.clientY } }
function onAction(kind: string, cat: any) {
  menu.value = null
  if (kind === 'rename') renameCat.value = cat
  else if (kind === 'add-sub') addCat.value = true
  else if (kind === 'delete') delCat.value = cat
}
function doRename(name: string) { store.renameCategory(renameCat.value.id, name); renameCat.value = null }
function doDelete(mode: string) {
  store.deleteCategory(delCat.value.id, mode === 'delete' ? 'delete-sites' : 'move-to-uncategorized')
  delCat.value = null
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
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems()" @action="(kind: string) => onAction(kind, cat)" />
    <PromptModal v-if="renameCat" :title="'重命名分类'" :initial="renameCat.name" hint="修改后所有子分类与网站归属保持不变。" @confirm="doRename" @close="renameCat = null" />
    <ConfirmModal
      v-if="delCat"
      :title="'删除分类'"
      :message="`删除「${delCat.name}」及其子分类，其中网站如何处理？`"
      :options="[{ value: 'move', label: '网站移入未分类' }, { value: 'delete', label: '连同网站删除', danger: true }]"
      hint="「连同网站删除」会把该分类下所有网站移入回收站，可在回收站恢复。"
      @choose="doDelete"
      @close="delCat = null"
    />
    <AddCategoryModal v-if="addCat" :parent-id="cat.id" @created="setView('category', $event); addCat = false" @close="addCat = false" />
  </div>
</template>