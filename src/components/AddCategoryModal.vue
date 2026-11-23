<script setup lang="ts">
import { ref, computed } from 'vue'
import { NForm, NFormItem, NInput, NSelect, NButton, NModal, NText } from 'naive-ui'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ parentId: string | null }>()
const emit = defineEmits(['created', 'close'])
const name = ref('')
const parentId = ref<string | null>(props.parentId)

const parentOptions = computed(() => [
  { label: '顶层', value: '' },
  ...store.flatCategories.filter((c) => c.depth < 2).map((c) => ({ label: '\u3000'.repeat(c.depth) + c.name, value: c.id })),
])
function onParentChange(value: string | number | null) {
  parentId.value = value ? String(value) : null
}

function create() {
  if (!name.value.trim()) return
  const validParent = store.flatCategories.find((c) => c.id === parentId.value && c.depth < 2)
  const id = store.addCategory(name.value.trim(), validParent ? validParent.id : null)
  emit('created', id)
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="新建分类"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(520px, 92%)' }"
    data-testid="modal-add-category"
    @update:show="emit('close')"
  >
    <n-form size="medium" @submit.prevent>
      <div class="modal-cols">
        <div>
          <n-form-item label="父级分类">
            <n-select :value="parentId ?? ''" :options="parentOptions" @update:value="onParentChange" />
          </n-form-item>
          <n-form-item label="分类名称">
            <n-input v-model:value="name" placeholder="分类名" />
          </n-form-item>
        </div>
        <div>
          <n-form-item>
            <n-text depth="3">分类最多嵌套 3 层。<br />父级列表只显示深度 ≤ 2 的分类，保证新分类不会超过第 3 层。</n-text>
          </n-form-item>
        </div>
      </div>
    </n-form>
    <template #footer>
      <div class="actions modal-footer">
        <n-button @click="emit('close')">取消</n-button>
        <n-button type="primary" @click="create">创建</n-button>
      </div>
    </template>
  </n-modal>
</template>
