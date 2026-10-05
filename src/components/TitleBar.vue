<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Minus, Square, Copy, X, Bookmark } from 'lucide-vue-next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import * as api from '../api'
const maximized = ref(false)
let unlistenResize: (() => void) | undefined
async function syncMaximized() {
  maximized.value = await api.isMaximized()
  document.documentElement.classList.toggle('win-maximized', maximized.value)
}
onMounted(async () => {
  await syncMaximized()
  unlistenResize = await getCurrentWindow().onResized(() => syncMaximized())
})
onUnmounted(() => { unlistenResize?.() })
async function onMaxClick() {
  await api.toggleMaximizeWindow()
  await syncMaximized()
}
</script>

<template>
  <header class="titlebar" data-tauri-drag-region="deep">
    <span class="mark"><Bookmark :size="14" /><span class="tip">归集</span></span>
    <span style="font-weight:700;font-size:14px;margin-left:6px;">归集</span>
    <div class="btns" data-tauri-drag-region="false">
      <span class="min" @click="api.minimizeWindow"><Minus :size="14" /></span>
      <span class="max" @click="onMaxClick"><Copy v-if="maximized" :size="12" /><Square v-else :size="12" /></span>
      <span class="close" @click="api.closeWindow"><X :size="14" /></span>
    </div>
  </header>
</template>