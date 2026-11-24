// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAppStore } from '../store/app'
import AddEditModal from './AddEditModal.vue'
import { mount, flushPromises } from '@vue/test-utils'

const { fetchSiteTitleMock, fetchFaviconMock, saveDataMock } = vi.hoisted(() => ({
  fetchSiteTitleMock: vi.fn(),
  fetchFaviconMock: vi.fn(),
  saveDataMock: vi.fn(),
}))
vi.mock('../api', () => ({
  fetchSiteTitle: fetchSiteTitleMock,
  fetchFavicon: fetchFaviconMock,
  saveData: saveDataMock,
}))

// n-modal teleports into document.body, so modal content renders in document.body
// Query body directly instead of wrapper
describe('AddEditModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
    fetchSiteTitleMock.mockReset().mockResolvedValue('Fetched Title')
    fetchFaviconMock.mockReset().mockResolvedValue({ faviconPath: 'C:/data/favicons/abc.png' })
    saveDataMock.mockReset().mockResolvedValue(undefined)
  })

  // Helper: get text inputs (those without explicit type="text" attr, just plain <input>)
  function textInputs(): HTMLInputElement[] {
    return Array.from(document.body.querySelectorAll('input')).filter(
      el => el.type === 'text'
    ) as HTMLInputElement[]
  }
  function saveBtn(): HTMLElement {
    return document.body.querySelector('[data-testid="btn-save"]') as HTMLElement
  }

  it('shows validation error for empty name', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const btn = saveBtn()
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('请填写名称')
  })

  it('shows validation error for bad URL', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'not-a-url'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = saveBtn()
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('链接格式')
  })

  it('shows validation error for note over 200 chars', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = '好'.repeat(201)
    textarea.dispatchEvent(new Event('input'))
    await nextTick()
    const btn = saveBtn()
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('备注不能超过 200 字')
  })

  it('shows char count for note', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Hello'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()
    expect(document.body.querySelector('.char-count')?.textContent).toBe('5/200')
  })

  it('shows error for duplicate URL on new site', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'Existing', url: 'https://exists.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' }],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'New Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://exists.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = saveBtn()
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('链接已存在')
  })

  it('shows error for duplicate URL on edit', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [
        { id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
        { id: '2', name: 'B', url: 'https://b.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' },
      ],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal, { props: { editing: store.data.sites[1] } })
    await nextTick()
    const inputs = textInputs()
    ;(inputs[1] as HTMLInputElement).value = 'https://a.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    const btn = saveBtn()
    btn.click()
    await nextTick()
    expect(document.body.textContent).toContain('该链接已存在')
  })

  it('shows fetch title button', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    expect(document.body.textContent).toContain('获取名称')
  })

  it('shows edit mode title when editing', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'Edit Me', url: 'https://edit.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '' }],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal, { props: { editing: store.data.sites[0] } })
    await nextTick()
    expect(document.body.textContent).toContain('编辑网站')
    const nameInput = textInputs()[0]
    expect(nameInput.value).toBe('Edit Me')
  })

  it('renders form controls with naive-ui components and no legacy buttons', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    // 主要输入为 Naive 控件
    expect(document.body.querySelector('.n-input')).not.toBeNull()
    expect(document.body.querySelector('[data-testid="input-url"]')?.classList.contains('n-input')).toBe(true)
    expect(document.body.querySelector('textarea')).not.toBeNull()
    // 分类选择为 Naive 控件
    expect(document.body.querySelector('.n-select')).not.toBeNull()
    expect(document.body.querySelector('select')).toBeNull()
    // 保存 / 取消按钮为 Naive 按钮
    const save = saveBtn()
    expect(save.classList.contains('n-button')).toBe(true)
    const cancel = Array.from(document.body.querySelectorAll('.n-button'))
      .find(el => el.textContent?.trim() === '取消') as HTMLElement | undefined
    expect(cancel).toBeDefined()
    expect(cancel?.classList.contains('n-button')).toBe(true)
    const fetchBtn = document.body.querySelector('[data-testid="btn-fetch-title"]') as HTMLElement
    expect(fetchBtn.classList.contains('n-button')).toBe(true)
  })

  it('shows a fetch favicon button next to fetch title', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const btn = document.body.querySelector('[data-testid="btn-fetch-favicon"]') as HTMLElement
    expect(btn).not.toBeNull()
    expect(btn.classList.contains('n-button')).toBe(true)
    expect(btn.textContent).toContain('获取图标')
  })

  it('fetching favicon updates the saved site faviconPath', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    ;(document.body.querySelector('[data-testid="btn-fetch-favicon"]') as HTMLElement).click()
    await flushPromises()
    expect(fetchFaviconMock).toHaveBeenCalledWith('https://test.dev')
    saveBtn().click()
    await nextTick()
    expect(store.data.sites).toHaveLength(1)
    expect(store.data.sites[0].faviconPath).toBe('C:/data/favicons/abc.png')
  })

  it('keeps faviconPath when editing an existing site', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'A', url: 'https://a.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '', faviconPath: 'C:/data/favicons/old.png' }],
      recycleBin: [],
      tags: [],
    }
    mount(AddEditModal, { props: { editing: store.data.sites[0] } })
    await nextTick()
    fetchFaviconMock.mockResolvedValue({ faviconPath: 'C:/data/favicons/new.png' })
    ;(document.body.querySelector('[data-testid="btn-fetch-favicon"]') as HTMLElement).click()
    await flushPromises()
    saveBtn().click()
    await nextTick()
    expect(store.data.sites[0].faviconPath).toBe('C:/data/favicons/new.png')
  })

  it('favicon failure is silent and does not block saving', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    fetchFaviconMock.mockRejectedValue(new Error('offline'))
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    ;(document.body.querySelector('[data-testid="btn-fetch-favicon"]') as HTMLElement).click()
    await flushPromises()
    saveBtn().click()
    await flushPromises()
    expect(store.data.sites).toHaveLength(1)
    expect(store.data.sites[0].faviconPath ?? null).toBeNull()
  })

  it('auto-fetches favicon on url blur only when the setting is enabled', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    store.settings.autoFetchFavicon = false
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[1].dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(fetchFaviconMock).not.toHaveBeenCalled()

    store.settings.autoFetchFavicon = true
    inputs[1].dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(fetchFaviconMock).toHaveBeenCalledWith('https://test.dev')
  })

  it('save awaits a favicon fetch started by blur before persisting', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    store.settings.autoFetchFavicon = true
    let resolveFetch!: (value: { faviconPath: string } | null) => void
    fetchFaviconMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[1].dispatchEvent(new Event('blur'))
    await nextTick()
    expect(fetchFaviconMock).toHaveBeenCalledWith('https://test.dev')

    saveBtn().click()
    await nextTick()
    expect(store.data.sites).toHaveLength(0)

    resolveFetch({ faviconPath: 'C:/data/favicons/late.png' })
    await flushPromises()
    expect(store.data.sites).toHaveLength(1)
    expect(store.data.sites[0].faviconPath).toBe('C:/data/favicons/late.png')
  })

  it('fetches the favicon before saving when none exists and auto-fetch is on', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    store.settings.autoFetchFavicon = true
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://test.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    expect(fetchFaviconMock).not.toHaveBeenCalled()

    saveBtn().click()
    await flushPromises()
    expect(fetchFaviconMock).toHaveBeenCalledWith('https://test.dev')
    expect(store.data.sites).toHaveLength(1)
    expect(store.data.sites[0].faviconPath).toBe('C:/data/favicons/abc.png')
  })

  it('drops the old faviconPath when the URL changes and fetching fails', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'A', url: 'https://old.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '', faviconPath: 'C:/data/favicons/old.png' }],
      recycleBin: [],
      tags: [],
    }
    store.settings.autoFetchFavicon = true
    fetchFaviconMock.mockResolvedValue(null)
    mount(AddEditModal, { props: { editing: store.data.sites[0] } })
    await nextTick()
    const inputs = textInputs()
    ;(inputs[1] as HTMLInputElement).value = 'https://new.dev'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[1].dispatchEvent(new Event('blur'))
    await flushPromises()
    saveBtn().click()
    await flushPromises()
    expect(store.data.sites[0].faviconPath ?? null).toBeNull()
  })

  it('clears a favicon bound to a different URL when saving without blur', async () => {
    const store = useAppStore()
    store.data = {
      version: 1,
      categories: [],
      sites: [{ id: '1', name: 'A', url: 'https://old.dev', categoryId: null, tags: [], status: 'ok', lastCheck: null, note: '', faviconPath: 'C:/data/favicons/old.png' }],
      recycleBin: [],
      tags: [],
    }
    store.settings.autoFetchFavicon = false
    mount(AddEditModal, { props: { editing: store.data.sites[0] } })
    await nextTick()
    const inputs = textInputs()
    ;(inputs[1] as HTMLInputElement).value = 'https://new.dev'
    inputs[1].dispatchEvent(new Event('input'))
    await nextTick()
    saveBtn().click()
    await flushPromises()
    expect(fetchFaviconMock).not.toHaveBeenCalled()
    expect(store.data.sites[0].faviconPath ?? null).toBeNull()
  })

  it('ignores a late fetch result for a URL the user has already left', async () => {
    const store = useAppStore()
    store.data = { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
    store.settings.autoFetchFavicon = true
    let resolveA!: (value: { faviconPath: string }) => void
    let resolveB!: (value: { faviconPath: string }) => void
    fetchFaviconMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveA = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveB = resolve }))
      .mockRejectedValue(new Error('offline'))
    mount(AddEditModal)
    await nextTick()
    const inputs = textInputs()
    ;(inputs[0] as HTMLInputElement).value = 'Test Site'
    inputs[0].dispatchEvent(new Event('input'))
    ;(inputs[1] as HTMLInputElement).value = 'https://a.dev'
    inputs[1].dispatchEvent(new Event('input'))
    ;(document.body.querySelector('[data-testid="btn-fetch-favicon"]') as HTMLElement).click()
    await nextTick()

    // 使用者离开 a.dev，失焦触发针对 b.dev 的抓取
    ;(inputs[1] as HTMLInputElement).value = 'https://b.dev'
    inputs[1].dispatchEvent(new Event('input'))
    inputs[1].dispatchEvent(new Event('blur'))
    await nextTick()

    // b.dev 先回来并应用，a.dev 迟到的结果不应覆盖
    resolveB({ faviconPath: 'C:/data/favicons/b.png' })
    await flushPromises()
    resolveA({ faviconPath: 'C:/data/favicons/a.png' })
    await flushPromises()

    saveBtn().click()
    await flushPromises()
    expect(store.data.sites).toHaveLength(1)
    expect(store.data.sites[0].faviconPath).toBe('C:/data/favicons/b.png')
  })
})
