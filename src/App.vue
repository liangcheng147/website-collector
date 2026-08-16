<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from './store/app'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import SiteTable from './components/SiteTable.vue'
import StatusBar from './components/StatusBar.vue'

const store = useAppStore()
onMounted(() => { store.init() })
</script>

<template>
  <div class="app">
    <TopBar />
    <div class="body">
      <Sidebar />
      <main class="content"><SiteTable /></main>
    </div>
    <StatusBar />
  </div>
</template>

<style scoped>
.body { display: grid; grid-template-columns: 200px 1fr; min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }
</style>