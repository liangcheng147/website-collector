<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <footer class="statusbar">
    <span>共 {{ store.data.sites.length }} 个网站</span>
    <span class="bad">失效 {{ store.deadCount }}</span>
    <span>未检测 {{ store.data.sites.filter(s => s.status === 'unknown').length }}</span>
  </footer>
</template>