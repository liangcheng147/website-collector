<script setup lang="ts">
import { useAppStore } from '../store/app'
import CategoryNode from './CategoryNode.vue'
const store = useAppStore()
function setView(kind: any, id?: string) { store.view = { kind, id } }
</script>

<template>
  <aside class="sidebar">
    <div class="group-label">分类</div>
    <div class="row" :class="{ active: store.view.kind === 'all' }" @click="setView('all')">全部 <span class="cnt">{{ store.data.sites.length }}</span></div>
    <CategoryNode v-for="c in store.data.categories" :key="c.id" :cat="c" :depth="0" />
    <div class="group-label">视图</div>
    <div class="row dead" :class="{ active: store.view.kind === 'dead' }" @click="setView('dead')">⚠ 失效 <span class="cnt">{{ store.deadCount }}</span></div>
    <div class="group-label">标签</div>
    <div v-for="t in store.data.tags" :key="t" class="row" :class="{ active: store.view.kind === 'tag' && store.view.id === t }" @click="setView('tag', t)"># {{ t }}</div>
    <div class="group-label">系统</div>
    <div class="row trash" :class="{ active: store.view.kind === 'recycle' }" @click="setView('recycle')">🗑 回收站 <span class="cnt">{{ store.trashedSites.length }}</span></div>
  </aside>
</template>