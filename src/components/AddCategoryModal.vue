<script setup lang="ts">
import { ref } from 'vue'
import { NModal } from 'naive-ui'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ parentId: string | null }>()
const emit = defineEmits(['created', 'close'])
const name = ref('')
const parentId = ref(props.parentId)

function create() {
  if (!name.value.trim()) return
  const validParent = store.flatCategories.find(c => c.id === parentId.value && c.depth < 2)
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
    <div class="modal-content">
      <div class="modal-cols">
        <div>
          <label>父级分类</label>
          <select v-model="parentId">
            <option :value="null">顶层</option>
            <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '\u3000'.repeat(c.depth) }}{{ c.name }}</option>
          </select>
          <label>分类名称</label>
          <input v-model="name" placeholder="分类名" />
        </div>
        <div class="help">
          <label>层级规则</label>
          <p class="muted">分类最多嵌套 3 层。<br />父级列表只显示深度 ≤ 2 的分类，保证新分类不会超过第 3 层。</p>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="actions">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" @click="create">创建</button>
      </div>
    </template>
  </n-modal>
</template>
