<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
const emit = defineEmits(['close'])
const dir = ref('')
const filePath = ref('')
const msg = ref('')

onMounted(async () => {
  dir.value = await api.getDataDir()
  filePath.value = await api.getDataFilePath()
})
async function migrate() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, title: '选择新的数据目录' })
  if (!picked) return
  try {
    await api.migrateDataDir(String(picked))
    dir.value = await api.getDataDir()
    filePath.value = await api.getDataFilePath()
    msg.value = '已迁移到新位置'
  } catch (e) { msg.value = '迁移失败：' + e }
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>设置 · 存储位置</h3>
      <p class="muted">数据文件：{{ filePath }}</p>
      <button class="btn" @click="migrate">更改位置…</button>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>