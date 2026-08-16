<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ editing?: any }>()
const emit = defineEmits(['close'])
const name = ref(props.editing?.name ?? '')
const url = ref(props.editing?.url ?? '')
const tags = ref((props.editing?.tags ?? []).join(' '))
const categoryId = ref(props.editing?.categoryId ?? null)
const dup = ref(false)

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
      <label>名称</label><input v-model="name" placeholder="网站名称" />
      <label>链接</label><input v-model="url" placeholder="https://..." />
      <label>分类</label>
      <select v-model="categoryId">
        <option :value="null">未分类</option>
        <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <label>标签（空格分隔）</label><input v-model="tags" placeholder="框架 工具" />
      <p v-if="dup" class="err">⚠ 链接已存在</p>
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="save">保存</button></div>
    </div>
  </ModalMask>
</template>