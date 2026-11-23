<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { NButton, NTabs, NTab } from 'naive-ui'
import ManageCategories from './ManageCategories.vue'
import ManageTags from './ManageTags.vue'
const emit = defineEmits(['back'])
const tab = ref<'categories' | 'tags'>('categories')
</script>

<template>
  <div class="manage">
    <div class="manage-bar">
      <n-button secondary size="small" @click="emit('back')"><ArrowLeft :size="14" /> 返回主页面</n-button>
      <span class="manage-title">管理</span>
      <n-tabs v-model:value="tab" type="segment" class="manage-switch">
        <n-tab name="categories" tab="分类" />
        <n-tab name="tags" tab="标签" />
      </n-tabs>
    </div>
    <div class="manage-content">
      <ManageCategories v-if="tab === 'categories'" />
      <ManageTags v-else />
    </div>
  </div>
</template>

<style scoped>
.manage-switch { width: 220px; margin-left: 8px; }
</style>
