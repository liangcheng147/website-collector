<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['check-all', 'cancel-check', 'add', 'import-export', 'settings', 'manage'])
</script>

<template>
  <header class="topbar">
    <span class="logo"><span class="lg-ic">GJ</span>归集</span>
    <input class="search" v-model="store.search" placeholder="搜索名称 / 链接 / 标签…" />
    <select v-model="store.selectedTag" class="btn">
      <option :value="null">标签筛选 ▾</option>
      <option v-for="t in store.data.tags" :key="t" :value="t">{{ t }}</option>
    </select>
    <button class="btn" :class="store.checking ? 'danger' : 'primary'" @click="store.checking ? emit('cancel-check') : $emit('check-all')">{{ store.checking ? '■ 取消检测' : '■ 检测全部' }}</button>
    <button class="btn" @click="$emit('add')">＋ 添加</button>
    <button class="btn" @click="emit('manage')">▦ 管理</button>
    <button class="btn" @click="$emit('import-export')">导入/导出</button>
    <button class="btn" @click="$emit('settings')">⚙</button>
  </header>
</template>