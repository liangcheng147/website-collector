<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { HTMLAttributes } from 'vue'
import { NInput, NSelect, NButton, NPopover } from 'naive-ui'
import { Plus, LayoutGrid, Settings, Square, Search, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import { useAppStore, UNCATEGORIZED_ID } from '../store/app'
import type { CheckScope, FilterStatus, FilterTimeRange } from '../types'

const store = useAppStore()
const emit = defineEmits(['check-all', 'cancel-check', 'add', 'import-export', 'settings', 'manage', 'check-scope'])

const scopeOptions = [
  { label: '检测范围：全部', value: 'all' },
  { label: '检测范围：当前分类', value: 'category' },
  { label: '检测范围：当前标签', value: 'tag' },
  { label: '检测范围：所选', value: 'selected' },
]
function onScopeChange(v: string | number | null) {
  if (v === '' || v === null || v === undefined) return
  emit('check-scope', String(v) as CheckScope)
}

const q = ref(store.search)
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { store.search = v }, 180)
})
onUnmounted(() => { if (timer) clearTimeout(timer) })

// 标签多选（OR）；沿用既有 tag-filter / tag-filter-menu 选择器，避免破坏 e2e
const tagFilter = computed<string[]>({
  get: () => store.filters.tags,
  set: (v) => { store.setTagFilter(Array.isArray(v) ? v.map(String) : []) },
})
const tagOptions = computed(() => store.data.tags.map((t) => ({ label: t, value: t })))
const tagMenuProps = { 'data-testid': 'tag-filter-menu' } as HTMLAttributes

// 组合筛选面板
const categoryFilter = computed<string>({
  get: () => store.filters.categoryId ?? '',
  set: (v) => { store.filters.categoryId = v === '' ? null : String(v) },
})
const categoryFilterOptions = computed(() => [
  { label: '全部分类', value: '' },
  { label: '未分类', value: UNCATEGORIZED_ID },
  ...store.flatCategories.map((c) => ({ label: `${'　'.repeat(c.depth)}${c.name}`, value: c.id })),
])
const statusOptions: { label: string; value: FilterStatus }[] = [
  { label: '全部状态', value: 'all' },
  { label: '正常', value: 'ok' },
  { label: '失效', value: 'dead' },
  { label: '待检测', value: 'unknown' },
]
const timeOptions: { label: string; value: FilterTimeRange }[] = [
  { label: '全部时间', value: 'all' },
  { label: '最近 7 天检查', value: '7d' },
  { label: '最近 30 天检查', value: '30d' },
  { label: '从未检查', value: 'never' },
]
const statusFilter = computed<FilterStatus>({
  get: () => store.filters.status,
  set: (v) => { store.filters.status = v as FilterStatus },
})
const timeFilter = computed<FilterTimeRange>({
  get: () => store.filters.timeRange,
  set: (v) => { store.filters.timeRange = v as FilterTimeRange },
})

const newFilterName = ref('')
function saveCurrentFilter() {
  if (store.saveFilter(newFilterName.value)) newFilterName.value = ''
}
</script>

<template>
  <header class="topbar">
    <span class="logo"><span class="lg-ic">GJ</span>归集</span>
    <n-input
      v-model:value="q"
      class="topbar-search"
      data-testid="search-input"
      placeholder="搜索名称 / 链接 / 标签…"
    >
      <template #prefix><Search :size="14" class="topbar-icon" /></template>
    </n-input>
    <n-select
      v-model:value="tagFilter"
      multiple
      data-testid="tag-filter"
      :options="tagOptions"
      class="topbar-select"
      :menu-props="tagMenuProps"
      placeholder="标签"
    />
    <n-popover trigger="click" placement="bottom-start" :width="320">
      <template #trigger>
        <n-button
          quaternary
          size="small"
          data-testid="filter-toggle"
          :type="store.activeFilterCount ? 'primary' : 'default'"
        ><SlidersHorizontal :size="14" /> 筛选<span v-if="store.activeFilterCount" class="filter-badge">{{ store.activeFilterCount }}</span></n-button>
      </template>
      <div class="filter-panel" data-testid="filter-panel">
        <div class="filter-head">
          <b>组合筛选</b>
          <n-button quaternary size="tiny" data-testid="filter-reset" @click="store.resetFilters()">重置</n-button>
        </div>
        <label class="filter-label">分类</label>
        <n-select v-model:value="categoryFilter" data-testid="filter-category" size="small" :options="categoryFilterOptions" />
        <label class="filter-label">状态</label>
        <n-select v-model:value="statusFilter" data-testid="filter-status" size="small" :options="statusOptions" />
        <label class="filter-label">时间</label>
        <n-select v-model:value="timeFilter" data-testid="filter-time" size="small" :options="timeOptions" />
        <div class="filter-save">
          <n-input
            v-model:value="newFilterName"
            data-testid="filter-name"
            size="small"
            placeholder="筛选名称"
            @keyup.enter="saveCurrentFilter"
          />
          <n-button size="small" type="primary" data-testid="filter-save" @click="saveCurrentFilter">保存</n-button>
        </div>
        <div v-if="store.savedFilters.length" class="saved-list">
          <div v-for="f in store.savedFilters" :key="f.id" class="saved-row">
            <span class="saved-name" :title="f.name">{{ f.name }}</span>
            <n-button quaternary size="tiny" :data-testid="'filter-apply-' + f.id" @click="store.applySavedFilter(f.id)">应用</n-button>
            <n-button quaternary size="tiny" :data-testid="'filter-delete-' + f.id" @click="store.deleteSavedFilter(f.id)"><Trash2 :size="12" /></n-button>
          </div>
        </div>
      </div>
    </n-popover>
    <n-select
      class="topbar-select"
      data-testid="check-scope"
      :value="null"
      :options="scopeOptions"
      :disabled="store.checking"
      @update:value="onScopeChange"
    />
    <n-button
      :type="store.checking ? 'error' : 'default'"
      data-testid="btn-check-all"
      @click="store.checking ? emit('cancel-check') : $emit('check-all')"
    ><Square :size="14" /> {{ store.checking ? '取消检测' : '检测全部' }}</n-button>
    <n-button type="primary" data-testid="btn-add" @click="$emit('add')"><Plus :size="14" /> 添加</n-button>
    <n-button quaternary data-testid="btn-manage" @click="emit('manage')"><LayoutGrid :size="14" /> 管理</n-button>
    <n-button quaternary data-testid="btn-import-export" @click="emit('import-export')">导入/导出</n-button>
    <n-button quaternary data-testid="btn-settings" aria-label="设置" @click="$emit('settings')"><Settings :size="14" /></n-button>
  </header>
</template>
