import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()
const relaunchMock = vi.fn()
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => checkMock() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunchMock() }))

import { checkForUpdate, downloadAndInstall, relaunchApp } from './updater'

describe('updater', () => {
  beforeEach(() => { checkMock.mockReset(); relaunchMock.mockReset() })

  it('reports ok with no update when nothing new', async () => {
    checkMock.mockResolvedValue(null)
    expect(await checkForUpdate()).toEqual({ ok: true, update: null })
  })

  it('reports ok with update when available', async () => {
    const u = { version: '9.9.9' }
    checkMock.mockResolvedValue(u)
    expect(await checkForUpdate()).toEqual({ ok: true, update: u })
  })

  it('reports failure with message when check throws', async () => {
    checkMock.mockRejectedValue(new Error('offline'))
    expect(await checkForUpdate()).toEqual({ ok: false, error: 'offline' })
  })

  it('reports failure for non-Error rejections', async () => {
    checkMock.mockRejectedValue('boom')
    expect(await checkForUpdate()).toEqual({ ok: false, error: 'boom' })
  })

  it('downloadAndInstall forwards progress and finishes at 100%', async () => {
    const events: unknown[] = []
    const update = {
      downloadAndInstall: (cb: (e: unknown) => void) => {
        events.push('start')
        cb({ event: 'Started', data: { contentLength: 100 } })
        cb({ event: 'Progress', data: { chunkLength: 40 } })
        cb({ event: 'Finished' })
        return Promise.resolve()
      },
    }
    const seen: { downloaded: number; total: number | undefined; finished: boolean }[] = []
    await downloadAndInstall(update as never, (p) => seen.push(p))
    expect(events).toEqual(['start'])
    expect(seen).toEqual([
      { downloaded: 0, total: 100, finished: false },
      { downloaded: 40, total: 100, finished: false },
      { downloaded: 100, total: 100, finished: true },
    ])
  })

  it('relaunchApp delegates', async () => {
    await relaunchApp()
    expect(relaunchMock).toHaveBeenCalled()
  })
})