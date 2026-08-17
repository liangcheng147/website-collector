<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <header class="topbar">
    <span class="logo"><span class="lg-ic">GJ</span>归集</span>
    <input class="search" v-model="store.search" placeholder="搜索名称 / 链接 / 标签…" />
    <select v-model="store.selectedTag" class="btn">
      <option :value="null">标签筛选 ▾</option>
      <option v-for="t in store.data.tags" :key="t" :value="t">{{ t }}</option>
    </select>
    <button class="btn primary" @click="$emit('check-all')">▶ 检测全部</button>
    <button class="btn" @click="$emit('add')">＋ 添加</button>
    <button class="btn" @click="$emit('import-export')">导入/导出</button>
    <button class="btn" @click="$emit('settings')">⚙</button>
  </header>
</template>