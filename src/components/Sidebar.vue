<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NText } from 'naive-ui'
import { AlertTriangle, Trash2, UnfoldVertical, FoldVertical, ChevronRight, ChevronDown } from 'lucide-vue-next'
import { useAppStore, UNCATEGORIZED_ID } from '../store/app'
import type { View } from '../types'
import CategoryNode from './CategoryNode.vue'
import AddCategoryModal from './AddCategoryModal.vue'
const store = useAppStore()
const showAdd = ref(false)
function setView(kind: View['kind'], id?: string) { store.view = { kind, id } }
function onAllMenu(e: MouseEvent) { e.preventDefault(); showAdd.value = true }
function isCollapsed(g: string) { return store.settings.sidebarCollapsed.includes(g) }
function toggleGroup(g: string) {
  const cur = store.settings.sidebarCollapsed
  const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]
  store.updateSettings({ sidebarCollapsed: next })
}
const allDrop = ref(false)
function onAllDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-cat-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    allDrop.value = true
  }
}
function onAllDrop(e: DragEvent) {
  e.preventDefault()
  allDrop.value = false
  const catId = e.dataTransfer?.getData('application/x-cat-id')
  if (catId) store.moveCategory(catId, null)
}
const uncatDrop = ref(false)
function onUncatDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-site-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    uncatDrop.value = true
  }
}
function onUncatDrop(e: DragEvent) {
  e.preventDefault()
  uncatDrop.value = false
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    store.moveSites(raw.split(','), null)
  }
}
const tagDrop = ref<string | null>(null)
function onTagDragStart(e: DragEvent, t: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-tag', t)
  e.dataTransfer.effectAllowed = 'copy'
}
function onTagDragOver(e: DragEvent, t: string) {
  if (e.dataTransfer?.types.includes('application/x-site-id')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    tagDrop.value = t
  }
}
function onTagDrop(e: DragEvent, t: string) {
  e.preventDefault()
  tagDrop.value = null
  const raw = e.dataTransfer?.getData('application/x-site-id')
  if (raw) {
    store.addTagsToSites(raw.split(','), [t])
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-scroll">
      <div class="group-card">
      <n-text class="group-label" tag="div" @click="toggleGroup('分类')">分类 <span class="caret"><ChevronRight v-if="isCollapsed('分类')" :size="12" /><ChevronDown v-else :size="12" /></span>
        <span class="group-actions">
          <n-button class="group-btn" attr-type="button" size="tiny" title="展开全部" @click.stop="store.expandAllCategories()"><UnfoldVertical :size="12" /></n-button>
          <n-button class="group-btn" attr-type="button" size="tiny" title="收起全部" @click.stop="store.collapseAllCategories()"><FoldVertical :size="12" /></n-button>
        </span>
      </n-text>
      <template v-if="!isCollapsed('分类')">
        <div class="side-row" :class="{ active: store.view.kind === 'all', 'drop-over': allDrop }" @click="setView('all')" @contextmenu.prevent="onAllMenu"
          @dragover="onAllDragOver" @dragleave="allDrop = false" @drop="onAllDrop">
          全部 <span class="cnt">{{ store.data.sites.length }}</span>
        </div>
        <CategoryNode v-for="c in store.data.categories" :key="c.id" :cat="c" :depth="0" />
        <div class="side-row" :class="{ active: store.view.kind === 'category' && store.view.id === UNCATEGORIZED_ID, 'drop-over': uncatDrop }" @click="setView('category', UNCATEGORIZED_ID)" @dragover="onUncatDragOver" @dragleave="uncatDrop = false" @drop="onUncatDrop">
          未分类 <span class="cnt">{{ store.uncategorizedCount }}</span>
        </div>
      </template>
      </div>
    </div>
    <div class="sidebar-fixed">
      <div class="group-card">
      <n-text class="group-label" tag="div">视图</n-text>
      <div class="side-row dead" :class="{ active: store.view.kind === 'dead' }" @click="setView('dead')"><AlertTriangle :size="14" /> 失效 <span class="cnt">{{ store.deadCount }}</span></div>
      </div>
      <div class="group-card">
      <n-text class="group-label" tag="div" @click="toggleGroup('标签')">标签 <span class="caret"><ChevronRight v-if="isCollapsed('标签')" :size="12" /><ChevronDown v-else :size="12" /></span></n-text>
      <template v-if="!isCollapsed('标签')">
        <div class="tag-scroll">
          <div v-for="t in store.data.tags" :key="t" class="side-row"
            :class="{ active: store.view.kind === 'tag' && store.view.id === t, 'drop-over': tagDrop === t }"
            @click="setView('tag', t)"
            draggable="true"
            @dragstart="onTagDragStart($event, t)"
            @dragover="onTagDragOver($event, t)"
            @dragleave="tagDrop = null"
            @drop="onTagDrop($event, t)">
            # {{ t }}
          </div>
        </div>
      </template>
      </div>
      <div class="group-card">
      <n-text class="group-label" tag="div">系统</n-text>
      <div class="side-row trash" :class="{ active: store.view.kind === 'recycle' }" @click="setView('recycle')"><Trash2 :size="14" /> 回收站 <span class="cnt">{{ store.trashedSites.length }}</span></div>
      </div>
    </div>
    <AddCategoryModal v-if="showAdd" :parent-id="null" @created="setView('category', $event); showAdd = false" @close="showAdd = false" />
  </aside>
</template>

<style scoped>
.side-row { padding: 5px 10px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; color: var(--text); transition: background .15s var(--ease), color .15s var(--ease); }
.side-row:hover { background: var(--hover); }
.side-row.active { background: var(--primary-t); color: var(--primary); font-weight: 600; box-shadow: inset 3px 0 0 var(--primary); }
.side-row .cnt { float: right; color: var(--text-2); font-size: 12px; }
.side-row.active .cnt { color: var(--primary); }
.side-row.dead, .side-row.trash { color: var(--danger); }
.side-row.drop-over { outline: 2px dashed var(--primary); outline-offset: -2px; background: var(--primary-t); }
.group-btn { color: var(--text-2); background: transparent; border: 1px solid var(--border-2); }
.group-btn:hover { color: var(--primary); border-color: var(--primary); }
</style>
