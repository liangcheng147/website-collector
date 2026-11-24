<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NButton, NRadioGroup, NRadio, NGrid, NGi, NSpace, NText, NAlert } from 'naive-ui'
import { useAppStore, summarizeImport } from '../store/app'
import type { AppData } from '../types'
import * as api from '../api'
const store = useAppStore()
const emit = defineEmits(['close'])
const mode = ref<'overwrite' | 'merge'>('merge')
const jsonPath = ref<string | null>(null)
const msg = ref('')

function dateStr() { return new Date().toISOString().slice(0, 10) }

function applyImport(data: AppData, verb: string) {
  const before = store.data
  store.setData(data)
  const sum = summarizeImport(before, data)
  store.flash(`${verb}：新增 ${sum.added}，合并 ${sum.merged}，重复 ${sum.duplicates}`)
}

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
    applyImport(data, mode.value === 'overwrite' ? '已覆盖导入 md' : '已合并导入 md')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}

// JSON 导入两段式：先选文件，再应用内确认覆盖，确认后才执行导入
async function exportHtml() {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: `书签_${dateStr()}.html`, filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] })
  if (!path) return
  try { await api.exportBookmarksHtmlToFile(String(path)); store.flash('已导出 HTML 书签'); emit('close') }
  catch (e) { msg.value = '导出失败：' + e }
}

async function importHtml() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'HTML', extensions: ['html', 'htm'] }, { name: 'All', extensions: ['*'] }] })
  if (!path) return
  try {
    const text = await api.readTextFile(String(path))
    const data = await api.importBookmarksHtml(text)
    applyImport(data, '已合并导入 HTML 书签')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}

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
    applyImport(data, '已从 JSON 备份恢复')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="导入 / 导出"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(520px, 92%)' }"
    data-testid="modal-import-export"
    @update:show="emit('close')"
  >
    <div class="import-export-body">
      <template v-if="jsonPath">
        <div class="modal-cols">
          <div>
            <label class="section-label">将导入</label>
            <n-text depth="3">{{ jsonPath }}</n-text>
            <n-alert type="warning" :bordered="false" class="confirm-warning">
              JSON 导入会覆盖当前全部数据（自动备份 .bak），确定继续？
            </n-alert>
            <n-space class="confirm-actions" justify="end" :size="8">
              <n-button @click="jsonPath = null">取消</n-button>
              <n-button type="error" @click="confirmJsonImport">确定覆盖导入</n-button>
            </n-space>
          </div>
          <div class="help">
            <label class="section-label">备份说明</label>
            <n-text depth="3">导入前自动生成 .bak 备份文件，导入失败可从中恢复。</n-text>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="modal-cols">
          <div>
            <label class="section-label">导出</label>
            <n-grid :cols="2" :x-gap="8" :y-gap="8" class="import-grid">
              <n-gi><n-button type="primary" @click="exportMd">导出 MD</n-button></n-gi>
              <n-gi><n-button type="primary" @click="exportJson">导出 JSON</n-button></n-gi>
              <n-gi><n-button type="primary" @click="exportHtml">导出 HTML</n-button></n-gi>
            </n-grid>
            <label class="section-label">导入</label>
            <n-grid :cols="2" :x-gap="8" :y-gap="8" class="import-grid">
              <n-gi><n-button @click="importMd">导入 MD</n-button></n-gi>
              <n-gi><n-button @click="importHtml">导入 HTML</n-button></n-gi>
              <n-gi><n-button @click="pickJson">导入 JSON</n-button></n-gi>
            </n-grid>
            <label class="section-label">导入方式</label>
            <n-radio-group v-model:value="mode" aria-label="导入方式">
              <n-radio value="merge">合并导入</n-radio>
              <n-radio value="overwrite">覆盖导入（自动备份 .bak）</n-radio>
            </n-radio-group>
          </div>
          <div class="help">
            <label class="section-label">md 格式示例</label>
            <code># 分类名<br />名称&#9;https://链接&#9;状态<br />&gt; 网站简介备注</code>
            <label class="section-label">JSON 说明</label>
            <n-text depth="3">读取「导出 JSON」的备份文件，覆盖当前全部数据（自动备份 .bak）。导入成功后在状态栏闪现提示。</n-text>
          </div>
        </div>
      </template>
      <n-text v-if="msg" type="error">{{ msg }}</n-text>
    </div>
    <template #footer>
      <div class="modal-footer"><n-button @click="emit('close')">关闭</n-button></div>
    </template>
  </n-modal>
</template>

<style scoped>
.import-export-body { display: flex; flex-direction: column; gap: 14px; }
.section-label { display: block; margin: 14px 0 5px; font-size: 12px; color: var(--text-2); font-weight: 600; }
.help { border-left: 1px dashed var(--border-2); padding-left: 14px; }
.help code { display: block; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 10px; margin: 6px 0; font-size: 12px; font-family: var(--mono); color: var(--text); }
.import-grid .n-button { width: 100%; }
.confirm-warning { margin-top: 10px; }
.confirm-actions { margin-top: 12px; }
</style>
