<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; initial?: string }>()
const emit = defineEmits(['confirm', 'close'])
const value = ref(props.initial ?? '')
function ok() { if (value.value.trim()) emit('confirm', value.value.trim()) }
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <input v-model="value" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="ok">确定</button></div>
    </div>
  </ModalMask>
</template>