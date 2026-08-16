<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits(['close'])
const downOnMask = ref(false)
function onMaskDown(e: MouseEvent) { downOnMask.value = (e.target as HTMLElement).classList.contains('modal-mask') }
function onMaskClick() { if (downOnMask.value) emit('close') }
</script>

<template>
  <div class="modal-mask" @mousedown="onMaskDown" @click="onMaskClick">
    <slot />
  </div>
</template>