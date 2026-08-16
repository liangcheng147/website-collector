<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
defineProps<{ cat: any; depth: number }>()
function setView(kind: any, id?: string) { store.view = { kind, id } }
</script>

<template>
  <div>
    <div
      :class="[(depth > 0 ? 'row sub' : 'row'), { active: store.view.kind === 'category' && store.view.id === cat.id }]"
      :style="{ paddingLeft: (depth > 0 ? 12 : 0) + depth * 14 + 'px' }"
      @click="setView('category', cat.id)"
    >
      {{ cat.name }}
    </div>
    <CategoryNode v-for="cc in cat.children" :key="cc.id" :cat="cc" :depth="depth + 1" />
  </div>
</template>