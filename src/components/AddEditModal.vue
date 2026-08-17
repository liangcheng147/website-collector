<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
import AddCategoryModal from './AddCategoryModal.vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ editing?: any }>()
const emit = defineEmits(['close'])
const name = ref(props.editing?.name ?? '')
const url = ref(props.editing?.url ?? '')
const tags = ref((props.editing?.tags ?? []).join(' '))
const categoryId = ref(props.editing?.categoryId ?? null)
const dup = ref(false)
const showAddCat = ref(false)
const pendingCat = ref<string | null>(null)
const NEW_CAT = '__new_cat__'
let lastCat: string | null = categoryId.value
function onCatChange(e: any) {
  if (e.target.value === NEW_CAT) {
    pendingCat.value = lastCat
    showAddCat.value = true
    categoryId.value = null
  } else {
    lastCat = categoryId.value
  }
}
function onCatCreated(id: string) {
  categoryId.value = id
  showAddCat.value = false
}

function save() {
  const tagList = tags.value.split(/[#\s，,]+/).filter(Boolean)
  if (props.editing) store.updateSite(props.editing.id, { name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList })
  else {
    dup.value = store.isDuplicateUrl(url.value)
    if (dup.value) return
    store.addSite({ name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList })
  }
  emit('close')
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.editing ? '编辑网站' : '添加网站' }}</h3>
      <div class="modal-cols">
        <div>
          <label>名称</label><input v-model="name" placeholder="网站名称" />
          <label>链接</label><input v-model="url" placeholder="https://..." />
          <label>分类</label>
          <select v-model="categoryId" @change="onCatChange">
            <option :value="null">未分类</option>
            <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
            <option :value="'__new_cat__'">＋ 新建分类…</option>
          </select>
          <label>标签（空格分隔）</label><input v-model="tags" placeholder="框架 工具" />
          <p v-if="dup" class="err">⚠ 链接已存在</p>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="save">保存</button></div>
        </div>
        <div class="help">
          <label>快捷操作</label>
          <p class="muted">下拉选择「＋ 新建分类…」会弹出新建分类弹窗，创建后自动选中新分类，表单内容保留。</p>
        </div>
      </div>
    </div>
    <AddCategoryModal v-if="showAddCat" :parent-id="pendingCat" @created="onCatCreated" @close="showAddCat = false" />
  </ModalMask>
</template>