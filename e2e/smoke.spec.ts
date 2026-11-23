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
  await expect(page.getByText('还没有网站')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toContainText('共 0 个')
})

test('app shows title bar and top bar', async ({ page }) => {
  await expect(page.getByText('归集').last()).toBeVisible()
  await expect(page.locator('[data-testid="btn-add"]')).toBeVisible()
  await expect(page.locator('[data-testid="btn-check-all"]')).toBeVisible()
})

test('sidebar shows default views', async ({ page }) => {
  const sidebar = page.getByRole('complementary')
  await expect(sidebar).toContainText('全部')
  await expect(sidebar).toContainText('失效')
  await expect(sidebar).toContainText('回收站')
  await expect(sidebar).toContainText('分类')
  await expect(sidebar).toContainText('标签')
})

test('add site via modal', async ({ page }) => {
  await page.click('[data-testid="btn-add"]')
  await expect(page.locator('[data-testid="modal-add-edit"]')).toBeVisible()

  // Inputs don't have explicit type="text", use nth() on all visible inputs
  const modalInputs = page.locator('[data-testid="modal-add-edit"] input')
  await modalInputs.nth(0).fill('React')
  await modalInputs.nth(1).fill('https://react.dev')

  await page.locator('[data-testid="modal-add-edit"]').getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('[data-testid="modal-add-edit"]')).toBeHidden()

  // Site should appear in table
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).toContainText('https://react.dev')
  await expect(page.getByRole('contentinfo')).toContainText('共 1 个')
})

test('search filters sites', async ({ page }) => {
  // Add two sites
  for (const [name, url] of [['React', 'https://react.dev'], ['Vue', 'https://vuejs.org']]) {
    await page.click('[data-testid="btn-add"]')
    await page.waitForSelector('[data-testid="modal-add-edit"]')
    const inputs = page.locator('[data-testid="modal-add-edit"] input')
    await inputs.nth(0).fill(name)
    await inputs.nth(1).fill(url)
    await page.locator('[data-testid="modal-add-edit"]').getByRole('button', { name: '保存', exact: true }).click()
    await page.waitForSelector('[data-testid="modal-add-edit"]', { state: 'hidden' })
  }

  // Search
  await page.fill('[data-testid="search-input"] input', 'React')
  await page.waitForTimeout(400)
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).not.toContainText('Vue')
})

test('navigate to recycle bin (empty)', async ({ page }) => {
  await page.getByRole('complementary').getByText('回收站').last().click()
  await expect(page.getByText('回收站为空')).toBeVisible()
})

test('providers are abstract and body stays transparent', async ({ page }) => {
  // provider 必须是 abstract，否则会多一层包裹元素，破坏 height:100% 链
  await expect(page.locator('#app > *')).toBeVisible()

  // 不得使用 n-global-style：它会把 body 背景写成不透明色，破坏透明窗口
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bodyBg).toBe('rgba(0, 0, 0, 0)')
})

test('prefers-reduced-motion collapses transitions', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await mockInvoke(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // main.css 的 @media (prefers-reduced-motion: reduce) 把 transition-duration 压到 .001ms
  const duration = await page.getByRole('complementary').locator('div').filter({ hasText: '全部' }).last().evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(parseFloat(duration) * 1000).toBeLessThanOrEqual(0.001)
  await context.close()
})
