import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type { Update }

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return (await check()) ?? null
  } catch {
    return null
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<void> {
  let downloaded = 0
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') onProgress?.(0, e.data.contentLength)
    else if (e.event === 'Progress') {
      downloaded += e.data.chunkLength
      onProgress?.(downloaded, undefined)
    }
  })
}

export async function relaunchApp(): Promise<void> {
  await relaunch()
}
