<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import * as api from '../api'
const store = useAppStore()
const emit = defineEmits(['close'])
const mdText = ref('')
const mode = ref<'overwrite' | 'merge'>('merge')
const msg = ref('')

async function doExport() {
  mdText.value = await api.exportMd()
  msg.value = '已生成 md 文本，可复制保存'
}
async function doImport() {
  if (!mdText.value.trim()) { msg.value = '请粘贴 md 内容'; return }
  store.setData(await api.importMd(mdText.value, mode.value))
  msg.value = mode.value === 'overwrite' ? '已覆盖导入' : '已合并导入'
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>导入 / 导出</h3>
      <button class="btn" @click="doExport">导出为 md</button>
      <div class="mode-row">
        <label><input type="radio" v-model="mode" value="merge" /> 合并导入</label>
        <label><input type="radio" v-model="mode" value="overwrite" /> 覆盖导入（自动备份 .bak）</label>
      </div>
      <textarea v-model="mdText" rows="10" placeholder="md 内容（粘贴）" />
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button><button class="btn primary" @click="doImport">导入</button></div>
    </div>
  </div>
</template>