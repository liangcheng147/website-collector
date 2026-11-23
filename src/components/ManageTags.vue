<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { Trash2, Merge, Pencil } from 'lucide-vue-next'
import { NInput, useDialog } from 'naive-ui'
import { useAppStore } from '../store/app'
import { useSelection } from '../composables/useSelection'
const store = useAppStore()
const dialog = useDialog()
const sel = useSelection(() => store.data.tags)
const hovered = ref<string | null>(null)
const scopeCat = ref<string | null>(null)
const scopeTags = ref('')
const removeMode = ref(false)
const tagCounts = computed(() => {
  const m: Record<string, number> = {}
  store.data.sites.forEach(s => s.tags.forEach(t => { m[t] = (m[t] ?? 0) + 1 }))
  return m
})
function renameTag(old: string) {
  const name = ref(old)
  dialog.warning({
    title: '重命名标签',
    style: { width: 'min(520px, 92%)' },
    content: () => h('div', { class: 'modal-content' }, [
      h(NInput, {
        value: name.value,
        'onUpdate:value': (v: string) => { name.value = v },
        placeholder: '标签名',
      }),
      h('p', { class: 'muted' }, '修改后所有网站的该标签同步更新。'),
    ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      const v = name.value.trim()
      if (!v) return false
      if (v !== old) store.renameTag(old, v)
    },
  })
}
function doDelete() {
  if (sel.selected.value.length) store.deleteTags([...sel.selected.value])
  sel.clear()
}
function mergeTags() {
  const target = ref(sel.selected.value[0] ?? '')
  dialog.warning({
    title: '合并标签',
    style: { width: 'min(520px, 92%)' },
    content: () => h('div', { class: 'modal-content' }, [
      h(NInput, {
        value: target.value,
        'onUpdate:value': (v: string) => { target.value = v },
        placeholder: '目标标签',
      }),
      h('p', { class: 'muted' }, '所选标签合并为目标标签：网站上的标签统一替换，被合并的标签自动消失。'),
    ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      const v = target.value.trim()
      if (!v) return false
      if (sel.selected.value.length > 1) store.mergeTags([...sel.selected.value], v)
      sel.clear()
    },
  })
}
function doBatch() {
  const tags = scopeTags.value.split(/[#\s，,]+/).filter(Boolean)
  if (!tags.length) return
  if (removeMode.value) store.removeTagsByScope(scopeCat.value, tags)
  else store.addTagsByScope(scopeCat.value, tags)
  scopeTags.value = ''
}
</script>

<template>
  <div class="manage-cols">
    <div class="manage-card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <h4>标签列表</h4>
        <div style="display:flex;gap:6px">
          <button class="btn danger" :disabled="!sel.selected.value.length" @click="doDelete"><Trash2 :size="14" /> 删除所选</button>
          <button class="btn" :disabled="sel.selected.value.length < 2" @click="mergeTags"><Merge :size="14" /> 合并所选</button>
        </div>
      </div>
      <div class="cat-head">
        <span class="chk-col"><span class="cb" :class="{ checked: sel.allSelected.value }" @click="sel.selectAll()"></span></span><span class="name-col">标签</span><span class="cnt-col">网站数</span>
      </div>
      <div v-for="t in store.data.tags" :key="t" class="cat-row" :class="{ 'row-selected': sel.selected.value.includes(t) }"
        @mouseenter="hovered = t" @mouseleave="hovered = null" @click="sel.onRowClick($event, t)">
        <span class="chk-col"><span class="cb" :class="{ checked: sel.selected.value.includes(t) }" @click.stop="sel.toggle(t)"></span></span>
        <span class="name-col"># {{ t }}
          <span v-if="hovered === t" class="btn mini" style="margin-left:6px" @click.stop="renameTag(t)"><Pencil :size="12" /> 重命名</span>
        </span>
        <span class="cnt-col muted">{{ tagCounts[t] ?? 0 }}</span>
      </div>
      <div v-if="!store.data.tags.length" class="empty">暂无标签</div>
    </div>
    <div class="manage-card">
      <h4>批量加/去标签</h4>
      <div class="segctrl" role="group" aria-label="批量模式">
        <button type="button" :class="{ active: !removeMode }" @click="removeMode = false">批量添加</button>
        <button type="button" :class="{ active: removeMode }" @click="removeMode = true">批量去除</button>
      </div>
      <label>标签（空格分隔）</label>
      <input v-model="scopeTags" placeholder="标签1 标签2" />
      <label>分类范围</label>
      <select v-model="scopeCat">
        <option :value="null">全部网站</option>
        <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '\u3000'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <div class="actions">
        <button class="btn primary" @click="doBatch">{{ removeMode ? '批量去除' : '批量添加' }}</button>
      </div>
      <p class="muted">按所选分类范围（含其子分类）批量应用；选「全部网站」则作用于全部。</p>
    </div>
  </div>
</template>
