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

function sidebarRow(page: Page, text: string) {
  return page.getByRole('complementary').getByText(text).last()
}

function tableRows(page: Page) {
  return page.getByRole('table').locator('tbody tr')
}

async function addSite(page: Page, name: string, url: string) {
  await page.click('[data-testid="btn-add"]')
  await page.waitForSelector('[data-testid="modal-add-edit"]')
  const inputs = page.locator('[data-testid="modal-add-edit"] input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(url)
  await page.locator('[data-testid="modal-add-edit"]').getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="modal-add-edit"]'))
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

  await expect(page.getByRole('contentinfo')).toContainText('共 3 个')
  await expect(tableRows(page)).toHaveCount(3)
})

test('delete site moves to recycle bin', async ({ page }) => {
  await addSite(page, 'ToDelete', 'https://delete.dev')
  await expect(page.getByRole('contentinfo')).toContainText('共 1 个')

  // Right-click to open context menu (Naive dropdown)
  await tableRows(page).first().click({ button: 'right' })
  const deleteOption = page.locator('.n-dropdown-option').filter({ hasText: '删除' })
  await expect(deleteOption).toBeVisible()
  await deleteOption.click()

  await expect(page.getByRole('contentinfo')).toContainText('共 0 个')

  // Check recycle bin
  await sidebarRow(page, '回收站').click()
  await expect(page.getByRole('table')).toContainText('ToDelete')
})

test('restore from recycle bin', async ({ page }) => {
  await addSite(page, 'RestoreMe', 'https://restore.dev')

  // Delete
  await tableRows(page).first().click({ button: 'right' })
  const deleteOption = page.locator('.n-dropdown-option').filter({ hasText: '删除' })
  await expect(deleteOption).toBeVisible()
  await deleteOption.click()

  // Go to recycle bin
  await sidebarRow(page, '回收站').click()
  await expect(page.getByRole('table')).toContainText('RestoreMe')

  // Restore
  await page.getByRole('button', { name: '恢复', exact: true }).first().click()
  await expect(page.getByText('回收站为空')).toBeVisible()

  // Back to main view
  await sidebarRow(page, '全部').click()
  await expect(page.getByRole('table')).toContainText('RestoreMe')
})

test('permanent delete from recycle bin', async ({ page }) => {
  await addSite(page, 'PermaDelete', 'https://permadelete.dev')

  // Delete
  await tableRows(page).first().click({ button: 'right' })
  const deleteOption = page.locator('.n-dropdown-option').filter({ hasText: '删除' })
  await expect(deleteOption).toBeVisible()
  await deleteOption.click()

  // Go to recycle bin
  await sidebarRow(page, '回收站').click()

  // Permanent delete
  await page.getByRole('button', { name: '彻底删除', exact: true }).first().click()
  await expect(page.getByText('回收站为空')).toBeVisible()
})

test('edit site via context menu', async ({ page }) => {
  await addSite(page, 'Original', 'https://original.dev')
  await expect(page.getByRole('table')).toContainText('Original')

  // Right-click → 编辑
  await tableRows(page).first().click({ button: 'right' })
  const editOption = page.locator('.n-dropdown-option').filter({ hasText: '编辑' })
  await expect(editOption).toBeVisible()
  await editOption.click()

  await page.waitForSelector('[data-testid="modal-add-edit"]')
  await expect(page.locator('[data-testid="modal-add-edit"]')).toContainText('编辑网站')

  // Change name
  await page.locator('[data-testid="modal-add-edit"] input').first().fill('Edited')
  await page.locator('[data-testid="modal-add-edit"]').getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="modal-add-edit"]'))

  await expect(page.getByRole('table')).toContainText('Edited')
  await expect(page.getByRole('table')).not.toContainText('Original')
})

test('check all updates status', async ({ page }) => {
  await addSite(page, 'A', 'https://a.dev')
  await addSite(page, 'B', 'https://b.dev')

  await page.click('[data-testid="btn-check-all"]')
  // Mock resolves instantly, so wait for check to complete
  await page.waitForTimeout(1000)
  // After check, status bar should show "上次检测" (not "—")
  await expect(page.getByRole('contentinfo')).toContainText('上次检测')
  // Check button should be back to "检测全部"
  await expect(page.locator('[data-testid="btn-check-all"]')).toBeVisible()
})

test('filter by dead sites', async ({ page }) => {
  await addSite(page, 'Alive', 'https://alive.dev')

  // Navigate to dead view
  await sidebarRow(page, '失效').click()
  // Since mock returns 'ok', no dead sites
  await expect(page.getByText('当前筛选没有结果')).toBeVisible()
})
