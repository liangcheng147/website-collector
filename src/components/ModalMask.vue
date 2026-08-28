<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits(['close'])
const downOnMask = ref(false)
function onMaskDown(e: MouseEvent) { downOnMask.value = (e.target as HTMLElement).classList.contains('modal-mask') }
function onMaskClick(e: MouseEvent) { if (downOnMask.value && e.target === e.currentTarget) emit('close') }
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" @mousedown="onMaskDown" @click="onMaskClick">
      <slot />
    </div>
  </Teleport>
</template>