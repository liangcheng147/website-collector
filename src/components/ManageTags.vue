<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../store/app'
import PromptModal from './PromptModal.vue'
const store = useAppStore()
const selected = ref<string[]>([])
const hovered = ref<string | null>(null)
const renaming = ref<string | null>(null)
const merging = ref(false)
const scopeCat = ref<string | null>(null)
const scopeTags = ref('')
const removeMode = ref(false)
const tagCounts = computed(() => {
  const m: Record<string, number> = {}
  store.data.sites.forEach(s => s.tags.forEach(t => { m[t] = (m[t] ?? 0) + 1 }))
  return m
})
function toggle(t: string) {
  const i = selected.value.indexOf(t)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(t)
}
function doRename(newName: string) {
  if (renaming.value && newName !== renaming.value) store.renameTag(renaming.value, newName)
  renaming.value = null
}
function doDelete() {
  if (selected.value.length) store.deleteTags([...selected.value])
  selected.value = []
}
function doMerge(target: string) {
  if (selected.value.length > 1 && target) store.mergeTags([...selected.value], target)
  selected.value = []
  merging.value = false
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
          <button class="btn danger" :disabled="!selected.length" @click="doDelete">🗑 删除所选</button>
          <button class="btn" :disabled="selected.length < 2" @click="merging = true">🔗 合并所选</button>
        </div>
      </div>
      <div class="cat-head">
        <span class="chk-col"></span><span class="name-col">标签</span><span class="cnt-col">网站数</span>
      </div>
      <div v-for="t in store.data.tags" :key="t" class="cat-row"
        @mouseenter="hovered = t" @mouseleave="hovered = null">
        <span class="chk-col"><span class="cb" :class="{ checked: selected.includes(t) }" @click="toggle(t)"></span></span>
        <span class="name-col"># {{ t }}
          <span v-if="hovered === t" class="btn mini" style="margin-left:6px" @click="renaming = t">✎ 重命名</span>
        </span>
        <span class="cnt-col muted">{{ tagCounts[t] ?? 0 }}</span>
      </div>
      <div v-if="!store.data.tags.length" class="empty">暂无标签</div>
    </div>
    <div class="manage-card">
      <h4>批量加/去标签</h4>
      <div class="mode-row">
        <label><input type="radio" :checked="!removeMode" @change="removeMode = false" /> 批量添加</label>
        <label style="margin-left:10px"><input type="radio" :checked="removeMode" @change="removeMode = true" /> 批量去除</label>
      </div>
      <label>标签（空格分隔）</label>
      <input v-model="scopeTags" placeholder="标签1 标签2" />
      <label>分类范围</label>
      <select v-model="scopeCat">
        <option :value="null">全部网站</option>
        <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <div class="actions">
        <button class="btn primary" @click="doBatch">{{ removeMode ? '批量去除' : '批量添加' }}</button>
      </div>
      <p class="muted">按所选分类范围（含其子分类）批量应用；选「全部网站」则作用于全部。</p>
    </div>
  </div>
  <PromptModal v-if="renaming" :title="'重命名标签'" :initial="renaming" hint="修改后所有网站的该标签同步更新。" @confirm="doRename" @close="renaming = null" />
  <PromptModal v-if="merging" :title="'合并标签'" :initial="selected[0]" hint="所选标签合并为目标标签：网站上的标签统一替换，被合并的标签自动消失。" @confirm="doMerge" @close="merging = false" />
</template>
