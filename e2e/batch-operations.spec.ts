/**
 * Batch operations & settings E2E: multi-select, drag-drop, settings modal
 */
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    const sites: any[] = [
      { id: 's1', name: 'Site A', url: 'https://a.dev', categoryId: 'cat-dev', tags: [], status: 'ok', lastCheck: null, note: '' },
      { id: 's2', name: 'Site B', url: 'https://b.dev', categoryId: 'cat-dev', tags: [], status: 'ok', lastCheck: null, note: '' },
      { id: 's3', name: 'Site C', url: 'https://c.dev', categoryId: 'cat-dev', tags: [], status: 'unknown', lastCheck: null, note: '' },
    ]
    const categories: any[] = [
      { id: 'cat-dev', name: '开发', children: [] },
      { id: 'cat-target', name: '目标分类', children: [] },
    ]
    const recycleBin: any[] = []

    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        switch (cmd) {
          case 'load_data':
            return { version: 1, categories, sites, recycleBin, tags: [] }
          case 'save_data': return undefined
          case 'check_connectivity': return true
          case 'check_site': return { status: 'ok', usedUrl: args.url }
          case 'verify_site_webview': return { status: 'ok', usedUrl: args.url }
          case 'get_settings': return { theme: 'system', zoom: 100, sidebarCollapsed: [], collapsedCategories: [] }
          case 'set_settings': return undefined
          case 'get_data_location': return { dir: '/tmp', isFallback: false }
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

test('select all with Ctrl+A', async ({ page }) => {
  // Select all with Ctrl+A
  await page.keyboard.press('Control+a')
  await expect(page.locator('.batchbar')).toContainText('已选 3 项')
})

test('select individual site', async ({ page }) => {
  const cbs = page.locator('.site-table tbody .cb')
  await cbs.first().click()
  await expect(page.locator('.batchbar')).toContainText('已选 1 项')
})

test('batch delete selected sites', async ({ page }) => {
  // Select all
  await page.keyboard.press('Control+a')
  await expect(page.locator('.batchbar')).toContainText('已选 3 项')

  // Click delete
  await page.click('.batchbar button:has-text("删除所选")')
  await expect(page.locator('.statusbar')).toContainText('共 0 个')

  // Verify in recycle bin
  await page.click('.sidebar .row:has-text("回收站")')
  await expect(page.locator('.site-table')).toContainText('Site A')
  await expect(page.locator('.site-table')).toContainText('Site B')
})

test('batch bar shows check button for selected sites', async ({ page }) => {
  await page.keyboard.press('Control+a')
  await expect(page.locator('.batchbar')).toContainText('已选 3 项')
  // Verify check/move/tag/delete buttons present
  await expect(page.locator('.batchbar button:has-text("检测所选")')).toBeVisible()
  await expect(page.locator('.batchbar button:has-text("移动分类")')).toBeVisible()
  await expect(page.locator('.batchbar button:has-text("删除所选")')).toBeVisible()
})

test('move category via batch pick', async ({ page }) => {
  // Select first site
  await page.locator('.site-table tbody .cb').first().click()
  await page.click('.batchbar button:has-text("移动分类")')

  // Pick category modal appears
  await expect(page.locator('.modal')).toBeVisible()

  // Select "目标分类" from dropdown
  await page.selectOption('.modal select', { label: '目标分类' })
  await page.click('.modal button:has-text("移动")')

  // Verify site moved (check category column)
  await page.waitForTimeout(200)
  await expect(page.locator('.site-table tbody tr').first()).toContainText('目标分类')
})

test('settings modal opens and closes', async ({ page }) => {
  await page.click('.topbar button:has-text("⚙")')
  await expect(page.locator('.modal')).toBeVisible()
  await expect(page.locator('.modal')).toContainText('设置')

  // Close via Escape
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal')).toBeHidden()
})

test('import/export modal shows all formats', async ({ page }) => {
  await page.click('.topbar button:has-text("导入/导出")')
  await expect(page.locator('.modal')).toBeVisible()

  await expect(page.locator('.modal')).toContainText('导出 MD')
  await expect(page.locator('.modal')).toContainText('导出 JSON')
  await expect(page.locator('.modal')).toContainText('导出 HTML')
  await expect(page.locator('.modal')).toContainText('导入 MD')
  await expect(page.locator('.modal')).toContainText('导入 HTML')

  // Toggle merge/overwrite
  await expect(page.locator('.segctrl')).toContainText('合并导入')
  await expect(page.locator('.segctrl')).toContainText('覆盖导入')
})

test('clear selection with Escape', async ({ page }) => {
  await page.keyboard.press('Control+a')
  await expect(page.locator('.batchbar')).toContainText('已选 3 项')

  await page.keyboard.press('Escape')
  await expect(page.locator('.batchbar')).toBeHidden()
})

test('add category via sidebar all-row context menu', async ({ page }) => {
  // Right-click "全部" row — opens AddCategoryModal directly (not a ctx menu)
  await page.click('.sidebar .row:has-text("全部")', { button: 'right' })

  // AddCategoryModal appears (h3 = "新建分类")
  await page.waitForSelector('.modal')

  // Fill in category name (input has no type attr)
  await page.locator('.modal input').fill('新分类')
  await page.click('.modal button:has-text("创建")')
  await page.waitForFunction(() => !document.querySelector('.modal'))

  // Verify new category appears in sidebar
  await expect(page.locator('.sidebar')).toContainText('新分类')
})
