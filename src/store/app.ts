import { defineStore } from 'pinia'
import type { AppData, Site, TrashedSite, View, Category } from '../types'
import * as api from '../api'

function collectCategoryIds(cats: Category[], rootId: string): string[] {
  const out: string[] = []
  const walk = (list: Category[]) => {
    for (const c of list) {
      if (c.id === rootId) { collect(c, out); return }
      walk(c.children)
    }
  }
  function collect(c: Category, acc: string[]) { acc.push(c.id); c.children.forEach(ch => collect(ch, acc)) }
  walk(cats)
  return out
}

export const useAppStore = defineStore('app', {
  state: () => ({
    data: { version: 1, categories: [], sites: [], recycleBin: [], tags: [] } as AppData,
    view: { kind: 'all' } as View,
    search: '',
    selectedTag: null as string | null,
    selectedIds: [] as string[],
    checking: false,
    progress: { done: 0, total: 0 },
  }),
  getters: {
    filteredSites(state): Site[] {
      let list = [...state.data.sites]
      if (state.view.kind === 'dead') list = list.filter(s => s.status === 'dead')
      else if (state.view.kind === 'category' && state.view.id) {
        const ids = new Set(collectCategoryIds(state.data.categories, state.view.id))
        list = list.filter(s => s.categoryId && ids.has(s.categoryId))
      } else if (state.view.kind === 'tag' && state.view.id) {
        list = list.filter(s => s.tags.includes(state.view.id!))
      }
      const q = state.search.trim().toLowerCase()
      if (q) {
        list = list.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          s.tags.some(t => t.toLowerCase().includes(q)))
      }
      if (state.selectedTag) list = list.filter(s => s.tags.includes(state.selectedTag!))
      return list
    },
    deadCount(state) { return state.data.sites.filter(s => s.status === 'dead').length },
    trashedSites(state): TrashedSite[] { return state.data.recycleBin },
  },
  actions: {
    async init() { this.data = await api.loadData() },
    async persist() { await api.saveData(this.data) },
    async refreshTags() {
      const set = new Set<string>()
      this.data.sites.forEach(s => s.tags.forEach(t => set.add(t)))
      this.data.tags = [...set]
      await this.persist()
    },
  },
})