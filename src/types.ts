export interface Category { id: string; name: string; children: Category[] }
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
  note: string
}
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  zoom: number
}
export interface TrashedSite { site: Site; deletedAt: string }
export interface AppData {
  version: number; categories: Category[]
  sites: Site[]; recycleBin: TrashedSite[]; tags: string[]
}
export type View = { kind: 'all' | 'category' | 'dead' | 'tag' | 'recycle'; id?: string }
export interface CheckResult { status: 'ok' | 'dead'; usedUrl: string }