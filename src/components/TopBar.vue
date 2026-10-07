<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
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
</script>

<template>
  <header class="topbar">
    <span class="logo"><span class="lg-ic">GJ</span>归集</span>
    <div style="position:relative;flex:1;max-width:300px;">
      <Search :size="14" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--text-2);pointer-events:none;" />
      <input class="search" v-model="q" placeholder="搜索名称 / 链接 / 标签…" style="width:100%;padding-left:28px;" />
    </div>
    <select v-model="store.selectedTag" class="btn">
      <option :value="null">标签筛选 ▾</option>
      <option v-for="t in store.data.tags" :key="t" :value="t">{{ t }}</option>
    </select>
    <button class="btn" :class="store.checking ? 'danger' : ''" @click="store.checking ? emit('cancel-check') : $emit('check-all')"><Square :size="14" /> {{ store.checking ? '取消检测' : '检测全部' }}</button>
    <button class="btn primary" @click="$emit('add')"><Plus :size="14" /> 添加</button>
    <button class="btn btn-ghost" @click="emit('manage')"><LayoutGrid :size="14" /> 管理</button>
    <button class="btn btn-ghost" @click="$emit('import-export')">导入/导出</button>
    <button class="btn btn-ghost" aria-label="设置" @click="$emit('settings')"><Settings :size="14" /></button>
  </header>
</template>