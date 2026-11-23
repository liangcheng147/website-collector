<script setup lang="ts">
import { ref, computed } from 'vue'
import { NForm, NFormItem, NInput, NSelect, NButton, NModal, NText } from 'naive-ui'
import { useAppStore } from '../store/app'
import type { Site } from '../types'
import TagInput from './TagInput.vue'
import AddCategoryModal from './AddCategoryModal.vue'
import * as api from '../api'
const store = useAppStore()
const props = defineProps<{ editing?: Site | null; defaultCategoryId?: string | null }>()
const emit = defineEmits(['close'])
const name = ref(props.editing?.name ?? '')
const url = ref(props.editing?.url ?? '')
const tags = ref<string[]>((props.editing?.tags ?? []).slice())
const note = ref(props.editing?.note ?? '')
const validationMsg = ref('')
const categoryId = ref<string | null>(props.editing?.categoryId ?? props.defaultCategoryId ?? null)
const dup = ref(false)
const showAddCat = ref(false)
const pendingCat = ref<string | null>(null)
const titleError = ref('')
const fetchingTitle = ref(false)
const NEW_CAT = '__new_cat__'
let lastCat: string | null = categoryId.value
const categoryOptions = computed(() => [
  { label: '未分类', value: '' },
  ...store.flatCategories.map((c) => ({ label: '\u3000'.repeat(c.depth) + c.name, value: c.id })),
  { label: '+ 新建分类…', value: NEW_CAT },
])
const selectValue = computed(() => categoryId.value ?? '')
function onCatChange(value: string | number | null) {
  if (value === NEW_CAT) {
    pendingCat.value = lastCat
    showAddCat.value = true
    categoryId.value = null
    return
  }
  const next = value ? String(value) : null
  lastCat = next
  categoryId.value = next
}

function onCatCreated(id: string) {
  categoryId.value = id
  showAddCat.value = false
}

async function fetchTitle() {
  if (!url.value.trim()) return
  fetchingTitle.value = true
  titleError.value = ''
  try {
    const title = await api.fetchSiteTitle(url.value.trim())
    if (!name.value.trim()) {
      name.value = title
    }
  } catch {
    titleError.value = '无法获取标题，请手动输入或点击重试'
  } finally {
    fetchingTitle.value = false
  }
}

function save() {
  validationMsg.value = ''
  const err = store.validateSite(name.value, url.value, note.value)
  if (err) { validationMsg.value = err; return }
  if (props.editing) {
    if (store.isDuplicateUrl(url.value, props.editing.id)) {
      validationMsg.value = '该链接已存在'
      return
    }
    store.updateSite(props.editing.id, { name: name.value, url: url.value, categoryId: categoryId.value, tags: tags.value, note: note.value })
  } else {
    dup.value = store.isDuplicateUrl(url.value)
    if (dup.value) return
    store.addSite({ name: name.value, url: url.value, categoryId: categoryId.value, tags: tags.value, note: note.value })
  }
  emit('close')
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="props.editing ? '编辑网站' : '添加网站'"
    to="body"
    :mask-closable="true"
    :close-on-esc="true"
    :trap-focus="true"
    :auto-focus="true"
    :style="{ width: 'min(520px, 92%)' }"
    data-testid="modal-add-edit"
    @update:show="emit('close')"
  >
    <n-form size="medium" @submit.prevent>
      <div class="modal-cols">
        <div>
          <n-form-item label="名称" required>
            <n-input v-model:value="name" data-testid="input-name" placeholder="网站名称" />
          </n-form-item>
          <n-form-item label="链接" required>
            <div class="url-row">
              <n-input v-model:value="url" data-testid="input-url" placeholder="https://..." @blur="fetchTitle" />
              <n-button size="small" data-testid="btn-fetch-title" :disabled="fetchingTitle" @click="fetchTitle">
                {{ fetchingTitle ? '...' : '获取名称' }}
              </n-button>
            </div>
          </n-form-item>
          <n-form-item>
            <n-text v-if="titleError" type="error">{{ titleError }}</n-text>
          </n-form-item>
        </div>
        <div>
          <n-form-item label="分类">
            <n-select :value="selectValue" :options="categoryOptions" @update:value="onCatChange" />
          </n-form-item>
          <n-form-item label="标签">
            <TagInput :model-value="tags" :available="store.data.tags" @update:model-value="tags = $event" />
          </n-form-item>
        </div>
      </div>
      <n-form-item label="备注（200 字以内）">
        <n-input v-model:value="note" type="textarea" data-testid="textarea-note" maxlength="200" placeholder="网站简介" @keydown.enter.prevent />
      </n-form-item>
      <span class="char-count">{{ note.length }}/200</span>
      <n-form-item v-if="dup">
        <n-text type="error">链接已存在</n-text>
      </n-form-item>
      <n-form-item v-if="validationMsg">
        <n-text type="error">{{ validationMsg }}</n-text>
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="actions modal-footer">
        <n-button @click="emit('close')">取消</n-button>
        <n-button type="primary" data-testid="btn-save" @click="save">保存</n-button>
      </div>
    </template>
  </n-modal>
  <AddCategoryModal v-if="showAddCat" :parent-id="pendingCat" @created="onCatCreated" @close="showAddCat = false" />
</template>
