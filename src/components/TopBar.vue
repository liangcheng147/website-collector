<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { HTMLAttributes } from 'vue'
import { NInput, NSelect, NButton } from 'naive-ui'
import { Plus, LayoutGrid, Settings, Square, Search } from 'lucide-vue-next'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['check-all', 'cancel-check', 'add', 'import-export', 'settings', 'manage'])

const q = ref(store.search)
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { store.search = v }, 180)
})
onUnmounted(() => { if (timer) clearTimeout(timer) })

const tagOptions = computed(() => [
  { label: '标签筛选 ▾', value: '' },
  ...store.data.tags.map((t) => ({ label: t, value: t })),
])
const tagMenuProps = { 'data-testid': 'tag-filter-menu' } as HTMLAttributes
function onTagChange(v: string | number | null) {
  store.selectedTag = v === '' || v === null || v === undefined ? null : String(v)
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
      :value="store.selectedTag ?? ''"
      data-testid="tag-filter"
      :options="tagOptions"
      class="topbar-select"
      :menu-props="tagMenuProps"
      @update:value="onTagChange"
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
