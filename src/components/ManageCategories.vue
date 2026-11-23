<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { NButton, NCheckbox, NSelect, NInput, NText, NList, NListItem, useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
const store = useAppStore()
const dialog = useDialog()
const name = ref('')
const parentId = ref<string | null>(null)
const sel = useSelection(() => store.flatCategories.map(c => c.id))
const catList = computed(() =>
  store.flatCategories.map(c => ({ ...c, count: store.categoryCounts[c.id] ?? 0 })))
const someSelected = computed(() => sel.selected.value.length > 0 && !sel.allSelected.value)
const selectValue = computed(() => parentId.value ?? '')
const parentOptions = computed(() => [
  { label: '（顶级分类）', value: '' },
  ...store.flatCategories.filter(c => c.depth < 2).map(c => ({ label: '\u3000'.repeat(c.depth) + c.name, value: c.id })),
])
function onParentChange(value: string | number | null) {
  parentId.value = value ? String(value) : null
}
function add() {
  if (!name.value.trim()) return
  const validParent = store.flatCategories.find(c => c.id === parentId.value && c.depth < 2)
  store.addCategory(name.value.trim(), validParent ? validParent.id : null)
  name.value = ''
}
function askDelete() {
  const ids = [...sel.selected.value]
  if (!ids.length) return
  const d = dialog.warning({
    title: '删除分类',
    style: { width: 'min(520px, 92%)' },
    content: () => h('div', { class: 'modal-content' }, [
      h('div', { class: 'modal-cols' }, [
        h('div', null, [
          h('p', { class: 'muted' }, `删除所选 ${ids.length} 个分类，其中网站如何处理？`),
          h('div', { class: 'actions', style: 'justify-content:flex-start; flex-wrap:wrap' }, [
            h(NButton, { onClick: () => { store.deleteCategories(ids, 'move-to-uncategorized'); sel.clear(); d.destroy() } }, () => '网站移入未分类'),
            h(NButton, { type: 'error', onClick: () => { store.deleteCategories(ids, 'delete-sites'); sel.clear(); d.destroy() } }, () => '连同网站删除'),
            h(NButton, { secondary: true, onClick: () => d.destroy() }, () => '取消'),
          ]),
        ]),
        h('div', { class: 'help' }, [
          h('label', null, '风险提示'),
          h('p', { class: 'muted' }, '「连同网站删除」会把这些分类下所有网站移入回收站，可在回收站恢复。'),
        ]),
      ]),
    ]),
    positiveText: '',
    negativeText: '',
  })
}
</script>

<template>
  <div class="manage-cols">
    <div class="manage-card">
      <div class="card-head">
        <h4>分类列表</h4>
        <n-button type="error" size="small" :disabled="!sel.selected.value.length" @click="askDelete">
          <Trash2 :size="14" /> 批量删除所选
        </n-button>
      </div>
      <div class="cat-head">
        <span class="chk-col">
          <n-checkbox :checked="sel.allSelected.value" :indeterminate="someSelected" @update:checked="sel.selectAll()" />
        </span>
        <span class="name-col">分类</span>
        <span class="cnt-col">网站数</span>
      </div>
      <n-list>
        <n-list-item
          v-for="c in catList"
          :key="c.id"
          class="cat-item"
          :class="{ selected: sel.selected.value.includes(c.id) }"
          @click="sel.onRowClick($event, c.id)"
        >
          <span class="chk-col">
            <n-checkbox :checked="sel.selected.value.includes(c.id)" @update:checked="sel.toggle(c.id)" @click.stop />
          </span>
          <span class="name-col" :style="{ paddingLeft: c.depth * 14 + 'px' }">{{ c.name }}</span>
          <span class="cnt-col muted">{{ c.count }}</span>
        </n-list-item>
      </n-list>
      <div v-if="!catList.length" class="empty">暂无分类</div>
    </div>
    <div class="manage-card">
      <h4>批量添加分类</h4>
      <label>父分类</label>
      <n-select :value="selectValue" :options="parentOptions" @update:value="onParentChange" />
      <label>分类名称</label>
      <n-input v-model:value="name" placeholder="分类名" @keydown.enter="add" />
      <div class="actions">
        <n-button type="primary" @click="add">添加</n-button>
      </div>
      <n-text class="help-text" depth="3">逐个输入，可连续添加多个。</n-text>
    </div>
  </div>
</template>

<style scoped>
.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-head h4 { margin-bottom: 0; }
.cat-item { padding: 6px 8px; cursor: pointer; border-bottom: 1px solid var(--border); }
.cat-item:hover { background: var(--hover); }
.cat-item.selected, .cat-item.selected:hover { background: var(--primary-t); }
.help-text { display: block; margin-top: 10px; }
</style>
