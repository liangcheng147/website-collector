import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type { Update }

export type CheckResult =
  | { ok: true; update: Update | null }
  | { ok: false; error: string }

export interface DownloadProgress {
  downloaded: number
  total: number | undefined
  finished: boolean
}

export async function checkForUpdate(): Promise<CheckResult> {
  try {
    return { ok: true, update: (await check()) ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0
  let total: number | undefined
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') {
      total = e.data.contentLength
      downloaded = 0
      onProgress?.({ downloaded, total, finished: false })
    } else if (e.event === 'Progress') {
      downloaded += e.data.chunkLength
      onProgress?.({ downloaded, total, finished: false })
    } else if (e.event === 'Finished') {
      if (total !== undefined && total > 0) downloaded = total
      onProgress?.({ downloaded, total, finished: true })
    }
  })
}

export async function relaunchApp(): Promise<void> {
  await relaunch()
}