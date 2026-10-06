<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { getVersion } from '@tauri-apps/api/app'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
import * as updater from '../updater'
import { useAppStore } from '../store/app'
const emit = defineEmits(['close'])
const store = useAppStore()
const filePath = ref('')
const msg = ref('')
const section = ref<'theme' | 'display' | 'storage' | 'about'>('theme')
onMounted(async () => {
  filePath.value = await api.getDataFilePath()
  appVersion.value = await getVersion()
})
const appVersion = ref('')
const updateState = ref<'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error'>('idle')
const updateInfo = ref<updater.Update | null>(null)
const userAgent = navigator.userAgent
const downloadPct = ref(0)
const downloadKnown = ref(false)
const updateMsg = ref('')
async function checkNow() {
  updateState.value = 'checking'; updateMsg.value = ''
  const res = await updater.checkForUpdate()
  if (!res.ok) { updateState.value = 'error'; updateMsg.value = '检查失败：' + res.error; return }
  if (res.update) { updateInfo.value = res.update; updateState.value = 'available' }
  else { updateState.value = 'none'; updateMsg.value = '已是最新版本' }
}
async function installNow() {
  if (!updateInfo.value) return
  updateState.value = 'downloading'; downloadPct.value = 0; downloadKnown.value = false
  try {
    await updater.downloadAndInstall(updateInfo.value as updater.Update, (p) => {
      if (p.finished) { downloadPct.value = 100; downloadKnown.value = false; return }
      const total = p.total ?? 0
      if (total > 0) { downloadKnown.value = true; downloadPct.value = Math.min(100, Math.round((p.downloaded / total) * 100)) }
    })
    updateState.value = 'ready'
  } catch (e) { updateState.value = 'error'; updateMsg.value = '下载失败：' + e }
}
async function doRelaunch() { await updater.relaunchApp() }
function toggleAutoCheck() {
  store.updateSettings({ autoCheckUpdate: !store.settings.autoCheckUpdate })
}
function setTheme(t: string) {
  store.updateSettings({ theme: (['system', 'light', 'dark'].includes(t) ? t : 'system') as 'system' | 'light' | 'dark' })
}
const palettes = [
  { id: 'teal', color: '#0D9488', name: '青绿' },
  { id: 'ocean', color: '#2563EB', name: '海洋' },
  { id: 'indigo', color: '#4F46E5', name: '靛青' },
  { id: 'violet', color: '#7C3AED', name: '紫罗兰' },
  { id: 'rose', color: '#E11D48', name: '玫瑰' },
  { id: 'amber', color: '#D97706', name: '琥珀' },
  { id: 'emerald', color: '#059669', name: '翡翠' },
  { id: 'slate', color: '#475569', name: '石墨' },
  { id: 'stone', color: '#57534E', name: '砂岩' },
  { id: 'sky', color: '#0284C7', name: '天空' },
  { id: 'plum', color: '#A21CAF', name: '梅紫' },
] as const

function setPalette(id: string) {
  store.updateSettings({ palette: id })
}

function onZoom(e: Event) { store.updateSettings({ zoom: Number((e.target as HTMLInputElement).value) }) }
async function openDir() {
  try { await api.openDataDir(); msg.value = '已打开数据目录' } catch (e) { msg.value = '打开失败：' + e }
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal settings-layout">
      <h3>设置</h3>
      <div class="settings-body">
        <nav class="settings-nav">
          <button class="settings-nav-item" :class="{ active: section === 'theme' }" @click="section = 'theme'">主题</button>
          <button class="settings-nav-item" :class="{ active: section === 'display' }" @click="section = 'display'">显示</button>
          <button class="settings-nav-item" :class="{ active: section === 'storage' }" @click="section = 'storage'">数据存储</button>
          <button class="settings-nav-item" :class="{ active: section === 'about' }" @click="section = 'about'">关于</button>
        </nav>
        <div class="settings-content">
          <!-- 主题 -->
          <template v-if="section === 'theme'">
            <label>主题模式</label>
            <select :value="store.settings.theme" @change="setTheme(($event.target as HTMLSelectElement).value)">
              <option value="system">跟随系统</option>
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
            </select>
            <p class="muted">跟随系统：启动时读取系统主题，运行中不实时切换。</p>
            <label style="margin-top:14px">配色方案</label>
            <div class="palette-grid">
              <button
                v-for="p in palettes"
                :key="p.id"
                class="palette-swatch"
                :class="{ active: store.settings.palette === p.id }"
                :style="{ '--swatch-color': p.color }"
                :title="p.name"
                @click="setPalette(p.id)"
              >
                <span class="palette-dot"></span>
                <span class="palette-name">{{ p.name }}</span>
              </button>
            </div>
          </template>

          <!-- 显示 -->
          <template v-else-if="section === 'display'">
            <label>界面缩放（{{ store.settings.zoom }}%）</label>
            <div class="slider-row">
              <span style="font-size:12px" class="muted">80%</span>
              <input type="range" min="80" max="200" step="10" :value="store.settings.zoom" @input="onZoom" style="flex:1" />
              <span style="font-size:12px" class="muted">200%</span>
            </div>
            <p class="muted">整体放大或缩小界面文字与控件，步进 10%。</p>
          </template>

          <!-- 数据存储 -->
          <template v-else-if="section === 'storage'">
            <div class="modal-cols">
              <div>
                <label>数据文件</label>
                <input :value="filePath" readonly />
                <div class="actions" style="justify-content:flex-start"><button class="btn primary" @click="openDir">打开数据目录</button></div>
              </div>
              <div class="help">
                <label>存储说明</label>
                <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
                <p v-if="store.location.isFallback" class="muted" style="color:var(--pending-txt)"><AlertTriangle :size="12" /> 当前正使用系统目录（安装位置无写入权限）。</p>
              </div>
            </div>
          </template>

          <!-- 关于 -->
          <template v-else-if="section === 'about'">
            <label>软件</label>
            <p>SiteCollector v{{ appVersion }}</p>
            <label style="margin-top:14px">链接</label>
            <p class="muted"><a @click.prevent="api.openLink('https://github.com/liangcheng147/website-collector')">GitHub 仓库</a> · 作者 bjb · MIT License</p>
            <label style="margin-top:14px">更新</label>
            <div class="actions" style="justify-content:flex-start">
              <button class="btn primary" :disabled="updateState === 'checking' || updateState === 'downloading'" @click="checkNow">检查更新</button>
            </div>
            <p v-if="updateState === 'checking'" class="muted">检查中…</p>
            <p v-else-if="updateState === 'none'" class="muted">{{ updateMsg }}</p>
            <div v-else-if="updateState === 'available' && updateInfo">
              <p>发现新版本 v{{ updateInfo.version }}</p>
              <p class="muted" style="white-space:pre-wrap">{{ updateInfo.body }}</p>
              <button class="btn primary" @click="installNow">下载并安装</button>
            </div>
            <div v-else-if="updateState === 'downloading'">
              <template v-if="downloadKnown">
                <p class="muted">下载中 {{ downloadPct }}%</p>
                <progress :value="downloadPct" max="100" style="width:100%"></progress>
              </template>
              <p v-else class="muted">下载中…</p>
            </div>
            <div v-else-if="updateState === 'ready'">
              <p>已下载完成，重启后生效。</p>
              <button class="btn primary" @click="doRelaunch">立即重启</button>
            </div>
            <p v-else-if="updateState === 'error'" class="muted">{{ updateMsg }}</p>
            <label style="margin-top:14px" class="toggle-row">
              <span class="toggle" :class="{ checked: store.settings.autoCheckUpdate }" @click="toggleAutoCheck"></span>
              启动时自动检查更新
            </label>
            <label style="margin-top:14px">技术信息</label>
            <p class="muted">{{ userAgent }}</p>
          </template>

          <p class="muted">{{ msg }}</p>
          <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
        </div>
      </div>
    </div>
  </ModalMask>
</template>