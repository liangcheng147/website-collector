<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
import { useAppStore } from '../store/app'
const emit = defineEmits(['close'])
const store = useAppStore()
const filePath = ref('')
const msg = ref('')
const section = ref<'theme' | 'display' | 'storage'>('theme')
onMounted(async () => { filePath.value = await api.getDataFilePath() })
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
    <div class="modal">
      <h3>设置</h3>
      <div class="seg">
        <button class="btn" :class="{ active: section === 'theme' }" @click="section = 'theme'">主题</button>
        <button class="btn" :class="{ active: section === 'display' }" @click="section = 'display'">显示</button>
        <button class="btn" :class="{ active: section === 'storage' }" @click="section = 'storage'">数据存储</button>
      </div>

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

      <template v-else-if="section === 'display'">
        <label>界面缩放（{{ store.settings.zoom }}%）</label>
        <div class="slider-row">
          <span style="font-size:12px" class="muted">80%</span>
          <input type="range" min="80" max="200" step="10" :value="store.settings.zoom" @input="onZoom" style="flex:1" />
          <span style="font-size:12px" class="muted">200%</span>
        </div>
        <p class="muted">整体放大或缩小界面文字与控件，步进 10%。</p>
      </template>

      <template v-else>
        <div class="modal-cols">
          <div>
            <label>数据文件</label>
            <input :value="filePath" readonly />
            <div class="actions" style="justify-content:flex-start"><button class="btn primary" @click="openDir">打开数据目录</button></div>
          </div>
          <div class="help">
            <label>存储说明</label>
            <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
            <p v-if="store.location.isFallback" class="muted" style="color:var(--pending-txt)">⚠ 当前正使用系统目录（安装位置无写入权限）。</p>
          </div>
        </div>
      </template>

      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>