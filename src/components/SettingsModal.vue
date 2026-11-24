<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
import type { HTMLAttributes } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import {
  NModal, NTabs, NTabPane, NSelect, NSlider, NSwitch, NProgress, NButton,
  NInput, NRadioGroup, NRadio, NText, NSpace, NAlert, useDialog,
} from 'naive-ui'
import * as api from '../api'
import * as updater from '../updater'
import { PALETTES, type Palette } from '../theme'
import { useAppStore } from '../store/app'
import type { BackupInfo, CheckScope } from '../types'
const emit = defineEmits(['close'])
const store = useAppStore()
const dialog = useDialog()
const filePath = ref('')
const msg = ref('')
const section = ref('theme')
onMounted(async () => {
  filePath.value = await api.getDataFilePath()
  appVersion.value = await getVersion()
  await refreshBackups()
})
const appVersion = ref('')
const updateState = ref<'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error'>('idle')
// shallowRef, not ref: an Update is a Tauri Resource, and Resource keeps its
// resource id in a real private field. ref() would wrap it in a deep reactive
// Proxy, and reading that private field through a Proxy fails the brand check
// with "Cannot read private member from an object whose class did not declare
// it" -- which is what broke downloadAndInstall().
const updateInfo = shallowRef<updater.Update | null>(null)
const userAgent = navigator.userAgent
const downloadPct = ref(0)
const downloadKnown = ref(false)
const updateMsg = ref('')

const themeModeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '亮色', value: 'light' },
  { label: '暗色', value: 'dark' },
]
function setTheme(v: string | number | null) {
  store.updateSettings({ theme: v === 'light' || v === 'dark' ? v : 'system' })
}
// 用 computed get/set 走 updateSettings，直接写 store.settings 不会持久化
const zoom = computed({
  get: () => store.settings.zoom,
  set: (v: number) => { store.updateSettings({ zoom: v }) },
})
const autoCheckUpdate = computed({
  get: () => store.settings.autoCheckUpdate,
  set: (v: boolean) => { store.updateSettings({ autoCheckUpdate: v }) },
})
function setPalette(id: string | number | boolean | null) {
  if (typeof id === 'string') store.updateSettings({ palette: id })
}
function toggleAutoCheck() {
  store.updateSettings({ autoCheckUpdate: !store.settings.autoCheckUpdate })
}
function toggleAutoFetchFavicon() {
  store.updateSettings({ autoFetchFavicon: !store.settings.autoFetchFavicon })
}
// 检查策略：统一走 updateSettings，直接写 store.settings 不会持久化
const autoCheck = computed({
  get: () => store.settings.autoCheck,
  set: (v: boolean) => { store.updateSettings({ autoCheck: v }) },
})
const checkInterval = computed({
  get: () => store.settings.checkInterval,
  set: (v: number) => { store.updateSettings({ checkInterval: v }) },
})
const retryCount = computed({
  get: () => store.settings.retryCount,
  set: (v: number) => { store.updateSettings({ retryCount: v }) },
})
const concurrency = computed({
  get: () => store.settings.concurrency,
  set: (v: number) => { store.updateSettings({ concurrency: v }) },
})
function setCheckScope(v: string | number | null) {
  if (v === null || v === undefined) return
  store.updateSettings({ checkScope: String(v) as CheckScope })
}
function toggleAutoCheckSites() {
  store.updateSettings({ autoCheck: !store.settings.autoCheck })
}
const checkScopeOptions = [
  { label: '全部站点', value: 'all' },
  { label: '当前分类', value: 'category' },
  { label: '当前标签', value: 'tag' },
  { label: '所选站点', value: 'selected' },
]
// 色板色块跟随当前主题（跟随系统时按系统偏好），保证预览与生效配色一致
const isDark = computed(() => {
  const mode = store.settings.theme
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
})
function swatchColor(p: Palette) {
  return (isDark.value ? p.dark : p.light).primary
}
async function checkNow() {
  updateState.value = 'checking'; updateMsg.value = ''
  const res = await updater.checkForUpdate()
  if (!res.ok) { updateState.value = 'error'; updateMsg.value = '检查失败：' + res.error; return }
  if (res.update) { updateInfo.value = res.update; updateState.value = 'available' }
  else { updateState.value = 'none'; updateMsg.value = '已是最新版本' }
}
async function installNow() {
  const update = updateInfo.value
  if (!update) return
  updateState.value = 'downloading'; downloadPct.value = 0; downloadKnown.value = false
  try {
    await updater.downloadAndInstall(update, (p) => {
      if (p.finished) { downloadPct.value = 100; downloadKnown.value = false; return }
      const total = p.total ?? 0
      if (total > 0) { downloadKnown.value = true; downloadPct.value = Math.min(100, Math.round((p.downloaded / total) * 100)) }
    })
    updateState.value = 'ready'
  } catch (e) { updateState.value = 'error'; updateMsg.value = '下载失败：' + e }
}
async function doRelaunch() { await updater.relaunchApp() }
async function openDir() {
  try { await api.openDataDir(); msg.value = '已打开数据目录' } catch (e) { msg.value = '打开失败：' + e }
}
const APP_NAME = 'SiteCollector'
const REPO_URL = 'https://github.com/liangcheng147/website-collector'
const ISSUES_URL = `${REPO_URL}/issues`
const RELEASES_URL = `${REPO_URL}/releases`
function openExternal(url: string) { void api.openLink(url) }
const copyHint = ref('')
async function copyDiagnostics() {
  const text = `${APP_NAME} v${appVersion.value}\nUser-Agent: ${userAgent}`
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    copyHint.value = '已复制诊断信息'
  } catch {
    copyHint.value = '复制失败，请手动复制'
  }
}

/** 与 Rust `data::MAX_BACKUPS` 保持一致；保留策略在备份目录侧强制执行。 */
const MAX_LOCAL_BACKUPS = 10
const backups = ref<BackupInfo[]>([])
const backupBusy = ref(false)
const backupMsg = ref('')
/** 恢复确认/执行保护：防止重复点击弹多个确认框或并发恢复。 */
const restoreBusy = ref(false)
const restoringPath = ref('')

function resetRestoreGuard() {
  // 恢复仍在执行时（restoringPath 已置位）不解除保护，由 finally 统一复位。
  if (restoringPath.value) return
  restoreBusy.value = false
}

async function refreshBackups() {
  try { backups.value = await api.listBackups() }
  catch (e) { backupMsg.value = '读取备份失败：' + e }
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}
function formatBackupTime(ms: number): string {
  return new Date(ms).toLocaleString()
}
async function makeBackup() {
  if (backupBusy.value) return
  backupBusy.value = true
  backupMsg.value = ''
  try {
    await api.createBackup()
    backupMsg.value = '已创建备份'
    await refreshBackups()
  } catch (e) { backupMsg.value = '备份失败：' + e }
  finally { backupBusy.value = false }
}
function askRestore(b: BackupInfo) {
  // 确认框打开期间也占用保护位，重复点击不会叠加多个对话框。
  if (restoreBusy.value) return
  restoreBusy.value = true
  restoringPath.value = ''
  dialog.warning({
    title: '恢复备份',
    content: `确定用 ${b.fileName}（${formatBackupTime(b.createdAt)}）覆盖当前数据？恢复前会自动为当前数据创建一份快照。`,
    positiveText: '恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (restoringPath.value) return false // 已有恢复在途，忽略重复确认
      restoringPath.value = b.path
      try {
        const restored = await api.restoreBackup(b.path)
        store.replaceDataFromBackup(restored)
        backupMsg.value = `已恢复备份：${b.fileName}`
        await refreshBackups()
      } catch (e) { backupMsg.value = '恢复失败：' + e }
      finally { restoreBusy.value = false; restoringPath.value = '' }
    },
    onNegativeClick: resetRestoreGuard,
    onMaskClick: resetRestoreGuard,
    onEsc: resetRestoreGuard,
    onClose: resetRestoreGuard,
  })
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="设置"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(640px, 92%)' }"
    content-style="padding: 0"
    data-testid="modal-settings"
    @update:show="emit('close')"
  >
    <n-tabs
      class="settings-tabs"
      placement="left"
      type="line"
      v-model:value="section"
    >
      <!-- 主题 -->
      <n-tab-pane name="theme" tab="主题" :tab-props="{ 'data-testid': 'settings-tab-theme' } as HTMLAttributes">
        <n-space vertical :size="16" class="settings-pane">
          <div class="settings-group">
            <n-text class="group-title" depth="1">主题模式</n-text>
            <n-select :value="store.settings.theme" :options="themeModeOptions" @update:value="setTheme" />
            <n-text class="group-hint" depth="3">跟随系统：启动时读取系统主题，运行中不实时切换。</n-text>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1">配色方案</n-text>
            <n-radio-group :value="store.settings.palette" class="palette-grid" @update:value="setPalette">
              <n-radio
                v-for="p in PALETTES"
                :key="p.id"
                :value="p.id"
                class="palette-option"
                :label="p.name"
              >
                <span class="palette-dot" :style="{ '--swatch-color': swatchColor(p) }"></span>
                <span class="palette-name">{{ p.name }}</span>
              </n-radio>
            </n-radio-group>
            <n-text class="group-hint" depth="3">配色实时应用到界面与弹窗。</n-text>
          </div>
        </n-space>
      </n-tab-pane>

      <!-- 显示 -->
      <n-tab-pane name="display" tab="显示" :tab-props="{ 'data-testid': 'settings-tab-display' } as HTMLAttributes">
        <n-space vertical :size="16" class="settings-pane">
          <div class="settings-group">
            <n-text class="group-title" depth="1">界面缩放</n-text>
            <div class="slider-row">
              <n-text class="slider-bound" depth="3">80%</n-text>
              <n-slider v-model:value="zoom" :min="80" :max="200" :step="10" />
              <n-text class="slider-value">{{ store.settings.zoom }}%</n-text>
            </div>
            <n-text class="group-hint" depth="3">整体放大或缩小界面文字与控件，步进 10%。</n-text>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1">站点图标</n-text>
            <div class="switch-row">
              <n-switch :value="store.settings.autoFetchFavicon" aria-labelledby="auto-favicon-label" @update:value="toggleAutoFetchFavicon" />
              <span id="auto-favicon-label" @click="toggleAutoFetchFavicon">自动抓取图标</span>
            </div>
            <n-text class="group-hint" depth="3">关闭后仍可点链接输入框旁的「获取图标」手动抓取。</n-text>
          </div>
        </n-space>
      </n-tab-pane>

      <!-- 检查 -->
      <n-tab-pane name="check" tab="检查" :tab-props="{ 'data-testid': 'settings-tab-check' } as HTMLAttributes">
        <n-space vertical :size="16" class="settings-pane">
          <div class="settings-group">
            <n-text class="group-title" depth="1">自动检查</n-text>
            <div class="switch-row">
              <n-switch v-model:value="autoCheck" aria-labelledby="auto-check-label" />
              <span id="auto-check-label" @click="toggleAutoCheckSites">启用自动检查</span>
            </div>
            <n-text class="group-hint" depth="3">当前版本仅保存偏好，定时调度将在后续版本接入。</n-text>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1" id="settings-interval-label">检查频率</n-text>
            <div class="slider-row">
              <n-text class="slider-bound" depth="3">0</n-text>
              <n-slider v-model:value="checkInterval" :min="0" :max="120" :step="5" aria-labelledby="settings-interval-label" />
              <n-text class="slider-value">{{ store.settings.checkInterval }} 分钟</n-text>
            </div>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1" id="settings-check-scope-label">默认范围</n-text>
            <n-select
              :value="store.settings.checkScope"
              :options="checkScopeOptions"
              aria-labelledby="settings-check-scope-label"
              @update:value="setCheckScope"
            />
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1" id="settings-retry-label">重试次数</n-text>
            <div class="slider-row">
              <n-text class="slider-bound" depth="3">0</n-text>
              <n-slider v-model:value="retryCount" :min="0" :max="5" :step="1" aria-labelledby="settings-retry-label" />
              <n-text class="slider-value">{{ store.settings.retryCount }} 次</n-text>
            </div>
            <n-text class="group-hint" depth="3">检测失败后的额外重试次数。</n-text>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1" id="settings-concurrency-label">并发上限</n-text>
            <div class="slider-row">
              <n-text class="slider-bound" depth="3">1</n-text>
              <n-slider v-model:value="concurrency" :min="1" :max="10" :step="1" aria-labelledby="settings-concurrency-label" />
              <n-text class="slider-value">{{ store.settings.concurrency }} 路</n-text>
            </div>
            <n-text class="group-hint" depth="3">同时检测的站点数，限制可减轻目标站点压力。</n-text>
          </div>
        </n-space>
      </n-tab-pane>

      <!-- 数据存储 -->
      <n-tab-pane name="storage" tab="数据存储" :tab-props="{ 'data-testid': 'settings-tab-storage' } as HTMLAttributes">
        <n-space vertical :size="16" class="settings-pane">
          <div class="settings-group">
            <n-text class="group-title" depth="1">数据文件</n-text>
            <div class="path-row">
              <n-input :value="filePath" readonly />
              <n-button @click="openDir">打开数据目录</n-button>
            </div>
          </div>
          <n-text class="group-hint" depth="3">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</n-text>
          <n-alert v-if="store.location.isFallback" type="warning" :bordered="false">
            当前正使用系统目录（安装位置无写入权限）。
          </n-alert>
          <n-text v-if="msg" class="group-hint" depth="3">{{ msg }}</n-text>
          <div class="settings-group">
            <n-text class="group-title" depth="1">本地备份</n-text>
            <n-text class="group-hint" depth="3">
              备份保存在数据目录的 <code>backups/</code>，仅保留最近 {{ MAX_LOCAL_BACKUPS }} 份，超出自动删除最旧的一份。
            </n-text>
            <div class="backup-actions">
              <n-button size="small" type="primary" :loading="backupBusy" data-testid="btn-create-backup" @click="makeBackup">立即备份</n-button>
              <n-button
                size="small"
                type="primary"
                :disabled="!backups.length || restoreBusy"
                :loading="!!backups.length && restoringPath === backups[0].path"
                data-testid="btn-restore-latest-backup"
                @click="askRestore(backups[0])"
              >恢复最近备份</n-button>
              <n-text v-if="backupMsg" class="group-hint" depth="3">{{ backupMsg }}</n-text>
            </div>
            <div v-if="backups.length" class="backup-list" data-testid="backup-list">
              <div v-for="b in backups" :key="b.path" class="backup-row" data-testid="backup-row">
                <div class="backup-meta">
                  <span class="backup-name" :title="b.fileName">{{ b.fileName }}</span>
                  <span class="backup-sub">{{ formatBackupTime(b.createdAt) }} · {{ formatSize(b.size) }}</span>
                </div>
                <n-button
                  size="tiny"
                  quaternary
                  class="backup-restore"
                  :aria-label="`恢复备份 ${b.fileName}`"
                  :disabled="restoreBusy"
                  :loading="restoringPath === b.path"
                  @click="askRestore(b)"
                >恢复</n-button>
              </div>
            </div>
            <n-text v-else class="group-hint" depth="3">暂无备份。点击「立即备份」创建第一份；恢复前也会自动为当前数据留一份快照。</n-text>
          </div>
        </n-space>
      </n-tab-pane>

      <!-- 关于 -->
      <n-tab-pane name="about" tab="关于" :tab-props="{ 'data-testid': 'settings-tab-about' } as HTMLAttributes">
        <n-space vertical :size="16" class="settings-pane">
          <div class="settings-group">
            <n-text class="group-title" depth="1">应用信息</n-text>
            <div class="app-head">
              <span class="app-name">{{ APP_NAME }}</span> <span class="app-version">v{{ appVersion }}</span>
            </div>
            <n-text class="group-hint" depth="3">本地优先的网站收藏与可用性检测桌面应用</n-text>
            <div class="link-row">
              <n-button size="small" quaternary @click="openExternal(REPO_URL)">GitHub 仓库</n-button>
              <n-button size="small" quaternary @click="openExternal(ISSUES_URL)">问题反馈</n-button>
              <n-button size="small" quaternary @click="openExternal(RELEASES_URL)">发布页</n-button>
            </div>
            <n-text class="group-hint" depth="3">MIT License · Copyright (c) 2026 fan-root</n-text>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1">更新</n-text>
            <n-button type="primary" :disabled="updateState === 'checking' || updateState === 'downloading'" @click="checkNow">检查更新</n-button>
            <n-text v-if="updateState === 'checking'" class="group-hint" depth="3">检查中…</n-text>
            <n-text v-else-if="updateState === 'none'" class="group-hint" depth="3">{{ updateMsg }}</n-text>
            <template v-else-if="updateState === 'available' && updateInfo">
              <n-text>发现新版本 v{{ updateInfo.version }}</n-text>
              <n-text class="group-hint pre-wrap" depth="3">{{ updateInfo.body }}</n-text>
              <n-button type="primary" @click="installNow">下载并安装</n-button>
            </template>
            <template v-else-if="updateState === 'downloading'">
              <template v-if="downloadKnown">
                <n-text class="group-hint" depth="3">下载中 {{ downloadPct }}%</n-text>
                <n-progress type="line" :percentage="downloadPct" :show-indicator="false" />
              </template>
              <n-text v-else class="group-hint" depth="3">下载中…</n-text>
            </template>
            <template v-else-if="updateState === 'ready'">
              <n-text>已下载完成，重启后生效。</n-text>
              <n-button type="primary" @click="doRelaunch">立即重启</n-button>
            </template>
            <n-text v-else-if="updateState === 'error'" class="group-hint" depth="3">{{ updateMsg }}</n-text>
            <div class="switch-row">
              <n-switch v-model:value="autoCheckUpdate" aria-labelledby="auto-update-label" />
              <span id="auto-update-label" @click="toggleAutoCheck">启动时自动检查更新</span>
            </div>
          </div>
          <div class="settings-group">
            <n-text class="group-title" depth="1">诊断信息</n-text>
            <n-text class="diag-label" depth="3">User Agent</n-text>
            <n-text class="group-hint diag-value" depth="3">{{ userAgent }}</n-text>
            <div class="diag-actions">
              <n-button size="small" secondary @click="copyDiagnostics">复制诊断信息</n-button>
              <n-text v-if="copyHint" class="group-hint" depth="3">{{ copyHint }}</n-text>
            </div>
          </div>
        </n-space>
      </n-tab-pane>
    </n-tabs>
    <template #footer>
      <div class="modal-footer"><n-button @click="emit('close')">关闭</n-button></div>
    </template>
  </n-modal>
</template>

<style scoped>
.settings-tabs { height: 480px; }
.settings-tabs :deep(.n-tab-pane) { padding: 18px 20px; overflow-y: auto; }
.settings-pane { width: 100%; }
.settings-group { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.settings-group > .n-input { width: 100%; }
.path-row { display: flex; gap: 8px; align-items: center; width: 100%; }
.path-row .n-input { flex: 1; min-width: 0; width: auto; }
.path-row .n-button { flex: none; }
.backup-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.backup-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}
.backup-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--border); }
.backup-row:last-child { border-bottom: none; }
.backup-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 2px; }
.backup-name {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.backup-sub { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.backup-restore { flex: none; }
.group-title { font-size: 12px; font-weight: 600; }
.group-hint { display: block; }
.group-hint code {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  font-family: var(--mono);
}
.palette-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; }
.palette-option { margin: 0; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); transition: border-color .15s var(--ease); }
.palette-option:hover { border-color: var(--primary); }
.palette-option.n-radio--checked { border-color: var(--primary); box-shadow: var(--ring); }
.palette-option :deep(.n-radio__label) { display: flex; align-items: center; gap: 6px; width: 100%; }
.palette-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--swatch-color); flex-shrink: 0; }
.palette-name { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slider-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.slider-row .n-slider { flex: 1; }
.slider-bound { flex: none; }
.slider-value { flex: none; min-width: 42px; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.switch-row { display: flex; align-items: center; gap: 8px; }
.switch-row span { cursor: pointer; }
.pre-wrap { white-space: pre-wrap; }
.app-head { font-size: 16px; font-weight: 700; }
.app-version { color: var(--primary); margin-left: 6px; font-weight: 600; }
.link-row { display: flex; gap: 8px; flex-wrap: wrap; }
.diag-label { display: block; font-size: 12px; }
.diag-value { display: block; word-break: break-all; font-family: var(--mono); font-size: 12px; }
.diag-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
