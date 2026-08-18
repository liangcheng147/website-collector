<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import CategoryNode from './CategoryNode.vue'
import AddCategoryModal from './AddCategoryModal.vue'
const store = useAppStore()
const showAdd = ref(false)
function setView(kind: any, id?: string) { store.view = { kind, id } }
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
  const siteId = e.dataTransfer?.getData('application/x-site-id')
  if (siteId) store.addTagsToSites([siteId], [t])
}
</script>

<template>
  <aside class="sidebar">
    <div class="group-label" @click="toggleGroup('分类')">分类 <span class="caret">{{ isCollapsed('分类') ? '▶' : '▼' }}</span></div>
    <template v-if="!isCollapsed('分类')">
      <div class="row" :class="{ active: store.view.kind === 'all', 'drop-over': allDrop }" @click="setView('all')" @contextmenu.prevent="onAllMenu"
        @dragover="onAllDragOver" @dragleave="allDrop = false" @drop="onAllDrop">
        全部 <span class="cnt">{{ store.data.sites.length }}</span>
      </div>
      <CategoryNode v-for="c in store.data.categories" :key="c.id" :cat="c" :depth="0" />
    </template>
    <div class="group-label" @click="toggleGroup('视图')">视图 <span class="caret">{{ isCollapsed('视图') ? '▶' : '▼' }}</span></div>
    <template v-if="!isCollapsed('视图')">
      <div class="row dead" :class="{ active: store.view.kind === 'dead' }" @click="setView('dead')">⚠ 失效 <span class="cnt">{{ store.deadCount }}</span></div>
    </template>
    <div class="group-label" @click="toggleGroup('标签')">标签 <span class="caret">{{ isCollapsed('标签') ? '▶' : '▼' }}</span></div>
    <template v-if="!isCollapsed('标签')">
      <div v-for="t in store.data.tags" :key="t" class="row"
        :class="{ active: store.view.kind === 'tag' && store.view.id === t, 'drop-over': tagDrop === t }"
        @click="setView('tag', t)"
        draggable="true"
        @dragstart="onTagDragStart($event, t)"
        @dragover="onTagDragOver($event, t)"
        @dragleave="tagDrop = null"
        @drop="onTagDrop($event, t)">
        # {{ t }}
      </div>
    </template>
    <div class="group-label" @click="toggleGroup('系统')">系统 <span class="caret">{{ isCollapsed('系统') ? '▶' : '▼' }}</span></div>
    <template v-if="!isCollapsed('系统')">
      <div class="row trash" :class="{ active: store.view.kind === 'recycle' }" @click="setView('recycle')">🗑 回收站 <span class="cnt">{{ store.trashedSites.length }}</span></div>
    </template>
    <AddCategoryModal v-if="showAdd" :parent-id="null" @created="setView('category', $event); showAdd = false" @close="showAdd = false" />
  </aside>
</template>