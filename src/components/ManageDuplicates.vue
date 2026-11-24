<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, GitMerge, Tag } from 'lucide-vue-next'
import { NButton, NList, NListItem, NRadio, NRadioGroup, NText } from 'naive-ui'
import { useAppStore } from '../store/app'
import { DUPLICATE_TAG } from '../store/app'
import type { DuplicateGroup } from '../types'

const store = useAppStore()
const groups = computed(() => store.duplicateGroups)
const keep = ref<Record<string, string>>({})

watch(groups, list => {
  for (const g of list) {
    if (!keep.value[g.key]) keep.value[g.key] = g.sites[0]?.id ?? ''
  }
}, { immediate: true })

function keepId(g: DuplicateGroup): string {
  return keep.value[g.key] || g.sites[0]?.id || ''
}
function resolveGroup(g: DuplicateGroup) { store.resolveDuplicateGroup(g.key, keepId(g)) }
function mergeGroup(g: DuplicateGroup) { store.mergeDuplicateGroup(g.key, keepId(g)) }
function markGroup(g: DuplicateGroup) { store.markDuplicateGroup(g.key) }
</script>

<template>
  <div class="manage-cols">
    <div class="manage-card">
      <div class="card-head">
        <h4>重复链接组</h4>
        <n-text depth="3">共 {{ groups.length }} 组</n-text>
      </div>
      <div v-if="!groups.length" class="empty">暂无重复链接</div>
      <section v-for="g in groups" :key="g.key" class="dup-group">
        <div class="dup-head">
          <span class="dup-url">{{ g.key }}</span>
          <n-text depth="3">{{ g.sites.length }} 条</n-text>
        </div>
        <n-radio-group v-model:value="keep[g.key]" class="dup-radios" :aria-label="`选择保留 ${g.key}`">
          <n-list>
            <n-list-item v-for="s in g.sites" :key="s.id" class="dup-site">
              <n-radio :value="s.id" :aria-label="s.name" />
              <div class="dup-meta">
                <span class="dup-name">{{ s.name }}</span>
                <span class="dup-raw">{{ s.url }}</span>
                <span v-if="s.tags.length" class="dup-tags">#{{ s.tags.join(' #') }}</span>
                <span v-if="s.note" class="dup-note">{{ s.note }}</span>
              </div>
            </n-list-item>
          </n-list>
        </n-radio-group>
        <div class="actions">
          <n-button size="small" @click="resolveGroup(g)"><Copy :size="14" /> 保留所选</n-button>
          <n-button size="small" secondary @click="mergeGroup(g)"><GitMerge :size="14" /> 合并到所选</n-button>
          <n-button size="small" quaternary @click="markGroup(g)"><Tag :size="14" /> 标记整组</n-button>
        </div>
      </section>
    </div>
    <div class="manage-card">
      <h4>处理方式</h4>
      <label>保留一条</label>
      <n-text depth="3">选中要保留的站点，同组其余站点移入回收站，可随时恢复。</n-text>
      <label>合并</label>
      <n-text depth="3">把同组其他站点的标签与备注合并到所选站点，其余移入回收站。</n-text>
      <label>标记</label>
      <n-text depth="3">给整组站点加上「{{ DUPLICATE_TAG }}」标签，方便在标签视图集中查看；不改变分组结果。</n-text>
    </div>
  </div>
</template>

<style scoped>
.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-head h4 { margin-bottom: 0; }
.dup-group { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px 12px; margin-top: 12px; }
.dup-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dup-url { font-family: var(--mono); font-size: 12px; color: var(--text); word-break: break-all; }
.dup-site { padding: 6px 4px; }
.dup-site :deep(.n-list-item__main) { display: flex; align-items: flex-start; gap: 8px; }
.dup-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dup-name { font-weight: 600; }
.dup-raw, .dup-tags, .dup-note { font-size: 12px; color: var(--text-2); word-break: break-all; }
</style>
