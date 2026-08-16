<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const tags = ref('')
function confirm() {
  const list = tags.value.split(/[#\s，,]+/).filter(Boolean)
  if (list.length) store.addTagsToSites(props.siteIds, list)
  emit('close')
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>添加标签（{{ props.siteIds.length }} 项）</h3>
      <input v-model="tags" placeholder="新标签，空格分隔" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">添加</button></div>
    </div>
  </div>
</template>