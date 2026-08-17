<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; initial?: string; hint?: string }>()
const emit = defineEmits(['confirm', 'close'])
const value = ref(props.initial ?? '')
function ok() { if (value.value.trim()) emit('confirm', value.value.trim()) }
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <div class="modal-cols">
        <div>
          <label>内容</label>
          <input v-model="value" />
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="ok">确定</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">{{ props.hint ?? '输入内容后点击「确定」保存。' }}</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>