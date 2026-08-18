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

function heart(s: string) { return s === 'ok' ? '♥♥♥' : s === 'dead' ? '♥' : '♥?' }

function onRight(e: MouseEvent, siteId: string) {
  if (!store.selectedIds.includes(siteId)) { store.clearSelection(); store.toggleSelect(siteId) }
  menu.value = { x: e.clientX, y: e.clientY }
}
function onRowDots(e: MouseEvent, siteId: string) { onRight(e, siteId) }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') menu.value = null }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
function onRowDblClick(site: any) { emit('edit', site) }
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
    <div v-if="store.selectedIds.length" class="batchbar">
      <b>已选 {{ store.selectedIds.length }} 项</b>
      <button class="btn" @click="emit('check-site', [...store.selectedIds])">▶ 检测所选</button>
      <button class="btn" @click="emit('move', [...store.selectedIds])">移动分类…</button>
      <button class="btn" @click="emit('tag', [...store.selectedIds])">添加标签…</button>
      <button class="btn danger" @click="store.deleteSites([...store.selectedIds])">删除所选</button>
      <button class="btn" style="margin-left:auto" @click="store.clearSelection()">✕ 取消选择</button>
    </div>
    <table class="site-table">
      <thead>
        <tr>
          <th><span class="cb" :class="{ checked: allSelected }" @click="store.selectAllVisible()"></span></th>
          <th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th><th>备注</th>
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
          <td class="muted">{{ s.categoryId }}</td>
          <td><span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span></td>
          <td :class="{ ok: s.status === 'ok', dead: s.status === 'dead', pending: s.status === 'unknown' }">{{ heart(s.status) }}</td>
          <td class="muted">{{ s.note }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.filteredSites.length === 0" class="empty">◇ 还没有网站</div>
    <div class="menu-mask" v-if="menu" @click="menu = null" @contextmenu.prevent="menu = null"></div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" @action="onAction" />
  </div>
</template>