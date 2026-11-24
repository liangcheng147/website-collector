<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  Download, LayoutGrid, LayoutList, Plus, Radar, Recycle, Search, Settings, Skull, Trash2,
} from 'lucide-vue-next'
import { NInput, NModal } from 'naive-ui'
import type { InputInst } from 'naive-ui'
import type { View } from '../types'

const emit = defineEmits<{
  close: []
  add: []
  'import-export': []
  'check-all': []
  settings: []
  manage: []
  cleanup: []
  view: [view: View]
}>()

interface Command {
  id: string
  name: string
  hint: string
  keywords: string[]
  icon: Component
  run: () => void
}

// 命令集：操作类 + 视图切换；重复链接并入「管理页」，避免命令膨胀
const commands: Command[] = [
  { id: 'add', name: '添加站点', hint: '新增一个网站收藏', keywords: ['添加', '新增', '站点', 'add'], icon: Plus, run: () => emit('add') },
  { id: 'check-all', name: '检测全部', hint: '检查所有站点可达性', keywords: ['检测', '检查', '全部', 'check'], icon: Radar, run: () => emit('check-all') },
  { id: 'import-export', name: '导入 / 导出', hint: '备份或恢复站点数据', keywords: ['导入', '导出', '备份', 'import', 'export'], icon: Download, run: () => emit('import-export') },
  { id: 'view-all', name: '视图：全部', hint: '显示所有站点', keywords: ['视图', '全部', '所有', 'all'], icon: LayoutList, run: () => emit('view', { kind: 'all' }) },
  { id: 'view-dead', name: '视图：失效', hint: '只看待处理与已失效', keywords: ['视图', '失效', 'dead'], icon: Skull, run: () => emit('view', { kind: 'dead' }) },
  { id: 'view-recycle', name: '视图：回收站', hint: '管理已删除的站点', keywords: ['视图', '回收站', 'recycle', 'trash'], icon: Recycle, run: () => emit('view', { kind: 'recycle' }) },
  { id: 'manage', name: '管理页', hint: '分类、标签与重复链接', keywords: ['管理', '分类', '标签', '重复', 'manage'], icon: LayoutGrid, run: () => emit('manage') },
  { id: 'settings', name: '设置', hint: '外观、检测与其他偏好', keywords: ['设置', '偏好', '选项', 'setting', 'settings'], icon: Settings, run: () => emit('settings') },
  { id: 'cleanup', name: '失效清理', hint: '批量移入回收站', keywords: ['清理', '失效', '回收站', 'cleanup'], icon: Trash2, run: () => emit('cleanup') },
]

const query = ref('')
const activeIndex = ref(0)
const searchRef = ref<InputInst | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands
  return commands.filter(c =>
    c.name.toLowerCase().includes(q)
    || c.hint.toLowerCase().includes(q)
    || c.keywords.some(k => k.toLowerCase().includes(q)),
  )
})

watch(query, () => { activeIndex.value = 0 })

function move(delta: number) {
  const len = filtered.value.length
  if (!len) return
  activeIndex.value = (activeIndex.value + delta + len) % len
}

function execute(cmd: Command) {
  cmd.run()
  emit('close')
}

function close() {
  emit('close')
}

/**
 * 面板内的键盘交互挂在 document 上：n-modal teleport 后焦点可能在搜索框/命令按钮间移动，
 * 统一在文档层接管 ↑/↓/Enter/Esc，并阻止冒泡，避免触发 App 既有 Escape 分支。
 *
 * - IME 组合态（中/日/韩输入法）整体让位：此时 Enter 是候选词确认、方向键是光标移动，
 *   面板不得拦截，否则会破坏正常输入。
 * - ↑/↓ 导航按命令面板惯例保留在面板级，但仅适用于单行搜索框；带 Alt/Ctrl/Meta 的组合键
 *   交回浏览器/输入框，不做全局劫持。
 */
function onDocKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    move(e.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filtered.value[activeIndex.value]
    if (cmd) execute(cmd)
  }
}

onMounted(async () => {
  await nextTick()
  // 打开即聚焦搜索框；focus-trap 的自动聚焦在部分环境下会落到哨兵节点，这里显式聚焦
  searchRef.value?.focus()
  document.addEventListener('keydown', onDocKeydown)
})
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown))
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    to="body"
    class="command-palette-modal"
    :style="{ width: 'min(560px, 92%)' }"
    :mask-closable="true"
    :close-on-esc="false"
    :trap-focus="true"
    :auto-focus="true"
    data-testid="command-palette-modal"
    @update:show="close"
  >
    <div class="palette" data-testid="command-palette">
      <div class="palette-head">
        <n-input
          ref="searchRef"
          v-model:value="query"
          data-testid="command-search"
          placeholder="输入命令或关键字…"
          clearable
          autofocus
          aria-label="搜索命令"
        >
          <template #prefix><Search :size="14" /></template>
        </n-input>
        <span v-if="!query" class="keys-hint">↑↓ 选择 · Enter 执行 · Esc 关闭</span>
      </div>
      <div class="cmd-list" role="listbox" aria-label="命令列表">
        <button
          v-for="(cmd, i) in filtered"
          :key="cmd.id"
          type="button"
          class="cmd-row"
          :class="{ active: i === activeIndex }"
          role="option"
          :aria-selected="i === activeIndex"
          :data-command="cmd.id"
          @click="execute(cmd)"
          @mouseenter="activeIndex = i"
          @focus="activeIndex = i"
        >
          <component :is="cmd.icon" :size="15" :stroke-width="1.8" class="cmd-icon" />
          <span class="cmd-name">{{ cmd.name }}</span>
          <span class="cmd-hint">{{ cmd.hint }}</span>
        </button>
        <div v-if="!filtered.length" class="empty-state">
          <Search :size="32" :stroke-width="1.5" class="empty-icon" />
          <b>没有匹配的命令</b>
          <span class="hint">换个关键字试试，或按 Esc 关闭面板</span>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.command-palette-modal { /* 宽度由模板 :style 动态绑定，避免 teleport 后 scoped 选择器失效 */ }
.palette { display: flex; flex-direction: column; gap: 10px; }
.palette-head { display: flex; flex-direction: column; gap: 6px; }
.keys-hint { font-size: 12px; color: var(--text-2); }
.cmd-list {
  display: flex; flex-direction: column; gap: 2px;
  max-height: min(50vh, 360px); overflow-y: auto;
}
.cmd-row {
  display: flex; align-items: center; justify-content: flex-start; gap: 10px;
  width: 100%; height: 38px; padding: 0 10px;
  border: 1px solid transparent; background: transparent;
  border-radius: var(--radius-md); color: var(--text); text-align: left;
}
.cmd-row:hover { background: var(--hover); }
.cmd-row.active {
  background: var(--primary-t); color: var(--primary);
  box-shadow: inset 3px 0 0 var(--primary);
}
.cmd-icon { flex: none; color: var(--text-2); }
.cmd-row.active .cmd-icon { color: var(--primary); }
.cmd-name { font-weight: 600; flex: none; }
.cmd-hint {
  margin-left: auto; font-size: 12px; color: var(--text-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
