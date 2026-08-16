<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <footer class="statusbar">
    <span>共 {{ store.data.sites.length }} 个网站</span>
    <span class="bad">失效 {{ store.deadCount }}</span>
    <span>未检测 {{ store.data.sites.filter(s => s.status === 'unknown').length }}</span>
    <span>上次检测 {{ store.lastCheckTime }}</span>
    <span v-if="store.checking">检测中 {{ store.progress.done }}/{{ store.progress.total }}</span>
    <span v-if="store.connectivityError" class="pending-hint">⚠ 网络似乎断开，检测已中止</span>
  </footer>
</template>