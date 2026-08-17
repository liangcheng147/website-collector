<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as api from '../api'
const maximized = ref(false)
onMounted(async () => {
  maximized.value = await api.isMaximized()
  if (maximized.value) document.documentElement.classList.add('win-maximized')
})
async function toggleMax() {
  maximized.value = !maximized.value
  document.documentElement.classList.toggle('win-maximized', maximized.value)
  await api.toggleMaximizeWindow()
}
function onDblClick() { toggleMax() }
</script>

<template>
  <header class="titlebar" data-tauri-drag-region @dblclick="onDblClick">
    <span class="mark">GJ<span class="tip">归集</span></span>
    <div class="btns">
      <span class="min" @click="api.minimizeWindow">—</span>
      <span class="max" @click="toggleMax">{{ maximized ? '❐' : '□' }}</span>
      <span class="close" @click="api.closeWindow">✕</span>
    </div>
  </header>
</template>