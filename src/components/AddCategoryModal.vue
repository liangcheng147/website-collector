<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import ModalMask from './ModalMask.vue'
const store = useAppStore()
const props = defineProps<{ parentId: string | null }>()
const emit = defineEmits(['created', 'close'])
const name = ref('')
const parentId = ref(props.parentId)

function create() {
  if (!name.value.trim()) return
  const id = store.addCategory(name.value.trim(), parentId.value)
  emit('created', id)
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>新建分类</h3>
      <label>父级分类</label>
      <select v-model="parentId">
        <option :value="null">顶层</option>
        <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <label>分类名称</label>
      <input v-model="name" placeholder="分类名" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="create">创建</button></div>
    </div>
  </ModalMask>
</template>