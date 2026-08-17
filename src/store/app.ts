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
    connectivityError: false,
    flashMsg: '',
    location: { dir: '', isFallback: false },
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
    lastCheckTime(state) {
      const times = state.data.sites.map(s => s.lastCheck).filter(Boolean) as string[]
      return times.length ? new Date(Math.max(...times.map(t => +new Date(t)))).toLocaleString() : '—'
    },
    trashedSites(state): TrashedSite[] { return state.data.recycleBin },
    flatCategories(): { id: string; name: string; depth: number }[] {
      const out: { id: string; name: string; depth: number }[] = []
      const walk = (list: any[], depth: number) => {
        for (const c of list) { out.push({ id: c.id, name: c.name, depth }); walk(c.children, depth + 1) }
      }
      walk(this.data.categories, 0)
      return out
    },
  },
  actions: {
    async init() {
      this.data = await api.loadData()
      const loc = await api.getDataLocation()
      this.location = loc
    },
    async persist() { await api.saveData(this.data) },
    setData(d: AppData) { this.data = d; this.persist() },
    flash(msg: string) {
      this.flashMsg = msg
      setTimeout(() => { this.flashMsg = '' }, 2500)
    },
    async refreshTags() {
      const set = new Set<string>()
      this.data.sites.forEach(s => s.tags.forEach(t => set.add(t)))
      this.data.tags = [...set]
      await this.persist()
    },

    id_gen() {
      return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
    },

    isDuplicateUrl(url: string) {
      return this.data.sites.some(s => s.url === url)
    },

    addSite(input: { name: string; url: string; categoryId: string | null; tags: string[] }) {
      if (this.isDuplicateUrl(input.url)) return
      this.data.sites.push({
        id: this.id_gen(), name: input.name, url: input.url,
        categoryId: input.categoryId, tags: [...input.tags],
        status: 'unknown', lastCheck: null,
      })
      this.refreshTags()
    },

    updateSite(id: string, patch: Partial<Site>) {
      const idx = this.data.sites.findIndex(s => s.id === id)
      if (idx >= 0) { Object.assign(this.data.sites[idx], patch); this.refreshTags() }
    },

    deleteSites(ids: string[]) {
      const set = new Set(ids)
      const now = new Date().toISOString()
      this.data.sites = this.data.sites.filter(s => {
        if (set.has(s.id)) { this.data.recycleBin.push({ site: s, deletedAt: now }); return false }
        return true
      })
      this.persist()
    },

    restoreSite(siteId: string) {
      const idx = this.data.recycleBin.findIndex(t => t.site.id === siteId)
      if (idx >= 0) {
        this.data.sites.push(this.data.recycleBin[idx].site)
        this.data.recycleBin.splice(idx, 1)
        this.persist()
      }
    },

    permanentlyDelete(siteId: string) {
      const idx = this.data.recycleBin.findIndex(t => t.site.id === siteId)
      if (idx >= 0) { this.data.recycleBin.splice(idx, 1); this.persist() }
    },

    emptyRecycle() {
      this.data.recycleBin = []
      this.persist()
    },

    addCategory(name: string, parentId: string | null): string {
      const node = { id: this.id_gen(), name, children: [] as any[] }
      if (parentId == null) this.data.categories.push(node)
      else {
        const walk = (list: any[]): boolean => {
          for (const c of list) {
            if (c.id === parentId) { c.children.push(node); return true }
            if (walk(c.children)) return true
          }
          return false
        }
        walk(this.data.categories)
      }
      this.persist()
      return node.id
    },

    renameCategory(id: string, name: string) {
      const walk = (list: any[]): boolean => {
        for (const c of list) {
          if (c.id === id) { c.name = name; return true }
          if (walk(c.children)) return true
        }
        return false
      }
      walk(this.data.categories)
      this.persist()
    },

    deleteCategory(id: string, mode: 'move-to-uncategorized' | 'delete-sites') {
      const ids = new Set<string>()
      const collect = (c: any) => { ids.add(c.id); c.children.forEach(collect) }
      const find = (list: any[]): boolean => {
        for (const c of list) {
          if (c.id === id) { collect(c); removeNode(list, c); return true }
          if (find(c.children)) return true
        }
        return false
      }
      const removeNode = (list: any[], target: any) => { const i = list.indexOf(target); if (i >= 0) list.splice(i, 1) }
      find(this.data.categories)
      if (mode === 'move-to-uncategorized') {
        this.data.sites.forEach(s => { if (s.categoryId && ids.has(s.categoryId)) s.categoryId = null })
      } else {
        const toDelete = this.data.sites.filter(s => s.categoryId && ids.has(s.categoryId)).map(s => s.id)
        this.deleteSites(toDelete)
      }
      this.persist()
    },

    moveSites(ids: string[], categoryId: string | null) {
      const set = new Set(ids)
      this.data.sites.forEach(s => { if (set.has(s.id)) s.categoryId = categoryId })
      this.persist()
    },

    addTagsToSites(ids: string[], tags: string[]) {
      const set = new Set(ids)
      this.data.sites.forEach(s => {
        if (set.has(s.id)) { tags.forEach(t => { if (!s.tags.includes(t)) s.tags.push(t) }) }
      })
      this.refreshTags()
    },

    toggleSelect(id: string) {
      const i = this.selectedIds.indexOf(id)
      if (i >= 0) this.selectedIds.splice(i, 1)
      else this.selectedIds.push(id)
    },
    clearSelection() { this.selectedIds = [] },
    deleteSelected() { this.deleteSites([...this.selectedIds]) },

    async checkAll() {
      if (this.checking) return
      if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
      this.connectivityError = false
      this.checking = true
      this.progress = { done: 0, total: this.data.sites.length }
      try {
        for (const s of [...this.data.sites]) {
          const r = await api.checkSite(s.url)
          s.status = r.status
          s.lastCheck = new Date().toISOString()
          this.progress.done++
          this.persist()
        }
      } finally {
        this.checking = false
      }
    },

    async checkOne(id: string) {
      const s = this.data.sites.find(x => x.id === id)
      if (!s) return
      const r = await api.checkSite(s.url)
      s.status = r.status
      s.lastCheck = new Date().toISOString()
      this.persist()
    },

    async checkSelected() {
      if (this.checking) return
      if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
      this.connectivityError = false
      this.checking = true
      const ids = [...this.selectedIds]
      this.progress = { done: 0, total: ids.length }
      try {
        for (const id of ids) {
          const s = this.data.sites.find(x => x.id === id)
          if (s) { const r = await api.checkSite(s.url); s.status = r.status; s.lastCheck = new Date().toISOString() }
          this.progress.done++
          this.persist()
        }
      } finally {
        this.checking = false
        this.clearSelection()
      }
    },
  },
})