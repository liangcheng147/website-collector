<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const target = ref<string | null>(null)
function confirm() { store.moveSites(props.siteIds, target.value); emit('close') }
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>移动分类（{{ props.siteIds.length }} 项）</h3>
      <div class="modal-cols">
        <div>
          <label>目标分类</label>
          <select v-model="target">
            <option :value="null">未分类</option>
            <option v-for="c in store.flatCategories" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
          </select>
          <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">移动</button></div>
        </div>
        <div class="help">
          <label>说明</label>
          <p class="muted">选中多个网站后从「移动分类…」进入本弹窗，批量调整归属。</p>
        </div>
      </div>
    </div>
  </ModalMask>
</template>