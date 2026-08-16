<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAppStore } from './store/app'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import SiteTable from './components/SiteTable.vue'
import StatusBar from './components/StatusBar.vue'
import AddEditModal from './components/AddEditModal.vue'
import ImportExportModal from './components/ImportExportModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import type { Site } from './types'

const store = useAppStore()
const modal = ref<'' | 'add' | 'import' | 'settings'>('')
const editing = ref<Site | undefined>()
function openAdd() { editing.value = undefined; modal.value = 'add' }
function openEdit(site?: Site) { if (!site) return; editing.value = site; modal.value = 'add' }
onMounted(() => { store.init() })
</script>

<template>
  <div class="app">
    <TopBar @add="openAdd" @import-export="modal = 'import'" @settings="modal = 'settings'" />
    <div class="body">
      <Sidebar />
      <main class="content"><SiteTable @edit="openEdit" /></main>
    </div>
    <StatusBar />
    <AddEditModal v-if="modal === 'add'" :editing="editing" @close="modal = ''" />
    <ImportExportModal v-if="modal === 'import'" @close="modal = ''" />
    <SettingsModal v-if="modal === 'settings'" @close="modal = ''" />
  </div>
</template>

<style scoped>
.body { display: grid; grid-template-columns: 200px 1fr; min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }
</style>