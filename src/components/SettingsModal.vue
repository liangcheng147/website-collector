<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as api from '../api'
const emit = defineEmits(['close'])
const dir = ref('')
const msg = ref('')

onMounted(async () => { dir.value = await api.getDataDir() })
async function migrate() {
  const newDir = (window as any).prompt('输入新数据目录（绝对路径）', dir.value)
  if (!newDir || newDir === dir.value) return
  try { await api.migrateDataDir(newDir); dir.value = await api.getDataDir(); msg.value = '已迁移' }
  catch (e) { msg.value = '迁移失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>设置 · 存储位置</h3>
      <p class="muted">当前路径：{{ dir }}</p>
      <button class="btn" @click="migrate">更改位置…</button>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </div>
</template>