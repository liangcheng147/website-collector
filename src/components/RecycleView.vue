<script setup lang="ts">
import { Trash2, Undo2, X } from 'lucide-vue-next'
import { useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
import type { TrashedSite } from '../types'
const store = useAppStore()
const dialog = useDialog()

const list = () => store.trashedSites.map((t: TrashedSite) => t.site.id)
const sel = useSelection(list)
function restore() { store.restoreSites([...sel.selected.value]); sel.clear() }
const selIds = () => [...sel.selected.value]
function askDelete() {
  const ids = selIds()
  if (!ids.length) return
  dialog.error({
    title: '彻底删除',
    content: `确定永久删除选中的 ${ids.length} 项？此操作不可恢复。删除后将从回收站移除，无法再恢复。`,
    positiveText: '彻底删除',
    negativeText: '取消',
    onPositiveClick: () => { store.permanentlyDeleteSites(ids); sel.clear() },
  })
}
function askEmpty() {
  if (!store.trashedSites.length) return
  dialog.error({
    title: '清空回收站',
    content: '确定清空整个回收站？所有已删除网站将永久移除。此操作不可恢复。',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => { store.emptyRecycle(); sel.clear() },
  })
}
</script>

<template>
  <div>
    <div v-if="sel.selected.value.length" class="batchbar">
      <b>已选 {{ sel.selected.value.length }} 项</b>
      <button class="btn" @click="restore"><Undo2 :size="14" /> 恢复所选</button>
      <button class="btn danger" @click="askDelete"><X :size="14" /> 彻底删除所选</button>
      <button class="btn" style="margin-left:auto" @click="sel.clear()"><X :size="14" /> 取消选择</button>
    </div>
    <div v-else class="batchbar">
      <b>回收站 · {{ store.trashedSites.length }} 项</b>
      <button class="btn danger" style="margin-left:auto" @click="askEmpty">清空回收站</button>
    </div>
    <table class="site-table">
      <thead><tr>
        <th><span class="cb" :class="{ checked: sel.allSelected.value }" @click="sel.selectAll()"></span></th>
        <th>名称</th><th>链接</th><th>删除时间</th><th></th>
      </tr></thead>
      <tbody>
        <tr v-for="t in store.trashedSites" :key="t.site.id"
          :class="{ 'row-selected': sel.selected.value.includes(t.site.id) }"
          @click="sel.onRowClick($event, t.site.id)">
          <td><span class="cb" :class="{ checked: sel.selected.value.includes(t.site.id) }" @click.stop="sel.toggle(t.site.id)"></span></td>
          <td>{{ t.site.name }}</td>
          <td class="muted">{{ t.site.url }}</td>
          <td class="muted">{{ t.deletedAt.slice(0, 10) }}</td>
          <td>
            <button class="btn" @click.stop="store.restoreSite(t.site.id)">恢复</button>
            <button class="btn danger" @click.stop="store.permanentlyDelete(t.site.id)">彻底删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.trashedSites.length === 0" class="empty-state">
      <Trash2 :size="48" :stroke-width="1.5" class="empty-icon" />
      <b>回收站为空</b>
      <span class="hint">已删除的网站会暂时存放在这里</span>
    </div>
  </div>
</template>
