/**
 * Global mock for Tauri invoke — runs before app scripts via addInitScript.
 * Returns a functional in-memory dataset so E2E tests can exercise UI flows
 * without the Rust backend.
 */
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    // Build a mock invoke that mimics the Rust backend
    const sites: any[] = []
    const categories: any[] = [
      { id: 'cat-dev', name: '开发', children: [
        { id: 'cat-fe', name: '前端', children: [] },
        { id: 'cat-be', name: '后端', children: [] },
      ]},
      { id: 'cat-tools', name: '工具', children: [] },
    ]
    const recycleBin: any[] = []
    let nextId = 1

    function genId() { return 's' + (nextId++) + '_' + Date.now().toString(36) }
    function findAllCats(list: any[]): any[] { return list.flatMap((c: any) => [c, ...findAllCats(c.children)]) }

    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        switch (cmd) {
          case 'load_data':
            return { version: 1, categories, sites, recycleBin, tags: [...new Set(sites.flatMap((s: any) => s.tags))] }
          case 'save_data':
            return undefined
          case 'check_connectivity':
            return true
          case 'check_site':
            return { status: Math.random() > 0.2 ? 'ok' : 'dead', usedUrl: args.url }
          case 'verify_site_webview':
            return { status: 'ok', usedUrl: args.url }
          case 'get_settings':
            return { theme: 'system', zoom: 100, sidebarCollapsed: [], collapsedCategories: [] }
          case 'set_settings':
            return undefined
          case 'get_data_location':
            return { dir: '/tmp/test-data', isFallback: false }
          case 'fetch_site_title':
            try { return new URL(args.url).hostname } catch { return args.url }
            return args.url
          case 'export_md_to_file':
          case 'export_json_to_file':
          case 'export_bookmarks_html_to_file':
            return undefined
          case 'import_md_from_file':
          case 'import_json_from_file':
          case 'import_bookmarks_html':
            return { version: 1, categories, sites, recycleBin, tags: [] }
          default:
            return undefined
        }
      },
    }
  })
}

test.beforeEach(async ({ page }) => {
  await mockInvoke(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test('app loads with empty state', async ({ page }) => {
  await expect(page.locator('.empty-state')).toBeVisible()
  await expect(page.locator('.empty-state')).toContainText('还没有网站')
  await expect(page.locator('.statusbar')).toContainText('共 0 个')
})

test('app shows title bar and top bar', async ({ page }) => {
  await expect(page.locator('.logo')).toContainText('归集')
  await expect(page.locator('.topbar button', { hasText: '＋ 添加' })).toBeVisible()
  await expect(page.locator('.topbar button', { hasText: '■ 检测全部' })).toBeVisible()
})

test('sidebar shows default views', async ({ page }) => {
  await expect(page.locator('.sidebar')).toContainText('全部')
  await expect(page.locator('.sidebar')).toContainText('失效')
  await expect(page.locator('.sidebar')).toContainText('回收站')
  await expect(page.locator('.sidebar')).toContainText('分类')
  await expect(page.locator('.sidebar')).toContainText('标签')
})

test('add site via modal', async ({ page }) => {
  await page.click('button:has-text("＋ 添加")')
  await expect(page.locator('.modal')).toBeVisible()

  // Inputs don't have explicit type="text", use nth() on all visible inputs
  const modalInputs = page.locator('.modal input')
  await modalInputs.nth(0).fill('React')
  await modalInputs.nth(1).fill('https://react.dev')

  await page.click('button:has-text("保存")')
  await expect(page.locator('.modal')).toBeHidden()

  // Site should appear in table
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).toContainText('https://react.dev')
  await expect(page.locator('.statusbar')).toContainText('共 1 个')
})

test('search filters sites', async ({ page }) => {
  // Add two sites
  for (const [name, url] of [['React', 'https://react.dev'], ['Vue', 'https://vuejs.org']]) {
    await page.click('button:has-text("＋ 添加")')
    await page.waitForSelector('.modal')
    const inputs = page.locator('.modal input')
    await inputs.nth(0).fill(name)
    await inputs.nth(1).fill(url)
    await page.click('.modal button:has-text("保存")')
    await page.waitForSelector('.modal', { state: 'hidden' })
  }

  // Search
  await page.fill('.search', 'React')
  await page.waitForTimeout(400)
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).not.toContainText('Vue')
})

test('navigate to recycle bin (empty)', async ({ page }) => {
  await page.click('.sidebar .row:has-text("回收站")')
  await expect(page.locator('.empty-state')).toBeVisible()
  await expect(page.locator('.empty-state')).toContainText('回收站为空')
})
