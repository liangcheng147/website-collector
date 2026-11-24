<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Trash2 } from 'lucide-vue-next'
import { NButton, NCheckbox, NModal, NText, useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'

const store = useAppStore()
const dialog = useDialog()
const emit = defineEmits(['close'])

const selected = ref<string[]>([])
const deadSites = computed(() => store.data.sites.filter(s => s.status === 'dead'))
// dead 集合变化（检测恢复、外部删除）时裁剪本地选择，避免计数/全选残留 stale id。
watch(deadSites, (sites) => {
  const alive = new Set(sites.map(s => s.id))
  selected.value = selected.value.filter(id => alive.has(id))
}, { immediate: true })
const allSelected = computed(() =>
  deadSites.value.length > 0 && deadSites.value.every(s => selected.value.includes(s.id)),
)
const someSelected = computed(() => selected.value.length > 0 && !allSelected.value)

function toggle(id: string) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}
function toggleAll() {
  selected.value = allSelected.value ? [] : deadSites.value.map(s => s.id)
}

function askTrash() {
  const ids = [...selected.value]
  if (!ids.length) return
  dialog.warning({
    title: '移入回收站',
    content: `确定把选中的 ${ids.length} 个失效站点移入回收站？可在回收站中恢复。`,
    positiveText: '移入回收站',
    negativeText: '取消',
    onPositiveClick: () => {
      store.deleteSites(ids)
      selected.value = []
      // 失效站点清空后自动收起向导
      if (!store.deadCount) emit('close')
    },
  })
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="`失效清理（${deadSites.length} 项）`"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(560px, 92%)' }"
    data-testid="modal-dead-cleanup"
    @update:show="emit('close')"
  >
    <div class="cleanup">
      <n-text depth="3" class="hint">勾选要清理的失效站点，统一移入回收站；回收站内可恢复。</n-text>
      <div v-if="deadSites.length" class="cleanup-head">
        <n-checkbox :checked="allSelected" :indeterminate="someSelected" @update:checked="toggleAll">全选</n-checkbox>
        <span class="muted">共 {{ deadSites.length }} 项 · 已选 {{ selected.length }}</span>
      </div>
      <div v-if="deadSites.length" class="cleanup-list">
        <div
          v-for="s in deadSites" :key="s.id"
          class="cleanup-row"
          :class="{ selected: selected.includes(s.id) }"
        >
          <n-checkbox :checked="selected.includes(s.id)" :aria-label="`选择站点 ${s.name}`" @update:checked="toggle(s.id)" />
          <span class="cleanup-name">{{ s.name }}</span>
          <span class="cleanup-url">{{ s.url }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <AlertTriangle :size="48" :stroke-width="1.5" class="empty-icon" />
        <b>没有失效站点</b>
        <span class="hint">检测后仍不可达的站点会出现在这里，可批量移入回收站</span>
      </div>
    </div>
    <template #footer>
      <div class="actions modal-footer">
        <n-button @click="emit('close')">关闭</n-button>
        <n-button type="error" :disabled="!selected.length" @click="askTrash"><Trash2 :size="14" /> 移入回收站</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.cleanup { display: flex; flex-direction: column; gap: 10px; }
.cleanup .hint { font-size: 12px; }
.cleanup-head { display: flex; align-items: center; gap: 12px; }
.cleanup-head .muted { font-size: 12px; color: var(--text-2); }
.cleanup-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.cleanup-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--border); }
.cleanup-row:last-child { border-bottom: none; }
.cleanup-row.selected { background: var(--primary-t); }
.cleanup-name { font-weight: 600; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cleanup-url { font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
