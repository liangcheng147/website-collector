<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../store/app'
import type { Site } from '../types'
import * as api from '../api'
import ContextMenu from './ContextMenu.vue'

const store = useAppStore()
const menu = ref<{ x: number; y: number } | null>(null)
const hoverId = ref<string | null>(null)
const emit = defineEmits(['edit', 'check-site', 'move', 'tag'])

function statusLabel(s: string) { return s === 'ok' ? '正常' : s === 'dead' ? '失效' : '待检测' }

function onRight(e: MouseEvent, siteId: string) {
  if (!store.selectedIds.includes(siteId)) { store.clearSelection(); store.toggleSelect(siteId) }
  menu.value = { x: e.clientX, y: e.clientY }
}
function onRowDots(e: MouseEvent, siteId: string) { onRight(e, siteId) }
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { menu.value = null; return }
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); store.selectAllVisible(); return }
  }
  if (e.key === 'Delete') { e.preventDefault(); store.deleteSelectedToRecycle(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); store.selectRelative('down'); return }
  if (e.key === 'ArrowUp') { e.preventDefault(); store.selectRelative('up'); return }
  if (e.key === 'Enter') { const id = store.selectedIds[0]; if (id) { const s = store.data.sites.find(x => x.id === id); if (s) emit('edit', s) } }
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
const getCategoryName = (id: string | null) => {
  if (!id) return '未分类'
  const cat = store.flatCategories.find((c) => c.id === id)
  return cat ? cat.name : '未分类'
}

function onRowDblClick(site: Site) { emit('edit', site) }
function onAction(kind: string) {
  const ids = [...store.selectedIds]
  menu.value = null
  if (kind === 'check') emit('check-site', ids)
  else if (kind === 'move') emit('move', ids)
  else if (kind === 'tag') emit('tag', ids)
  else if (kind === 'edit') emit('edit', store.data.sites.find(s => s.id === ids[0]))
  else if (kind === 'delete') store.deleteSites(ids)
}

const allSelected = computed(() =>
  store.filteredSites.length > 0 && store.filteredSites.every(s => store.selectedIds.includes(s.id)))

function onRowClick(e: MouseEvent, site: Site) {
  if (e.ctrlKey || e.metaKey) store.toggleSelect(site.id)
  else if (e.shiftKey) store.selectRange(site.id)
  else store.selectOne(site.id)
}
function onSiteDragStart(e: DragEvent, id: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/x-site-id', id)
  e.dataTransfer.effectAllowed = 'move'
}
function onRowDrop(e: DragEvent, site: Site) {
  const tag = e.dataTransfer?.getData('application/x-tag')
  if (tag) store.addTagsToSites([site.id], [tag])
}
function onRowDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-tag')) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
}
</script>

<template>
  <div class="table-wrap">
    <div v-if="store.selectedIds.length" class="batchbar sticky-bar">
      <b>已选 {{ store.selectedIds.length }} 项</b>
      <button v-if="store.checking" class="btn danger" @click="store.cancelCheck()">■ 取消检测</button>
      <button v-else class="btn" @click="emit('check-site', [...store.selectedIds])">■ 检测所选</button>
      <button class="btn" :disabled="store.checking" @click="emit('move', [...store.selectedIds])">移动分类…</button>
      <button class="btn" :disabled="store.checking" @click="emit('tag', [...store.selectedIds])">添加标签…</button>
      <button class="btn danger" :disabled="store.checking" @click="store.deleteSites([...store.selectedIds])">删除所选</button>
      <button class="btn" style="margin-left:auto" @click="store.clearSelection()">✕ 取消选择</button>
    </div>
    <table class="site-table">
      <thead>
        <tr>
          <th><span class="cb" :class="{ checked: allSelected }" @click="store.selectAllVisible()"></span></th>
          <th @click="store.toggleSort('name')" class="sortable">名称 <span v-if="store.sortKey==='name'">{{ store.sortDir==='asc'?'▲':'▼' }}</span></th>
          <th @click="store.toggleSort('url')" class="sortable">链接 <span v-if="store.sortKey==='url'">{{ store.sortDir==='asc'?'▲':'▼' }}</span></th>
          <th>分类</th>
          <th>标签</th>
          <th @click="store.toggleSort('status')" class="sortable">状态 <span v-if="store.sortKey==='status'">{{ store.sortDir==='asc'?'▲':'▼' }}</span></th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in store.filteredSites" :key="s.id"
          :class="{ 'row-selected': store.selectedIds.includes(s.id) }"
          @click="onRowClick($event, s)"
          @mouseenter="hoverId = s.id"
          @mouseleave="hoverId = null"
          @dblclick="onRowDblClick(s)"
          @contextmenu.prevent="onRight($event, s.id)"
          @dragover="onRowDragOver"
          @drop="onRowDrop($event, s)"
        >
          <td><span class="cb" :class="{ checked: store.selectedIds.includes(s.id) }" @click.stop="store.toggleSelect(s.id)"></span></td>
          <td
            :class="{ 'name-dead': s.status === 'dead' }"
            draggable="true"
            @dragstart="onSiteDragStart($event, s.id)"
          ><span v-if="hoverId === s.id" class="dots" @click.stop="onRowDots($event, s.id)">⋯</span> {{ s.name }}</td>
          <td class="muted link-cell">
            <span class="link-text">{{ s.url }}</span>
            <span v-if="hoverId === s.id" class="open-btn" title="打开链接" @click.stop="api.openLink(s.url)">⧉</span>
          </td>
          <td class="muted">{{ getCategoryName(s.categoryId) }}</td>
          <td><span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span></td>
          <td><span class="status" :class="{ ok: s.status === 'ok', dead: s.status === 'dead', pending: s.status === 'unknown' }"><span class="dot"></span>{{ statusLabel(s.status) }}</span></td>
          <td class="muted" :title="s.note">{{ s.note || '—' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.filteredSites.length === 0" class="empty">
      <b v-if="store.data.sites.length === 0">还没有网站</b>
      <b v-else>当前筛选没有结果</b>
      <span class="hint" v-if="store.data.sites.length === 0">点击右上角「添加」开始归集你的链接</span>
      <span class="hint" v-else>试着切换分类、标签或清空搜索</span>
    </div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" @action="onAction" @close="menu = null" />
  </div>
</template>