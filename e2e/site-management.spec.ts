/**
 * Site management E2E: add, edit, delete, recycle bin
 */
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    const sites: any[] = []
    const categories: any[] = [
      { id: 'cat-dev', name: '开发', children: [
        { id: 'cat-fe', name: '前端', children: [] },
      ]},
    ]
    const recycleBin: any[] = []
    let nextId = 1
    function genId() { return 's' + (nextId++) }

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
          case 'get_data_location': return { dir: '/tmp/test-data', isFallback: false }
          case 'fetch_site_title': return 'test-site'
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

async function addSite(page: Page, name: string, url: string) {
  await page.click('button:has-text("＋ 添加")')
  await page.waitForSelector('.modal')
  const inputs = page.locator('.modal input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(url)
  await page.click('.modal button:has-text("保存")')
  await page.waitForFunction(() => !document.querySelector('.modal'))
}

test.beforeEach(async ({ page }) => {
  await mockInvoke(page)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test('add multiple sites and verify count', async ({ page }) => {
  await addSite(page, 'React', 'https://react.dev')
  await addSite(page, 'Vue', 'https://vuejs.org')
  await addSite(page, 'Angular', 'https://angular.dev')

  await expect(page.locator('.statusbar')).toContainText('共 3 个')
  const rows = page.locator('.site-table tbody tr')
  await expect(rows).toHaveCount(3)
})

test('delete site moves to recycle bin', async ({ page }) => {
  await addSite(page, 'ToDelete', 'https://delete.dev')
  await expect(page.locator('.statusbar')).toContainText('共 1 个')

  // Right-click to open context menu (class is "ctx" not "context-menu")
  await page.click('.site-table tbody tr', { button: 'right' })
  await page.waitForSelector('.ctx')
  await page.click('.ctx button:has-text("删除")')

  await expect(page.locator('.statusbar')).toContainText('共 0 个')

  // Check recycle bin
  await page.click('.sidebar .row:has-text("回收站")')
  await expect(page.locator('.site-table')).toContainText('ToDelete')
})

test('restore from recycle bin', async ({ page }) => {
  await addSite(page, 'RestoreMe', 'https://restore.dev')

  // Delete
  await page.click('.site-table tbody tr', { button: 'right' })
  await page.waitForSelector('.ctx')
  await page.click('.ctx button:has-text("删除")')

  // Go to recycle bin
  await page.click('.sidebar .row:has-text("回收站")')
  await expect(page.locator('.site-table')).toContainText('RestoreMe')

  // Restore
  await page.click('button:has-text("恢复")')
  await expect(page.locator('.empty-state')).toContainText('回收站为空')

  // Back to main view
  await page.click('.sidebar .row:has-text("全部")')
  await expect(page.locator('.site-table')).toContainText('RestoreMe')
})

test('permanent delete from recycle bin', async ({ page }) => {
  await addSite(page, 'PermaDelete', 'https://permadelete.dev')

  // Delete
  await page.click('.site-table tbody tr', { button: 'right' })
  await page.waitForSelector('.ctx')
  await page.click('.ctx button:has-text("删除")')

  // Go to recycle bin
  await page.click('.sidebar .row:has-text("回收站")')

  // Permanent delete
  await page.click('button:has-text("彻底删除")')
  await expect(page.locator('.empty-state')).toContainText('回收站为空')
})

test('edit site via context menu', async ({ page }) => {
  await addSite(page, 'Original', 'https://original.dev')
  await expect(page.locator('.site-table')).toContainText('Original')

  // Right-click → 编辑
  await page.click('.site-table tbody tr', { button: 'right' })
  await page.waitForSelector('.ctx')
  await page.click('.ctx button:has-text("编辑")')

  await page.waitForSelector('.modal')
  await expect(page.locator('.modal h3')).toContainText('编辑网站')

  // Change name
  await page.locator('.modal input').first().fill('Edited')
  await page.click('.modal button:has-text("保存")')
  await page.waitForFunction(() => !document.querySelector('.modal'))

  await expect(page.locator('.site-table')).toContainText('Edited')
  await expect(page.locator('.site-table')).not.toContainText('Original')
})

test('check all updates status', async ({ page }) => {
  await addSite(page, 'A', 'https://a.dev')
  await addSite(page, 'B', 'https://b.dev')

  await page.click('button:has-text("■ 检测全部")')
  // Mock resolves instantly, so wait for check to complete
  await page.waitForTimeout(1000)
  // After check, status bar should show "上次检测" (not "—")
  await expect(page.locator('.statusbar')).toContainText('上次检测')
  // Check button should be back to "检测全部"
  await expect(page.locator('button:has-text("■ 检测全部")')).toBeVisible()
})

test('filter by dead sites', async ({ page }) => {
  await addSite(page, 'Alive', 'https://alive.dev')

  // Navigate to dead view
  await page.click('.sidebar .row:has-text("失效")')
  // Since mock returns 'ok', no dead sites
  await expect(page.locator('.empty-state')).toBeVisible()
})
