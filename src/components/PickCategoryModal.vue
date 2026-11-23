<script setup lang="ts">
import { ref, computed } from 'vue'
import { NForm, NFormItem, NButton, NModal, NSelect, NText } from 'naive-ui'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const target = ref<string | null>(null)
const selectValue = computed(() => target.value ?? '')
const targetOptions = computed(() => [
  { label: '未分类', value: '' },
  ...store.flatCategories.map((c) => ({ label: '\u3000'.repeat(c.depth) + c.name, value: c.id })),
])
function onTargetChange(value: string | number | null) {
  target.value = value ? String(value) : null
}
function confirm() { store.moveSites(props.siteIds, target.value); emit('close') }
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="`移动分类（${props.siteIds.length} 项）`"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(520px, 92%)' }"
    data-testid="modal-pick-category"
    @update:show="emit('close')"
  >
    <n-form size="medium" @submit.prevent>
      <div class="modal-cols">
        <div>
          <n-form-item label="目标分类">
            <n-select :value="selectValue" :options="targetOptions" @update:value="onTargetChange" />
          </n-form-item>
        </div>
        <div>
          <n-form-item>
            <n-text depth="3">选中多个网站后从「移动分类…」进入本弹窗，批量调整归属。</n-text>
          </n-form-item>
        </div>
      </div>
    </n-form>
    <template #footer>
      <div class="actions modal-footer">
        <n-button @click="emit('close')">取消</n-button>
        <n-button type="primary" @click="confirm">移动</n-button>
      </div>
    </template>
  </n-modal>
</template>
