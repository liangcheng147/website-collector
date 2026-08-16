<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
function heart(s: string) { return s === 'ok' ? '♥♥♥' : s === 'dead' ? '♥' : '♥?' }
</script>

<template>
  <table class="site-table">
    <thead>
      <tr><th></th><th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th></tr>
    </thead>
    <tbody>
      <tr v-for="s in store.filteredSites" :key="s.id">
        <td><span class="cb"></span></td>
        <td :class="{ 'name-dead': s.status === 'dead' }">{{ s.name }}</td>
        <td class="muted">{{ s.url }}</td>
        <td class="muted">{{ s.categoryId }}</td>
        <td><span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span></td>
        <td :class="{ 'ok': s.status === 'ok', 'dead': s.status === 'dead', 'pending': s.status === 'unknown' }">{{ heart(s.status) }}</td>
      </tr>
    </tbody>
  </table>
</template>