import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()
const relaunchMock = vi.fn()
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => checkMock() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunchMock() }))

import { checkForUpdate, relaunchApp } from './updater'

describe('updater', () => {
  beforeEach(() => { checkMock.mockReset(); relaunchMock.mockReset() })
  it('returns null when no update', async () => {
    checkMock.mockResolvedValue(null)
    expect(await checkForUpdate()).toBeNull()
  })
  it('returns update object when available', async () => {
    const u = { version: '9.9.9' }
    checkMock.mockResolvedValue(u)
    expect(await checkForUpdate()).toBe(u)
  })
  it('returns null when check throws', async () => {
    checkMock.mockRejectedValue(new Error('offline'))
    expect(await checkForUpdate()).toBeNull()
  })
  it('relaunchApp delegates', async () => {
    await relaunchApp()
    expect(relaunchMock).toHaveBeenCalled()
  })
})
