<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { getVersion } from '@tauri-apps/api/app'
import { NModal, NTabs, NTabPane, NSelect, NSlider, NSwitch, NProgress, NButton } from 'naive-ui'
import * as api from '../api'
import * as updater from '../updater'
import { PALETTES } from '../theme'
import { useAppStore } from '../store/app'
const emit = defineEmits(['close'])
const store = useAppStore()
const filePath = ref('')
const msg = ref('')
const section = ref('theme')
onMounted(async () => {
  filePath.value = await api.getDataFilePath()
  appVersion.value = await getVersion()
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
function setPalette(id: string) {
  store.updateSettings({ palette: id })
}
function toggleAutoCheck() {
  store.updateSettings({ autoCheckUpdate: !store.settings.autoCheckUpdate })
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
      class="modal-content"
      placement="left"
      type="line"
      :style="{ height: '480px' }"
      v-model:value="section"
    >
      <!-- 主题 -->
      <n-tab-pane name="theme" tab="主题" :tab-props="{ role: 'tab' }">
        <label>主题模式</label>
        <n-select :value="store.settings.theme" :options="themeModeOptions" @update:value="setTheme" />
        <p class="muted">跟随系统：启动时读取系统主题，运行中不实时切换。</p>
        <label class="mt-14">配色方案</label>
        <div class="palette-grid">
          <button
            v-for="p in PALETTES"
            :key="p.id"
            class="palette-swatch"
            :class="{ active: store.settings.palette === p.id }"
            :style="{ '--swatch-color': p.light.primary }"
            :title="p.name"
            @click="setPalette(p.id)"
          >
            <span class="palette-dot"></span>
            <span class="palette-name">{{ p.name }}</span>
          </button>
        </div>
      </n-tab-pane>

      <!-- 显示 -->
      <n-tab-pane name="display" tab="显示" :tab-props="{ role: 'tab' }">
        <label>界面缩放（{{ store.settings.zoom }}%）</label>
        <div class="slider-row">
          <span class="muted">80%</span>
          <n-slider v-model:value="zoom" :min="80" :max="200" :step="10" />
          <span class="muted">200%</span>
        </div>
        <p class="muted">整体放大或缩小界面文字与控件，步进 10%。</p>
      </n-tab-pane>

      <!-- 数据存储 -->
      <n-tab-pane name="storage" tab="数据存储" :tab-props="{ role: 'tab' }">
        <div class="modal-cols">
          <div>
            <label>数据文件</label>
            <input :value="filePath" readonly />
            <div class="actions actions-start"><n-button type="primary" @click="openDir">打开数据目录</n-button></div>
          </div>
          <div class="help">
            <label>存储说明</label>
            <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
            <p v-if="store.location.isFallback" class="muted text-pending"><AlertTriangle :size="12" /> 当前正使用系统目录（安装位置无写入权限）。</p>
          </div>
        </div>
        <p class="muted">{{ msg }}</p>
      </n-tab-pane>

      <!-- 关于 -->
      <n-tab-pane name="about" tab="关于" :tab-props="{ role: 'tab' }">
        <label>软件</label>
        <p>SiteCollector v{{ appVersion }}</p>
        <label class="mt-14">链接</label>
        <p class="muted"><a @click.prevent="api.openLink('https://github.com/liangcheng147/website-collector')">GitHub 仓库</a> · 作者 bjb · MIT License</p>
        <label class="mt-14">更新</label>
        <div class="actions actions-start">
          <n-button type="primary" :disabled="updateState === 'checking' || updateState === 'downloading'" @click="checkNow">检查更新</n-button>
        </div>
        <p v-if="updateState === 'checking'" class="muted">检查中…</p>
        <p v-else-if="updateState === 'none'" class="muted">{{ updateMsg }}</p>
        <div v-else-if="updateState === 'available' && updateInfo">
          <p>发现新版本 v{{ updateInfo.version }}</p>
          <p class="muted pre-wrap">{{ updateInfo.body }}</p>
          <n-button type="primary" @click="installNow">下载并安装</n-button>
        </div>
        <div v-else-if="updateState === 'downloading'">
          <template v-if="downloadKnown">
            <p class="muted">下载中 {{ downloadPct }}%</p>
            <n-progress type="line" :percentage="downloadPct" />
          </template>
          <p v-else class="muted">下载中…</p>
        </div>
        <div v-else-if="updateState === 'ready'">
          <p>已下载完成，重启后生效。</p>
          <n-button type="primary" @click="doRelaunch">立即重启</n-button>
        </div>
        <p v-else-if="updateState === 'error'" class="muted">{{ updateMsg }}</p>
        <div class="switch-row mt-14">
          <n-switch v-model:value="autoCheckUpdate" aria-labelledby="auto-update-label" />
          <span id="auto-update-label" @click="toggleAutoCheck">启动时自动检查更新</span>
        </div>
        <label class="mt-14">技术信息</label>
        <p class="muted">{{ userAgent }}</p>
      </n-tab-pane>
    </n-tabs>
    <template #footer>
      <div class="actions modal-footer"><n-button @click="emit('close')">关闭</n-button></div>
    </template>
  </n-modal>
</template>
