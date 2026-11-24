export interface Category { id: string; name: string; children: Category[] }
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
  note: string
  /** 本地缓存的 favicon 绝对路径；未抓取时为 null/undefined */
  faviconPath?: string | null
}
/** 检查范围：全部 / 当前分类 / 当前标签 / 选中 */
export type CheckScope = 'all' | 'category' | 'tag' | 'selected'
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  palette: string
  zoom: number
  sidebarCollapsed: string[]
  collapsedCategories: string[]
  autoCheckUpdate: boolean
  /** 添加/编辑站点时自动抓取 favicon（默认开） */
  autoFetchFavicon: boolean
  /** 自动检查偏好（当前仅持久化，定时调度未接入） */
  autoCheck: boolean
  /** 自动检查间隔（分钟），0 表示不调度 */
  checkInterval: number
  /** 默认检查范围 */
  checkScope: CheckScope
  /** 失败后的额外重试次数（默认 1） */
  retryCount: number
  /** 并发检测上限（默认 3） */
  concurrency: number
}
export interface TrashedSite { site: Site; deletedAt: string }
export interface AppData {
  version: number; categories: Category[]
  sites: Site[]; recycleBin: TrashedSite[]; tags: string[]
}
export type View = { kind: 'all' | 'category' | 'dead' | 'tag' | 'recycle'; id?: string }
export interface CheckResult { status: 'ok' | 'dead'; usedUrl: string }
/** 批量检测单项结果：请求 URL + 最终状态 + 实际生效 URL */
export interface SiteCheckResult { url: string; status: 'ok' | 'dead'; usedUrl: string }
export interface DuplicateGroup { key: string; sites: Site[] }
export interface ImportSummary { added: number; merged: number; duplicates: number }