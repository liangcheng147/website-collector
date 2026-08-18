<script setup lang="ts">
import { ref } from 'vue'
import ManageCategories from './ManageCategories.vue'
import ManageTags from './ManageTags.vue'
const emit = defineEmits(['back'])
const tab = ref<'categories' | 'tags'>('categories')
</script>

<template>
  <div class="manage">
    <div class="manage-bar">
      <button class="btn" @click="emit('back')">← 返回主页面</button>
      <span class="manage-title">管理</span>
      <div class="manage-tabs">
        <button class="btn" :class="{ active: tab === 'categories' }" @click="tab = 'categories'">分类</button>
        <button class="btn" :class="{ active: tab === 'tags' }" @click="tab = 'tags'">标签</button>
      </div>
    </div>
    <div class="manage-content">
      <ManageCategories v-if="tab === 'categories'" />
      <ManageTags v-else />
    </div>
  </div>
</template>
