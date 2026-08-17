<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
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
async function toggleMax() {
  await api.toggleMaximizeWindow()
  await syncMaximized()
}
function onDblClick() { toggleMax() }
</script>

<template>
  <header class="titlebar" data-tauri-drag-region @dblclick="onDblClick">
    <span class="mark">GJ<span class="tip">归集</span></span>
    <div class="btns" @dblclick.stop>
      <span class="min" @click="api.minimizeWindow">—</span>
      <span class="max" @click="toggleMax">{{ maximized ? '❐' : '□' }}</span>
      <span class="close" @click="api.closeWindow">✕</span>
    </div>
  </header>
</template>