<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
import TagInput from './TagInput.vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const tags = ref<string[]>([])
function confirm() {
  if (tags.value.length) store.addTagsToSites(props.siteIds, tags.value)
  emit('close')
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>添加标签（{{ props.siteIds.length }} 项）</h3>
      <div class="modal-cols">
        <div>
          <label>标签</label>
          <TagInput :model-value="tags" :available="store.data.tags" @update:model-value="tags = $event" />
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">添加</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">标签以空格分隔，多个标签可一次添加，批量应用到选中的网站。</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>