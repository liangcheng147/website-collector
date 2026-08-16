<script setup lang="ts">
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; message?: string; options: { value: string; label: string; danger?: boolean }[] }>()
const emit = defineEmits(['choose', 'close'])
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <p class="muted" v-if="props.message">{{ props.message }}</p>
      <div class="actions">
        <button v-for="opt in props.options" :key="opt.value" class="btn" :class="{ danger: opt.danger }" @click="emit('choose', opt.value)">{{ opt.label }}</button>
        <button class="btn" @click="emit('close')">取消</button>
      </div>
    </div>
  </ModalMask>
</template>