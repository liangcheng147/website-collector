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

// 侧栏行是 div（无 role），用文本定位；.last() 取最深层、带点击处理器的行元素
function sidebarRow(page: Page, text: string) {
  return page.getByRole('complementary').getByText(text).last()
}

test('all view shows all sites', async ({ page }) => {
  await sidebarRow(page, '全部').click()
  const rows = page.getByRole('table').locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('contentinfo')).toContainText('共 3 个')
})

test('navigate to category filters sites', async ({ page }) => {
  // Click "开发" category in sidebar
  await sidebarRow(page, '开发').click()
  // Should show React + Spring (both under cat-dev subtree)
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).toContainText('Spring')
  await expect(page.getByRole('table')).not.toContainText('VS Code')
})

test('navigate to sub-category', async ({ page }) => {
  // Expand "开发" if collapsed, then click "前端"
  await sidebarRow(page, '前端').click()
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).not.toContainText('Spring')
})

test('filter by tag', async ({ page }) => {
  // Select "框架" tag from dropdown
  await page.click('[data-testid="tag-filter"]')
  await page.locator('[data-testid="tag-filter-menu"]').getByText('框架', { exact: true }).first().click()
  await page.waitForTimeout(200)
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).toContainText('Spring')
  await expect(page.getByRole('table')).not.toContainText('VS Code')
})

test('dead view shows only dead sites', async ({ page }) => {
  await sidebarRow(page, '失效').click()
  await expect(page.getByRole('table')).toContainText('VS Code')
  await expect(page.getByRole('table')).not.toContainText('React')
})

test('status bar shows dead count', async ({ page }) => {
  await expect(page.getByRole('contentinfo')).toContainText('失效 1')
  await expect(page.getByRole('contentinfo')).toContainText('共 3 个')
})

test('switch between views preserves state', async ({ page }) => {
  await sidebarRow(page, '开发').click()
  await expect(page.getByRole('table')).toContainText('React')

  await sidebarRow(page, '工具').click()
  await expect(page.getByRole('table')).toContainText('VS Code')

  await sidebarRow(page, '全部').click()
  await expect(page.getByRole('table')).toContainText('React')
  await expect(page.getByRole('table')).toContainText('Spring')
  await expect(page.getByRole('table')).toContainText('VS Code')
})

test('collapse and expand sidebar groups', async ({ page }) => {
  const groupLabel = page.getByRole('complementary').getByText('分类', { exact: true })
  // Initially categories visible
  await expect(sidebarRow(page, '全部')).toBeVisible()

  // Collapse 分类 group
  await groupLabel.click()
  await expect(sidebarRow(page, '全部')).toBeHidden()

  // Expand again
  await groupLabel.click()
  await expect(sidebarRow(page, '全部')).toBeVisible()
})
