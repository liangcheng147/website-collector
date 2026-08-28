<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
import ConfirmModal from './ConfirmModal.vue'
import type { TrashedSite } from '../types'
const store = useAppStore()

const list = () => store.trashedSites.map((t: TrashedSite) => t.site.id)
const sel = useSelection(list)
function restore() { store.restoreSites([...sel.selected.value]); sel.clear() }
const confirm = ref<null | 'delete-selected' | 'empty'>(null)
const selIds = () => [...sel.selected.value]
function askDelete() { if (selIds().length) confirm.value = 'delete-selected' }
function askEmpty() { if (store.trashedSites.length) confirm.value = 'empty' }
function onChoose(v: string) {
  if (v === 'ok') {
    if (confirm.value === 'delete-selected') store.permanentlyDeleteSites(selIds())
    else if (confirm.value === 'empty') store.emptyRecycle()
    sel.clear()
  }
  confirm.value = null
}
</script>

<template>
  <div>
    <div v-if="sel.selected.value.length" class="batchbar">
      <b>已选 {{ sel.selected.value.length }} 项</b>
      <button class="btn" @click="restore">↩ 恢复所选</button>
      <button class="btn danger" @click="askDelete">✕ 彻底删除所选</button>
      <button class="btn" style="margin-left:auto" @click="sel.clear()">✕ 取消选择</button>
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
    <div v-if="store.trashedSites.length === 0" class="empty">
      <b>回收站为空</b>
      <span class="hint">已删除的网站会暂时存放在这里</span>
    </div>
    <ConfirmModal v-if="confirm === 'delete-selected'" title="彻底删除" :message="`确定永久删除选中的 ${selIds().length} 项？此操作不可恢复。`" hint="删除后将从回收站移除，无法再恢复。" :options="[{ value: 'ok', label: '彻底删除', danger: true }, { value: 'cancel', label: '取消' }]" @choose="onChoose" @close="confirm = null" />
<ConfirmModal v-if="confirm === 'empty'" title="清空回收站" message="确定清空整个回收站？所有已删除网站将永久移除。" hint="此操作不可恢复。" :options="[{ value: 'ok', label: '清空', danger: true }, { value: 'cancel', label: '取消' }]" @choose="onChoose" @close="confirm = null" />
  </div>
</template>