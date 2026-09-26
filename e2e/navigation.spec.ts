/**
 * Navigation E2E: categories, tags, sidebar interactions
 */
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    const sites: any[] = [
      { id: 's1', name: 'React', url: 'https://react.dev', categoryId: 'cat-fe', tags: ['框架'], status: 'ok', lastCheck: '2026-09-01', note: '' },
      { id: 's2', name: 'Spring', url: 'https://spring.io', categoryId: 'cat-be', tags: ['框架', '后端'], status: 'ok', lastCheck: '2026-09-02', note: '' },
      { id: 's3', name: 'VS Code', url: 'https://code.visualstudio.com', categoryId: 'cat-tools', tags: ['编辑器'], status: 'dead', lastCheck: '2026-08-01', note: '' },
    ]
    const categories: any[] = [
      { id: 'cat-dev', name: '开发', children: [
        { id: 'cat-fe', name: '前端', children: [] },
        { id: 'cat-be', name: '后端', children: [] },
      ]},
      { id: 'cat-tools', name: '工具', children: [] },
    ]
    const recycleBin: any[] = []

    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        switch (cmd) {
          case 'load_data':
            return { version: 1, categories, sites, recycleBin, tags: [...new Set(sites.flatMap((s: any) => s.tags))] }
          case 'save_data': return undefined
          case 'check_connectivity': return true
          case 'check_site': return { status: 'ok', usedUrl: args.url }
          case 'verify_site_webview': return { status: 'ok', usedUrl: args.url }
          case 'get_settings': return { theme: 'system', zoom: 100, sidebarCollapsed: [], collapsedCategories: [] }
          case 'set_settings': return undefined
          get_data_location: return { dir: '/tmp', isFallback: false }
          case 'fetch_site_title': try { return new URL(args.url).hostname } catch { return args.url }
          case 'export_md_to_file':
          case 'export_json_to_file':
          case 'export_bookmarks_html_to_file': return undefined
          case 'import_md_from_file':
          case 'import_json_from_file':
          case 'import_bookmarks_html':
            return { version: 1, categories, sites, recycleBin, tags: [] }
          default: return undefined
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

test('all view shows all sites', async ({ page }) => {
  await page.click('.sidebar .row:has-text("全部")')
  const rows = page.locator('.site-table tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('.statusbar')).toContainText('共 3 个')
})

test('navigate to category filters sites', async ({ page }) => {
  // Click "开发" category in sidebar
  await page.click('.sidebar .row:has-text("开发")')
  // Should show React + Spring (both under cat-dev subtree)
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).toContainText('Spring')
  await expect(page.locator('.site-table')).not.toContainText('VS Code')
})

test('navigate to sub-category', async ({ page }) => {
  // Expand "开发" if collapsed, then click "前端"
  await page.click('.sidebar .row:has-text("前端")')
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).not.toContainText('Spring')
})

test('filter by tag', async ({ page }) => {
  // Select "框架" tag from dropdown
  await page.selectOption('.topbar select', '框架')
  await page.waitForTimeout(200)
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).toContainText('Spring')
  await expect(page.locator('.site-table')).not.toContainText('VS Code')
})

test('dead view shows only dead sites', async ({ page }) => {
  await page.click('.sidebar .row:has-text("失效")')
  await expect(page.locator('.site-table')).toContainText('VS Code')
  await expect(page.locator('.site-table')).not.toContainText('React')
})

test('status bar shows dead count', async ({ page }) => {
  await expect(page.locator('.statusbar')).toContainText('失效 1')
  await expect(page.locator('.statusbar')).toContainText('共 3 个')
})

test('switch between views preserves state', async ({ page }) => {
  await page.click('.sidebar .row:has-text("开发")')
  await expect(page.locator('.site-table')).toContainText('React')

  await page.click('.sidebar .row:has-text("工具")')
  await expect(page.locator('.site-table')).toContainText('VS Code')

  await page.click('.sidebar .row:has-text("全部")')
  await expect(page.locator('.site-table')).toContainText('React')
  await expect(page.locator('.site-table')).toContainText('Spring')
  await expect(page.locator('.site-table')).toContainText('VS Code')
})

test('collapse and expand sidebar groups', async ({ page }) => {
  // Initially categories visible
  await expect(page.locator('.sidebar .row:has-text("全部")')).toBeVisible()

  // Collapse 分类 group
  await page.click('.sidebar .group-label:has-text("分类")')
  await expect(page.locator('.sidebar .row:has-text("全部")')).toBeHidden()

  // Expand again
  await page.click('.sidebar .group-label:has-text("分类")')
  await expect(page.locator('.sidebar .row:has-text("全部")')).toBeVisible()
})
