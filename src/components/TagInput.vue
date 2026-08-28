<script setup lang="ts">
import { ref, computed } from 'vue'
const props = defineProps<{ modelValue: string[]; available: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()
const text = ref('')
const open = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const dropStyle = ref<Record<string, string>>({})
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
function positionDropdown() {
  const el = inputEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  dropStyle.value = { position: 'fixed', top: r.bottom + 2 + 'px', left: r.left + 'px', width: r.width + 'px', right: 'auto' }
}
function commit() {
  const raw = text.value.trim()
  if (!raw) { if (filtered.value.length) add(filtered.value[0]); return }
  for (const p of raw.split(/[#\s，,]+/).map(s => s.trim()).filter(Boolean)) add(p)
  text.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); commit() }
  else if (e.key === 'Backspace' && text.value === '' && props.modelValue.length) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}
function onFocus() { open.value = true; positionDropdown() }
function remove(tag: string) { emit('update:modelValue', props.modelValue.filter(x => x !== tag)) }
</script>

<template>
  <div class="tag-input">
    <span v-for="t in modelValue" :key="t" class="chip">{{ t }}<button class="chip-x" type="button" @click="remove(t)">×</button></span>
    <input ref="inputEl" v-model="text" @focus="onFocus" @blur="open = false" @keydown="onKey" placeholder="选择或输入后回车新建" />
    <Teleport to="body">
      <div v-if="open && filtered.length" class="tag-opts" :style="dropStyle">
        <button v-for="t in filtered" :key="t" type="button" class="opt" @mousedown.prevent="add(t)">{{ t }}</button>
      </div>
    </Teleport>
  </div>
</template>
