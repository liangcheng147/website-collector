<script setup lang="ts">
import { computed, ref } from 'vue'
import { NSelect } from 'naive-ui'

const props = defineProps<{ modelValue: string[]; available: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()

// Naive 的 pattern 不对外暴露，用 search 事件跟踪输入内容，
// 用于识别“输入与已选标签重复”时被 Naive 当作切换取消的移除。
const pattern = ref('')

// 已选标签不重复出现在候选里（大小写不敏感）
const selectedKeys = computed(() => new Set(props.modelValue.map(t => t.toLowerCase())))
const options = computed(() =>
  props.available
    .filter(t => !selectedKeys.value.has(t.toLowerCase()))
    .map(t => ({ label: t, value: t })),
)
const availableKeys = computed(() => new Set(props.available.map(t => t.toLowerCase())))

function splitCreated(raw: string): string[] {
  return raw.split(/[#\s，,]+/).map(s => s.trim()).filter(Boolean)
}

function isDuplicateToggle(next: string[]): boolean {
  if (next.length >= props.modelValue.length) return false
  const nextKeys = new Set(next.map(t => t.toLowerCase()))
  const removed = props.modelValue.filter(t => !nextKeys.has(t.toLowerCase()))
  if (!removed.length) return false
  const pieces = splitCreated(pattern.value).map(s => s.toLowerCase())
  // 输入的每个片段都对应被“取消”的标签时，视为重复输入，保留原值
  return removed.every(t => pieces.includes(t.toLowerCase()))
}

function onUpdateValue(value: string | number | Array<string | number> | null) {
  const next = Array.isArray(value) ? value.map(String) : []
  if (isDuplicateToggle(next)) {
    pattern.value = ''
    return
  }
  const currentKeys = new Set(props.modelValue.map(t => t.toLowerCase()))
  const result: string[] = []
  const seen = new Set<string>()
  for (const atom of next) {
    const key = atom.toLowerCase()
    // 仅对“新建的、且不在可用标签里”的输入按分隔符拆分；
    // 从候选里点选的标签保持原样，已选标签大小写不敏感去重。
    const pieces = !currentKeys.has(key) && !availableKeys.value.has(key) ? splitCreated(atom) : [atom]
    for (const piece of pieces) {
      const pieceKey = piece.toLowerCase()
      if (seen.has(pieceKey)) continue
      seen.add(pieceKey)
      result.push(piece)
    }
  }
  pattern.value = ''
  const unchanged = result.length === props.modelValue.length && result.every((t, i) => t === props.modelValue[i])
  if (!unchanged) emit('update:modelValue', result)
}
</script>

<template>
  <n-select
    :value="modelValue"
    multiple
    tag
    filterable
    :virtual-scroll="false"
    :options="options"
    placeholder="输入新建标签，回车添加"
    @update:value="onUpdateValue"
    @search="pattern = $event"
  />
</template>
