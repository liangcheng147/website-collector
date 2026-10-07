// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAppStore } from '../store/app'
import SettingsModal from './SettingsModal.vue'

const getDataFilePathMock = vi.fn()
const openDataDirMock = vi.fn()
const getVersionMock = vi.fn()
const checkForUpdateMock = vi.fn()
const downloadAndInstallMock = vi.fn()
const relaunchAppMock = vi.fn()

vi.mock('../api', () => ({
  getDataFilePath: () => getDataFilePathMock(),
  openDataDir: () => openDataDirMock(),
  openLink: () => Promise.resolve(),
}))
vi.mock('../updater', () => ({
  checkForUpdate: () => checkForUpdateMock(),
  downloadAndInstall: (...a: unknown[]) => downloadAndInstallMock(...a),
  relaunchApp: () => relaunchAppMock(),
}))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => getVersionMock() }))

// ModalMask teleports into document.body, so assert against document.body
describe('SettingsModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    getDataFilePathMock.mockReset().mockResolvedValue('C:/data/data.json')
    getVersionMock.mockReset().mockResolvedValue('0.2.1')
    checkForUpdateMock.mockReset().mockResolvedValue({ ok: true, update: null })
    downloadAndInstallMock.mockReset().mockResolvedValue(undefined)
    relaunchAppMock.mockReset().mockResolvedValue(undefined)
  })

  async function mountAndOpenAbout() {
    const store = useAppStore()
    store.location = { dir: 'C:/data', isFallback: false }
    mount(SettingsModal)
    await nextTick()
    await nextTick()
    const aboutBtn = Array.from(document.body.querySelectorAll('.settings-nav-item'))
      .find(el => el.textContent?.trim() === '关于') as HTMLElement
    aboutBtn.click()
    await nextTick()
    return store
  }

  it('shows version and a check-for-update button in the about section', async () => {
    await mountAndOpenAbout()
    expect(document.body.textContent).toContain('SiteCollector v0.2.1')
    expect(document.body.textContent).toContain('检查更新')
  })

  it('reports already up to date when check succeeds with no update', async () => {
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('.btn'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('已是最新版本')
    expect(document.body.textContent).not.toContain('下载并安装')
  })

  it('offers download when an update is available', async () => {
    checkForUpdateMock.mockResolvedValue({ ok: true, update: { version: '0.3.0', body: 'notes' } })
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('.btn'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('发现新版本 v0.3.0')
    expect(document.body.textContent).toContain('下载并安装')
  })

  it('shows a check failure instead of claiming up to date', async () => {
    checkForUpdateMock.mockResolvedValue({ ok: false, error: 'offline' })
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('.btn'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('检查失败：offline')
    expect(document.body.textContent).not.toContain('已是最新版本')
  })

  it('shows indeterminate text while the total size is unknown, then a percentage', async () => {
    checkForUpdateMock.mockResolvedValue({ ok: true, update: { version: '0.3.0', body: '' } })
    let progress: ((p: unknown) => void) | undefined
    downloadAndInstallMock.mockImplementation((_u: unknown, cb: (p: unknown) => void) => {
      progress = cb
      return new Promise<void>(() => {})
    })
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('.btn'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    ;(Array.from(document.body.querySelectorAll('.btn'))
      .find(el => el.textContent?.trim() === '下载并安装') as HTMLElement).click()
    await nextTick()

    progress?.({ downloaded: 10, total: undefined, finished: false })
    await nextTick()
    expect(document.body.textContent).toContain('下载中…')
    expect(document.body.querySelector('progress')).toBeNull()

    progress?.({ downloaded: 50, total: 100, finished: false })
    await nextTick()
    expect(document.body.textContent).toContain('下载中 50%')
    expect(document.body.querySelector('progress')).not.toBeNull()
  })
})