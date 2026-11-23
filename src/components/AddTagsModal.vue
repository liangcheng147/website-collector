<script setup lang="ts">
import { ref } from 'vue'
import { NForm, NFormItem, NButton, NModal, NText } from 'naive-ui'
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
    <n-form size="medium" @submit.prevent>
      <div class="modal-cols">
        <div>
          <n-form-item label="标签">
            <TagInput :model-value="tags" :available="store.data.tags" @update:model-value="tags = $event" />
          </n-form-item>
        </div>
        <div>
          <n-form-item>
            <n-text depth="3">输入标签后回车或逗号即可添加；多个可用空格分隔，批量应用到选中的网站。</n-text>
          </n-form-item>
        </div>
      </div>
    </n-form>
    <template #footer>
      <div class="actions modal-footer">
        <n-button @click="emit('close')">取消</n-button>
        <n-button type="primary" @click="confirm">添加</n-button>
      </div>
    </template>
  </n-modal>
</template>
