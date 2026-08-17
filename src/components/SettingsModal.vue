<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
const emit = defineEmits(['close'])
const filePath = ref('')
const msg = ref('')
onMounted(async () => { filePath.value = await api.getDataFilePath() })
async function openDir() {
  try { await api.openDataDir(); msg.value = '已打开数据目录' } catch (e) { msg.value = '打开失败：' + e }
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>设置 · 数据存储</h3>
      <div class="modal-cols">
        <div>
          <label>数据文件</label>
          <input :value="filePath" readonly />
          <div class="actions" style="justify-content:flex-start"><button class="btn primary" @click="openDir">打开数据目录</button></div>
        </div>
        <div class="help">
          <label>存储说明</label>
          <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
        </div>
      </div>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>