<script setup lang="ts">
import { ref } from 'vue'
import { NModal } from 'naive-ui'
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
  <n-modal
    :show="true"
    preset="card"
    :title="`添加标签（${props.siteIds.length} 项）`"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(520px, 92%)' }"
    data-testid="modal-add-tags"
    @update:show="emit('close')"
  >
    <div class="modal-content">
      <div class="modal-cols">
        <div>
          <label>标签</label>
          <TagInput :model-value="tags" :available="store.data.tags" @update:model-value="tags = $event" />
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">输入标签后回车或逗号即可添加；多个可用空格分隔，批量应用到选中的网站。</p>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="actions modal-footer">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" @click="confirm">添加</button>
      </div>
    </template>
  </n-modal>
</template>
