<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from './store/app'
import TitleBar from './components/TitleBar.vue'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import SiteTable from './components/SiteTable.vue'
import StatusBar from './components/StatusBar.vue'
import RecycleView from './components/RecycleView.vue'
import AddEditModal from './components/AddEditModal.vue'
import ImportExportModal from './components/ImportExportModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import PickCategoryModal from './components/PickCategoryModal.vue'
import AddTagsModal from './components/AddTagsModal.vue'
import ManageView from './components/ManageView.vue'
import type { Site } from './types'

const store = useAppStore()
const modal = ref<'' | 'add' | 'import' | 'settings'>('')
const editing = ref<Site | undefined>()
const modalDefaultCategoryId = ref<string | null>(null)
const pickIds = ref<string[]>([])
const tagIds = ref<string[]>([])
const manage = ref(false)
function openAdd() {
  editing.value = undefined
  modalDefaultCategoryId.value = store.view.kind === 'category' ? (store.view.id ?? null) : null
  modal.value = 'add'
}
function openEdit(site?: Site) { if (!site) return; editing.value = site; modal.value = 'add' }
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  modal.value = ''
  pickIds.value = []
  tagIds.value = []
  store.clearSelection()
}
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  await store.init()
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app">
    <TitleBar />
    <TopBar @add="openAdd" @import-export="modal = 'import'" @settings="modal = 'settings'" @check-all="store.checkAll" @manage="manage = true" />
    <div class="body">
      <ManageView v-if="manage" @back="manage = false" />
      <template v-else>
        <Sidebar />
        <main class="content">
          <RecycleView v-if="store.view.kind === 'recycle'" />
          <SiteTable v-else @edit="openEdit" @check-site="(ids: string[]) => ids.length === 1 ? store.checkOne(ids[0]) : store.checkSelected()" @move="pickIds = $event" @tag="tagIds = $event" />
        </main>
      </template>
    </div>
    <StatusBar />
    <AddEditModal v-if="modal === 'add'" :editing="editing" :default-category-id="modalDefaultCategoryId" @close="modal = ''" />
    <ImportExportModal v-if="modal === 'import'" @close="modal = ''" />
    <SettingsModal v-if="modal === 'settings'" @close="modal = ''" />
    <PickCategoryModal v-if="pickIds.length" :site-ids="pickIds" @close="pickIds = []" />
    <AddTagsModal v-if="tagIds.length" :site-ids="tagIds" @close="tagIds = []" />
  </div>
</template>

<style scoped>
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 170px 1fr; }
.body > * { min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }
</style>