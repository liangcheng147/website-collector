<script setup lang="ts">
import { ref, computed } from 'vue'
const props = defineProps<{ modelValue: string[]; available: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()
const text = ref('')
const open = ref(false)
const lowerSel = computed(() => new Set(props.modelValue.map(t => t.toLowerCase())))
const filtered = computed(() => {
  const q = text.value.trim().toLowerCase()
  return props.available.filter(t => !lowerSel.value.has(t.toLowerCase()) && (q === '' || t.toLowerCase().includes(q)))
})
function add(tag: string) {
  const t = tag.trim()
  if (!t) return
  if (props.modelValue.some(x => x.toLowerCase() === t.toLowerCase())) { text.value = ''; return }
  emit('update:modelValue', [...props.modelValue, t])
  text.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); if (filtered.value.length) add(filtered.value[0]); else add(text.value); }
  else if (e.key === 'Backspace' && text.value === '' && props.modelValue.length) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}
function remove(tag: string) { emit('update:modelValue', props.modelValue.filter(x => x !== tag)) }
</script>

<template>
  <div class="tag-input">
    <span v-for="t in modelValue" :key="t" class="chip">{{ t }}<button class="chip-x" type="button" @click="remove(t)">×</button></span>
    <input v-model="text" @focus="open = true" @blur="open = false" @keydown="onKey" placeholder="选择或输入后回车新建" />
    <div v-if="open && filtered.length" class="tag-opts">
      <button v-for="t in filtered" :key="t" type="button" class="opt" @mousedown.prevent="add(t)">{{ t }}</button>
    </div>
  </div>
</template>
