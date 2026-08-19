import { computed, ref } from 'vue'

export function useSelection(getIds: () => string[]) {
  const selected = ref<string[]>([])
  const last = ref<string | null>(null)

  function toggle(id: string) {
    const i = selected.value.indexOf(id)
    if (i >= 0) selected.value.splice(i, 1)
    else selected.value.push(id)
    last.value = id
  }
  function selectOne(id: string) {
    selected.value = [id]
    last.value = id
  }
  function selectRange(id: string) {
    const ids = getIds()
    const cur = ids.indexOf(id)
    if (cur < 0) { selectOne(id); return }
    const anchor = ids.indexOf(last.value ?? id)
    if (anchor < 0) { selectOne(id); return }
    const from = Math.min(cur, anchor)
    const to = Math.max(cur, anchor)
    selected.value = ids.slice(from, to + 1)
    last.value = id
  }
  function selectAll() {
    const ids = getIds()
    if (ids.length && ids.every(i => selected.value.includes(i))) selected.value = []
    else selected.value = ids
  }
  function clear() { selected.value = [] }
  function onRowClick(e: MouseEvent, id: string) {
    if (e.ctrlKey || e.metaKey) toggle(id)
    else if (e.shiftKey) selectRange(id)
    else selectOne(id)
  }
  const allSelected = computed(() => {
    const ids = getIds()
    return ids.length > 0 && ids.every(i => selected.value.includes(i))
  })
  return { selected, toggle, selectOne, selectRange, selectAll, clear, onRowClick, allSelected }
}