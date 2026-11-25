<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, darkTheme, zhCN, dateZhCN } from 'naive-ui'
import { useAppStore, UNCATEGORIZED_ID } from './store/app'
import { resolveTheme, buildThemeOverrides } from './theme'
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
import DeadCleanupModal from './components/DeadCleanupModal.vue'
import ManageView from './components/ManageView.vue'
import CommandPalette from './components/CommandPalette.vue'
import type { Site, View } from './types'
import { checkForUpdate } from './updater'
import {
  useSidebarResize,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './composables/useSidebarResize'

const store = useAppStore()
// 与 store.applyAppearance 读同一个 resolveTheme，保证 data-theme 与 Naive 主题一致
const theme = computed(() => resolveTheme(store.settings))
const themeOverrides = computed(() => buildThemeOverrides(theme.value.palette, theme.value.dark))
const modal = ref<'' | 'add' | 'import' | 'settings'>('')
const editing = ref<Site | undefined>()
const modalDefaultCategoryId = ref<string | null>(null)
const pickIds = ref<string[]>([])
const tagIds = ref<string[]>([])
const deadCleanup = ref(false)
const manage = ref(false)
const paletteOpen = ref(false)
const {
  width: sidebarWidth,
  dragging: sidebarDragging,
  onPointerDown: onSidebarPointerDown,
  onDoubleClick: onSidebarDoubleClick,
  onKeydown: onSidebarKeydown,
} = useSidebarResize()
function openAdd() {
  editing.value = undefined
  modalDefaultCategoryId.value = store.view.kind === 'category' && store.view.id && store.view.id !== UNCATEGORIZED_ID ? store.view.id : null
  modal.value = 'add'
}
function openEdit(site?: Site) { if (!site) return; editing.value = site; modal.value = 'add' }
function onPaletteView(view: View) {
  manage.value = false
  store.setView(view)
}
/** 面板打开时 Esc 只由面板自己关闭，避免顺带清空后台弹窗/选择状态。 */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || paletteOpen.value) return
  modal.value = ''
  pickIds.value = []
  tagIds.value = []
  deadCleanup.value = false
  store.clearSelection()
}
function onGlobalKey(e: KeyboardEvent) {
  // Ctrl+K / Cmd+K 全局可用：焦点在输入框内也照常打开（浏览器默认行为被拦下）
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  onKey(e)
}
onMounted(async () => {
  document.addEventListener('keydown', onGlobalKey)
  await store.init()
  if (store.settings.autoCheckUpdate) {
    const res = await checkForUpdate()
    if (res.ok && res.update) store.flash(`发现新版本 v${res.update.version}，请到设置 → 关于中更新`, 6000)
  }
})
onUnmounted(() => document.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <!-- abstract：不渲染包裹元素，保住 #app > .app 的 height:100% 链 -->
  <!-- preflight-style-disabled：跳过 Naive 全局 reset，且不用 n-global-style（透明窗口会露白） -->
  <n-config-provider
    abstract
    preflight-style-disabled
    :theme="theme.dark ? darkTheme : null"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-dialog-provider>
      <n-message-provider>
        <div class="app">
          <TitleBar />
          <TopBar @add="openAdd" @import-export="modal = 'import'" @settings="modal = 'settings'" @cancel-check="store.cancelCheck" @check-scope="(scope) => store.checkByScope(scope)" @manage="manage = true" />
          <div class="body" :style="{ gridTemplateColumns: sidebarWidth + 'px 1fr' }">
            <ManageView v-if="manage" @back="manage = false" @dead-cleanup="deadCleanup = true" />
            <template v-else>
              <Sidebar />
              <main class="content">
                <RecycleView v-if="store.view.kind === 'recycle'" />
                <SiteTable v-else @edit="openEdit" @check-site="(ids: string[]) => ids.length === 1 ? store.checkOne(ids[0]) : store.checkSelected()" @move="pickIds = $event" @tag="tagIds = $event" @cleanup="deadCleanup = true" />
              </main>
              <div
                class="sidebar-resizer"
                :class="{ dragging: sidebarDragging }"
                data-testid="sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整侧栏宽度"
                :aria-valuemin="SIDEBAR_MIN_WIDTH"
                :aria-valuemax="SIDEBAR_MAX_WIDTH"
                :aria-valuenow="sidebarWidth"
                tabindex="0"
                :style="{ left: sidebarWidth + 'px' }"
                @pointerdown="onSidebarPointerDown"
                @dblclick="onSidebarDoubleClick"
                @keydown="onSidebarKeydown"
              />
            </template>
          </div>
          <StatusBar />
          <AddEditModal v-if="modal === 'add'" :editing="editing" :default-category-id="modalDefaultCategoryId" @close="modal = ''" />
          <ImportExportModal v-if="modal === 'import'" @close="modal = ''" />
          <SettingsModal v-if="modal === 'settings'" @close="modal = ''" />
          <PickCategoryModal v-if="pickIds.length" :site-ids="pickIds" @close="pickIds = []" />
          <AddTagsModal v-if="tagIds.length" :site-ids="tagIds" @close="tagIds = []" />
          <DeadCleanupModal v-if="deadCleanup" @close="deadCleanup = false" />
          <CommandPalette
            v-if="paletteOpen"
            @close="paletteOpen = false"
            @add="openAdd"
            @import-export="modal = 'import'"
            @check-all="store.checkAll"
            @settings="modal = 'settings'"
            @manage="manage = true"
            @cleanup="deadCleanup = true"
            @view="onPaletteView"
          />
        </div>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>

<style scoped>
.body { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 170px 1fr; }
.body > * { min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }

.sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-3px);
  cursor: col-resize;
  touch-action: none;
  background: transparent;
  z-index: 5;
}
.sidebar-resizer:hover,
.sidebar-resizer.dragging { background: var(--primary); }
.sidebar-resizer:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
</style>