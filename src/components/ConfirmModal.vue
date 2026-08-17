<script setup lang="ts">
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; message?: string; hint?: string; options: { value: string; label: string; danger?: boolean }[] }>()
const emit = defineEmits(['choose', 'close'])
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <div class="modal-cols">
        <div>
          <p class="muted" v-if="props.message">{{ props.message }}</p>
          <div class="actions" style="justify-content:flex-start">
            <button v-for="opt in props.options" :key="opt.value" class="btn" :class="{ danger: opt.danger }" @click="emit('choose', opt.value)">{{ opt.label }}</button>
          </div>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button></div>
        </div>
        <div class="help">
          <label>风险提示</label>
          <p class="muted">{{ props.hint ?? '该操作会立即生效。' }}</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>