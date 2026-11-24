import * as api from '../api'

const cache = new Map<string, Promise<string | null>>()

/**
 * 把本地缓存的 favicon 路径读成 base64 data URL，供 `<img>` 直接加载。
 * 进程内按路径缓存，避免每行重复 IPC；失败静默返回 null。
 */
export function faviconDataUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit) return hit
  const task = api.readFavicon(path).catch(() => {
    // 失败不缓存：缓存文件可能被清理或重建，允许后续重试
    cache.delete(path)
    return null
  })
  cache.set(path, task)
  return task
}
