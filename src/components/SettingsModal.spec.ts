// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { h, nextTick, type Component } from 'vue'
import { mount } from '@vue/test-utils'
import { NDialogProvider } from 'naive-ui'
import { useAppStore } from '../store/app'
import { PALETTES } from '../theme'
import SettingsModal from './SettingsModal.vue'
import type { AppData, BackupInfo } from '../types'

const getDataFilePathMock = vi.fn()
const openDataDirMock = vi.fn()
const openLinkMock = vi.fn()
const setSettingsMock = vi.fn()
const getVersionMock = vi.fn()
const checkForUpdateMock = vi.fn()
const downloadAndInstallMock = vi.fn()
const relaunchAppMock = vi.fn()
const listBackupsMock = vi.fn()
const createBackupMock = vi.fn()
const restoreBackupMock = vi.fn()

vi.mock('../api', () => ({
  getDataFilePath: () => getDataFilePathMock(),
  openDataDir: () => openDataDirMock(),
  openLink: (...args: unknown[]) => openLinkMock(...args),
  setSettings: (...args: unknown[]) => setSettingsMock(...args),
  listBackups: () => listBackupsMock(),
  createBackup: () => createBackupMock(),
  restoreBackup: (...args: unknown[]) => restoreBackupMock(...args),
}))
vi.mock('../updater', () => ({
  checkForUpdate: () => checkForUpdateMock(),
  downloadAndInstall: (...a: unknown[]) => downloadAndInstallMock(...a),
  relaunchApp: () => relaunchAppMock(),
}))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => getVersionMock() }))

function backupInfo(name: string, size = 2048, createdAt = 0): BackupInfo {
  return { path: 'C:/data/backups/' + name, fileName: name, size, createdAt }
}

function seedData(ids: string[] = []): AppData {
  return {
    version: 1,
    categories: [],
    sites: ids.map((id) => ({
      id, name: '站点' + id, url: `https://${id}.dev`, categoryId: null,
      tags: [], status: 'unknown' as const, lastCheck: null, note: '',
    })),
    recycleBin: [],
    tags: [],
  }
}

// n-modal teleports into document.body, so assert against document.body
describe('SettingsModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    getDataFilePathMock.mockReset().mockResolvedValue('C:/data/data.json')
    getVersionMock.mockReset().mockResolvedValue('0.2.1')
    checkForUpdateMock.mockReset().mockResolvedValue({ ok: true, update: null })
    downloadAndInstallMock.mockReset().mockResolvedValue(undefined)
    relaunchAppMock.mockReset().mockResolvedValue(undefined)
    setSettingsMock.mockReset().mockResolvedValue(undefined)
    listBackupsMock.mockReset().mockResolvedValue([])
    createBackupMock.mockReset().mockResolvedValue(backupInfo('backup-20260101-000000.json'))
    restoreBackupMock.mockReset().mockResolvedValue(seedData([]))
  })

  // useDialog 与 n-modal 都需要 provider；modal 内容 teleport 到 document.body
  function mountWithProvider(component: Component) {
    return mount({
      setup: () => () => h(NDialogProvider, null, { default: () => h(component) }),
    })
  }

  async function mountModal() {
    const store = useAppStore()
    store.location = { dir: 'C:/data', isFallback: false }
    mountWithProvider(SettingsModal)
    await nextTick()
    await nextTick()
    return store
  }

  async function openTab(testid: string) {
    ;(document.body.querySelector(`[data-testid="${testid}"]`) as HTMLElement).click()
    await nextTick()
  }

  async function mountAndOpenAbout() {
    const store = await mountModal()
    await openTab('settings-tab-about')
    return store
  }

  it('shows version and a check-for-update button in the about section', async () => {
    await mountAndOpenAbout()
    expect(document.body.textContent).toContain('SiteCollector v0.2.1')
    expect(document.body.textContent).toContain('检查更新')
  })

  it('reports already up to date when check succeeds with no update', async () => {
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('已是最新版本')
    expect(document.body.textContent).not.toContain('下载并安装')
  })

  it('offers download when an update is available', async () => {
    checkForUpdateMock.mockResolvedValue({ ok: true, update: { version: '0.3.0', body: 'notes' } })
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('发现新版本 v0.3.0')
    expect(document.body.textContent).toContain('下载并安装')
  })

  it('shows a check failure instead of claiming up to date', async () => {
    checkForUpdateMock.mockResolvedValue({ ok: false, error: 'offline' })
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('button'))
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
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '检查更新') as HTMLElement).click()
    await nextTick()
    await nextTick()
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '下载并安装') as HTMLElement).click()
    await nextTick()

    progress?.({ downloaded: 10, total: undefined, finished: false })
    await nextTick()
    expect(document.body.textContent).toContain('下载中…')
    expect(document.body.querySelector('.n-progress')).toBeNull()

    progress?.({ downloaded: 50, total: 100, finished: false })
    await nextTick()
    expect(document.body.textContent).toContain('下载中 50%')
    expect(document.body.querySelector('.n-progress')).not.toBeNull()
  })

  it('renders theme mode and palette as naive-ui controls', async () => {
    await mountModal()
    expect(document.body.querySelector('.n-select')).not.toBeNull()
    expect(document.body.querySelector('.n-radio-group')).not.toBeNull()
    expect(document.body.querySelectorAll('.n-radio')).toHaveLength(PALETTES.length)
    expect(document.body.querySelector('.palette-swatch')).toBeNull()
    for (const p of PALETTES) {
      expect(document.body.textContent).toContain(p.name)
    }
  })

  it('renders display zoom as n-slider with the current value', async () => {
    await mountModal()
    await openTab('settings-tab-display')
    expect(document.body.querySelector('.n-slider')).not.toBeNull()
    expect(document.body.textContent).toContain('100%')
  })

  it('renders the data file path as a naive input, not a native readonly input', async () => {
    await mountModal()
    await openTab('settings-tab-storage')
    expect(document.body.querySelector('.n-input')).not.toBeNull()
    const readonly = document.body.querySelector('input[readonly]')
    expect(readonly).not.toBeNull()
    expect(readonly!.closest('.n-input')).not.toBeNull()
    expect((readonly as HTMLInputElement).value).toBe('C:/data/data.json')
    expect(document.body.querySelector('.palette-swatch')).toBeNull()
    // 设计 §4.2：路径输入框与“打开数据目录”同一行
    const pathRow = document.body.querySelector('.path-row')
    expect(pathRow).not.toBeNull()
    expect(pathRow!.querySelector('.n-input')).not.toBeNull()
    expect(pathRow!.querySelector('button')?.textContent?.trim()).toBe('打开数据目录')
  })

  it('renders about controls as naive-ui and uses the LICENSE copyright', async () => {
    await mountModal()
    await openTab('settings-tab-about')
    expect(document.body.querySelector('.n-button')).not.toBeNull()
    expect(document.body.querySelector('.n-switch')).not.toBeNull()
    expect(document.body.textContent).toContain('MIT License')
    expect(document.body.textContent).toContain('Copyright (c) 2026 fan-root')
    expect(document.body.textContent).not.toContain('作者 bjb')
  })

  it('shows the app summary, project links, license and dynamic version in the about section', async () => {
    await mountAndOpenAbout()
    expect(document.body.textContent).toContain('本地优先的网站收藏与可用性检测桌面应用')
    expect(document.body.textContent).toContain('问题反馈')
    expect(document.body.textContent).toContain('发布页')
    expect(document.body.textContent).toContain('MIT License · Copyright (c) 2026 fan-root')
    expect(document.body.textContent).not.toContain('作者 bjb')
    expect(getVersionMock).toHaveBeenCalled()
    expect(document.body.textContent).toContain('v0.2.1')
  })

  it('lays out the about section as app info, update and diagnostics groups', async () => {
    await mountAndOpenAbout()
    const titles = Array.from(document.body.querySelectorAll('.settings-pane .group-title'))
      .map(el => el.textContent?.trim())
    expect(titles).toEqual(['应用信息', '更新', '诊断信息'])
    expect(document.body.textContent).toContain('User Agent')
  })

  it('opens the feedback and release pages from the about links', async () => {
    await mountAndOpenAbout()
    const buttons = Array.from(document.body.querySelectorAll('button'))
    ;(buttons.find(el => el.textContent?.trim() === '问题反馈') as HTMLElement).click()
    ;(buttons.find(el => el.textContent?.trim() === '发布页') as HTMLElement).click()
    await nextTick()
    expect(openLinkMock).toHaveBeenCalledWith('https://github.com/liangcheng147/website-collector/issues')
    expect(openLinkMock).toHaveBeenCalledWith('https://github.com/liangcheng147/website-collector/releases')
  })

  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  }

  afterEach(() => {
    delete (window.navigator as unknown as Record<string, unknown>).clipboard
  })

  it('copies the app identity, version and user agent as diagnostic info', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '复制诊断信息') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('SiteCollector')
    expect(text).toContain('v0.2.1')
    expect(text).toContain(navigator.userAgent)
    expect(document.body.textContent).toContain('已复制诊断信息')
  })

  it('shows a fallback hint when copying diagnostics fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)
    await mountAndOpenAbout()
    ;(Array.from(document.body.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === '复制诊断信息') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.body.textContent).toContain('复制失败，请手动复制')
    expect(document.body.textContent).not.toContain('已复制诊断信息')
  })

  it('does not depend on the legacy .modal-content layout', async () => {
    await mountModal()
    expect(document.body.querySelector('[data-testid="modal-settings"] .modal-content')).toBeNull()
  })

  it('selecting a palette option updates the store palette', async () => {
    const store = await mountModal()
    const options = document.body.querySelectorAll('.n-radio')
    ;(options[1] as HTMLElement).click()
    await nextTick()
    expect(store.settings.palette).toBe(PALETTES[1].id)
  })

  it('renders an auto-fetch favicon switch defaulting to on in the display section', async () => {
    const store = await mountModal()
    await openTab('settings-tab-display')
    expect(store.settings.autoFetchFavicon).toBe(true)
    const label = document.body.querySelector('#auto-favicon-label') as HTMLElement
    expect(label).not.toBeNull()
    expect(label.textContent).toContain('自动抓取图标')
    label.click()
    await nextTick()
    expect(store.settings.autoFetchFavicon).toBe(false)
  })

  it('renders the check policy section with defaults and naive controls', async () => {
    await mountModal()
    await openTab('settings-tab-check')
    const text = document.body.textContent || ''
    for (const label of ['自动检查', '检查频率', '默认范围', '重试次数', '并发上限']) {
      expect(text).toContain(label)
    }
    // 频率/重试/并发用 slider（非当前页签的控件可能仍在 DOM，故用下限断言），范围用 select，自动检查用 switch
    expect(document.body.querySelectorAll('.n-slider').length).toBeGreaterThanOrEqual(3)
    expect(document.body.querySelectorAll('.n-select').length).toBeGreaterThanOrEqual(1)
    expect(document.body.querySelector('.n-switch')).not.toBeNull()
    expect(text).toContain('0 分钟')
    expect(text).toContain('1 次')
    expect(text).toContain('3 路')
  })

  it('toggling auto check persists through updateSettings', async () => {
    const store = await mountModal()
    await openTab('settings-tab-check')
    const autoCheckLabel = document.body.querySelector('#auto-check-label') as HTMLElement
    expect(autoCheckLabel).not.toBeNull()
    autoCheckLabel.click()
    await nextTick()
    expect(store.settings.autoCheck).toBe(true)
    expect(setSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ autoCheck: true, checkInterval: 0, checkScope: 'all', retryCount: 1, concurrency: 3 }),
    )
  })

  it('renders the backup group with retention hint and empty state', async () => {
    await mountModal()
    await openTab('settings-tab-storage')
    const text = document.body.textContent || ''
    expect(text).toContain('本地备份')
    expect(text).toContain('最近 10 份')
    expect(text).toContain('暂无备份')
    expect(listBackupsMock).toHaveBeenCalled()
  })

  it('lists backups with file name and size', async () => {
    listBackupsMock.mockResolvedValue([
      backupInfo('backup-20260102-030405.json', 2048),
      backupInfo('backup-20260101-000000.json', 512),
    ])
    await mountModal()
    await openTab('settings-tab-storage')
    const text = document.body.textContent || ''
    expect(text).toContain('backup-20260102-030405.json')
    expect(text).toContain('backup-20260101-000000.json')
    expect(text).toContain('2 KB')
    expect(text).toContain('512 B')
    expect(document.body.querySelectorAll('[data-testid="backup-row"]')).toHaveLength(2)
  })

  it('does not restore until the warning dialog is confirmed', async () => {
    const target = backupInfo('backup-20260101-000000.json')
    listBackupsMock.mockResolvedValue([target])
    const store = useAppStore()
    store.data = seedData(['a'])
    await mountModal()
    await openTab('settings-tab-storage')
    const restoreBtn = document.body.querySelector('[aria-label="恢复备份 backup-20260101-000000.json"]') as HTMLElement
    restoreBtn.click()
    await nextTick()
    expect(restoreBackupMock).not.toHaveBeenCalled()
    const negative = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.includes('取消')) as HTMLElement
    negative.click()
    await nextTick()
    expect(restoreBackupMock).not.toHaveBeenCalled()
    expect(store.data.sites.map(s => s.id)).toEqual(['a'])
  })

  it('replaces store data and refreshes the list after a successful restore', async () => {
    const target = backupInfo('backup-20260101-000000.json')
    listBackupsMock.mockResolvedValue([target])
    restoreBackupMock.mockResolvedValue(seedData(['restored']))
    const store = useAppStore()
    store.data = seedData(['a'])
    await mountModal()
    await openTab('settings-tab-storage')
    ;(document.body.querySelector('[aria-label="恢复备份 backup-20260101-000000.json"]') as HTMLElement).click()
    await nextTick()
    const positive = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.trim() === '恢复') as HTMLElement
    positive.click()
    await nextTick()
    await nextTick()
    expect(restoreBackupMock).toHaveBeenCalledWith(target.path)
    expect(store.data.sites.map(s => s.id)).toEqual(['restored'])
    expect(document.body.textContent).toContain('已恢复备份：backup-20260101-000000.json')
    expect(listBackupsMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps current data and shows an error when restore fails', async () => {
    const target = backupInfo('backup-20260101-000000.json')
    listBackupsMock.mockResolvedValue([target])
    restoreBackupMock.mockRejectedValue(new Error('boom'))
    const store = useAppStore()
    store.data = seedData(['a'])
    await mountModal()
    await openTab('settings-tab-storage')
    ;(document.body.querySelector('[aria-label="恢复备份 backup-20260101-000000.json"]') as HTMLElement).click()
    await nextTick()
    const positive = Array.from(document.body.querySelectorAll('.n-dialog button'))
      .find(el => el.textContent?.trim() === '恢复') as HTMLElement
    positive.click()
    await nextTick()
    await nextTick()
    expect(store.data.sites.map(s => s.id)).toEqual(['a'])
    expect(document.body.textContent).toContain('恢复失败')
  })

  it('creates a manual backup and reloads the list', async () => {
    await mountModal()
    await openTab('settings-tab-storage')
    ;(document.body.querySelector('[data-testid="btn-create-backup"]') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(createBackupMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('已创建备份')
    expect(listBackupsMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
