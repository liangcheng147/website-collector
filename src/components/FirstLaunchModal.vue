<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ModalMask from './ModalMask.vue'
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
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>选择数据目录</h3>
      <template v-if="step === 'choose'">
        <div class="modal-cols">
          <div>
            <p class="muted">首次使用，请选择数据存储位置。</p>
            <label>默认位置</label>
            <input :value="defaultDir" readonly />
            <div class="actions">
              <button class="btn" @click="useDefault">使用默认位置</button>
              <button class="btn primary" @click="pick">选择数据目录…</button>
            </div>
          </div>
          <div class="help">
            <label>已有数据</label>
            <p class="muted">若选中的目录已存在数据文件，会提示「该目录已有 N 个网站数据」，可选择读入或换目录。</p>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="modal-cols">
          <div>
            <p class="muted">该目录已有 <b>{{ pickedCount }}</b> 个网站数据，是否读入？</p>
            <div class="actions">
              <button class="btn" @click="step = 'choose'">换一个目录</button>
              <button class="btn primary" @click="readPicked">读入该目录</button>
            </div>
          </div>
          <div class="help">
            <label>读入说明</label>
            <p class="muted">读入后将使用该目录的数据文件作为默认存储位置。</p>
          </div>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
    </div>
  </ModalMask>
</template>