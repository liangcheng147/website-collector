export interface Category { id: string; name: string; children: Category[] }
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
  note: string
  /** 本地缓存的 favicon 绝对路径；未抓取时为 null/undefined */
  faviconPath?: string | null
}
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  palette: string
  zoom: number
  sidebarCollapsed: string[]
  collapsedCategories: string[]
  autoCheckUpdate: boolean
  /** 添加/编辑站点时自动抓取 favicon（默认开） */
  autoFetchFavicon: boolean
}
export interface TrashedSite { site: Site; deletedAt: string }
export interface AppData {
  version: number; categories: Category[]
  sites: Site[]; recycleBin: TrashedSite[]; tags: string[]
}
export type View = { kind: 'all' | 'category' | 'dead' | 'tag' | 'recycle'; id?: string }
export interface CheckResult { status: 'ok' | 'dead'; usedUrl: string }
export interface DuplicateGroup { key: string; sites: Site[] }
export interface ImportSummary { added: number; merged: number; duplicates: number }