<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
import { useAppStore } from '../store/app'
import * as api from '../api'
const store = useAppStore()
const emit = defineEmits(['close'])
const mode = ref<'overwrite' | 'merge'>('merge')
const jsonPath = ref<string | null>(null)
const msg = ref('')

function dateStr() { return new Date().toISOString().slice(0, 10) }

async function exportMd() {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: `归集_${dateStr()}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
  if (!path) return
  try { await api.exportMdToFile(String(path)); store.flash('已导出 md'); emit('close') }
  catch (e) { msg.value = '导出失败：' + e }
}

async function exportJson() {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: `归集_${dateStr()}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (!path) return
  try { await api.exportJsonToFile(String(path)); store.flash('已导出 JSON 备份'); emit('close') }
  catch (e) { msg.value = '导出失败：' + e }
}

async function importMd() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] })
  if (!path) return
  try {
    const data = await api.importMdFromFile(String(path), mode.value)
    store.setData(data)
    store.flash(mode.value === 'overwrite' ? '已覆盖导入 md' : '已合并导入 md')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}

// JSON 导入两段式：先选文件，再应用内确认覆盖，确认后才执行导入
async function pickJson() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (!path) return
  jsonPath.value = String(path)
}
async function confirmJsonImport() {
  const p = jsonPath.value
  if (!p) return
  try {
    const data = await api.importJsonFromFile(p)
    store.setData(data)
    store.flash('已从 JSON 备份恢复')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>导入 / 导出</h3>
      <template v-if="jsonPath">
        <div class="modal-cols">
          <div>
            <p class="muted">将导入：{{ jsonPath }}</p>
            <p class="muted">JSON 导入会覆盖当前全部数据（自动备份 .bak），确定继续？</p>
            <div class="actions">
              <button class="btn" @click="jsonPath = null">取消</button>
              <button class="btn danger" @click="confirmJsonImport">确定覆盖导入</button>
            </div>
          </div>
          <div class="help">
            <label>备份说明</label>
            <p class="muted">导入前自动生成 .bak 备份文件，导入失败可从中恢复。</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="modal-cols">
          <div>
            <label>导出</label>
            <div class="grid2x2">
              <button class="btn primary" @click="exportMd">导出 MD</button>
              <button class="btn primary" @click="exportJson">导出 JSON</button>
            </div>
            <label>导入</label>
            <div class="grid2x2">
              <button class="btn" @click="importMd">导入 MD</button>
              <button class="btn" @click="pickJson">导入 JSON</button>
            </div>
            <div class="mode-row">
              <label><input type="radio" v-model="mode" value="merge" /> 合并导入</label>
              <label style="margin-left:10px"><input type="radio" v-model="mode" value="overwrite" /> 覆盖导入（自动备份 .bak）</label>
            </div>
          </div>
          <div class="help">
            <label>md 格式示例</label>
            <code># 分类名<br />- [名称](https://链接)</code>
            <label>JSON 说明</label>
            <p class="muted">读取「导出 JSON」的备份文件，覆盖当前全部数据（自动备份 .bak）。导入成功后在状态栏闪现提示。</p>
          </div>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>