<script setup lang="ts">
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
import type { TrashedSite } from '../types'
const store = useAppStore()

const list = () => store.trashedSites.map((t: TrashedSite) => t.site.id)
const sel = useSelection(list)
function restore() { store.restoreSites([...sel.selected.value]); sel.clear() }
function del() { store.permanentlyDeleteSites([...sel.selected.value]); sel.clear() }
</script>

<template>
  <div>
    <div v-if="sel.selected.value.length" class="batchbar">
      <b>已选 {{ sel.selected.value.length }} 项</b>
      <button class="btn" @click="restore">↩ 恢复所选</button>
      <button class="btn danger" @click="del">✕ 彻底删除所选</button>
      <button class="btn" style="margin-left:auto" @click="sel.clear()">✕ 取消选择</button>
    </div>
    <div v-else class="batchbar">
      <b>回收站 · {{ store.trashedSites.length }} 项</b>
      <button class="btn danger" style="margin-left:auto" @click="store.emptyRecycle()">清空回收站</button>
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
    <div v-if="store.trashedSites.length === 0" class="empty">
      <b>回收站为空</b>
      <span class="hint">已删除的网站会暂时存放在这里</span>
    </div>
  </div>
</template>