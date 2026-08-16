<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as api from '../api'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['close'])
const defaultDir = ref('')
const step = ref<'choose' | 'confirm'>('choose')
const pickedDir = ref('')
const pickedCount = ref(0)
const msg = ref('')

onMounted(async () => { defaultDir.value = await api.getDataDir() })

async function pick() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({ directory: true, title: '选择数据目录' })
  if (!dir) return
  const probe = await api.probeDataDir(String(dir))
  if (probe.exists && probe.siteCount > 0) {
    pickedDir.value = String(dir)
    pickedCount.value = probe.siteCount
    step.value = 'confirm'
  } else {
    try {
      await api.setDataDir(String(dir))
      await store.init()
      emit('close')
    } catch (e) { msg.value = '写入失败：' + e }
  }
}

async function readPicked() {
  try {
    await api.setDataDir(pickedDir.value)
    await store.init()
    emit('close')
  } catch (e) { msg.value = '写入失败：' + e }
}

async function useDefault() {
  try {
    await api.setDataDir(defaultDir.value)
    await store.init()
    emit('close')
  } catch (e) { msg.value = '写入失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>选择数据目录</h3>
      <template v-if="step === 'choose'">
        <p class="muted">首次使用，请选择数据存储位置（默认：{{ defaultDir }}）</p>
        <div class="actions">
          <button class="btn" @click="useDefault">使用默认位置</button>
          <button class="btn primary" @click="pick">选择数据目录…</button>
        </div>
      </template>
      <template v-else>
        <p class="muted">该目录已有 {{ pickedCount }} 个网站数据，是否读入？</p>
        <div class="actions">
          <button class="btn" @click="step = 'choose'">换一个目录</button>
          <button class="btn primary" @click="readPicked">读入该目录</button>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
    </div>
  </div>
</template>