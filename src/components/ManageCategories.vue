<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { NButton, useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
const store = useAppStore()
const dialog = useDialog()
const name = ref('')
const parentId = ref<string | null>(null)
const sel = useSelection(() => store.flatCategories.map(c => c.id))
const catList = computed(() =>
  store.flatCategories.map(c => ({ ...c, count: store.categoryCounts[c.id] ?? 0 })))
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
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h4>分类列表</h4>
        <button class="btn danger" :disabled="!sel.selected.value.length" @click="askDelete"><Trash2 :size="14" /> 批量删除所选</button>
      </div>
      <div class="cat-head">
        <span class="chk-col"><span class="cb" :class="{ checked: sel.allSelected.value }" @click="sel.selectAll()"></span></span><span class="name-col">分类</span><span class="cnt-col">网站数</span>
      </div>
      <div v-for="c in catList" :key="c.id" class="cat-row" :class="{ 'row-selected': sel.selected.value.includes(c.id) }" @click="sel.onRowClick($event, c.id)">
        <span class="chk-col"><span class="cb" :class="{ checked: sel.selected.value.includes(c.id) }" @click.stop="sel.toggle(c.id)"></span></span>
        <span class="name-col" :style="{ paddingLeft: c.depth * 14 + 'px' }">{{ c.name }}</span>
        <span class="cnt-col muted">{{ c.count }}</span>
      </div>
      <div v-if="!catList.length" class="empty">暂无分类</div>
    </div>
    <div class="manage-card">
      <h4>批量添加分类</h4>
      <label>父分类</label>
      <select v-model="parentId">
        <option :value="null">（顶级分类）</option>
        <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '\u3000'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <label>分类名称</label>
      <input v-model="name" placeholder="分类名" @keydown.enter="add" />
      <div class="actions"><button class="btn primary" @click="add">添加</button></div>
      <p class="muted">逐个输入，可连续添加多个。</p>
    </div>
  </div>
</template>
