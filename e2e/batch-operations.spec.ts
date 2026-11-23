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

function sidebarRow(page: Page, text: string) {
  return page.getByRole('complementary').getByText(text).last()
}

function rowCheckboxes(page: Page) {
  return page.getByRole('table').locator('tbody').getByRole('checkbox')
}

test('select all with Ctrl+A', async ({ page }) => {
  // Select all with Ctrl+A
  await page.keyboard.press('Control+a')
  await expect(page.getByText('已选 3 项').first()).toBeVisible()
})

test('select individual site', async ({ page }) => {
  await rowCheckboxes(page).first().click()
  await expect(page.getByText('已选 1 项').first()).toBeVisible()
})

test('batch delete selected sites', async ({ page }) => {
  // Select all
  await page.keyboard.press('Control+a')
  await expect(page.getByText('已选 3 项').first()).toBeVisible()

  // Click delete
  await page.getByRole('button', { name: '删除所选', exact: true }).click()
  await expect(page.getByRole('contentinfo')).toContainText('共 0 个')

  // Verify in recycle bin
  await sidebarRow(page, '回收站').click()
  await expect(page.getByRole('table')).toContainText('Site A')
  await expect(page.getByRole('table')).toContainText('Site B')
})

test('batch bar shows check button for selected sites', async ({ page }) => {
  await page.keyboard.press('Control+a')
  await expect(page.getByText('已选 3 项').first()).toBeVisible()
  // Verify check/move/tag/delete buttons present
  await expect(page.getByRole('button', { name: '检测所选', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /移动分类/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '删除所选', exact: true })).toBeVisible()
})

test('move category via batch pick', async ({ page }) => {
  // Select first site
  await rowCheckboxes(page).first().click()
  await page.getByRole('button', { name: /移动分类/ }).click()

  // Pick category modal appears
  await expect(page.locator('[data-testid="modal-pick-category"]')).toBeVisible()

  // Select "目标分类" from the NSelect dropdown
  const pickModal = page.locator('[data-testid="modal-pick-category"]')
  await pickModal.locator('.n-base-selection').click()
  await page.locator('.n-base-select-option').filter({ hasText: '目标分类' }).click()
  await page.getByRole('button', { name: '移动', exact: true }).click()

  // Verify site moved (check category column)
  await page.waitForTimeout(200)
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText('目标分类')
})

test('settings modal opens and closes', async ({ page }) => {
  await page.click('[data-testid="btn-settings"]')
  await expect(page.locator('[data-testid="modal-settings"]')).toBeVisible()
  await expect(page.locator('[data-testid="modal-settings"]')).toContainText('设置')

  // Close via Escape
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="modal-settings"]')).toBeHidden()
})

test('import/export modal shows all formats', async ({ page }) => {
  await page.click('[data-testid="btn-import-export"]')
  await expect(page.locator('[data-testid="modal-import-export"]')).toBeVisible()

  await expect(page.locator('[data-testid="modal-import-export"]')).toContainText('导出 MD')
  await expect(page.locator('[data-testid="modal-import-export"]')).toContainText('导出 JSON')
  await expect(page.locator('[data-testid="modal-import-export"]')).toContainText('导出 HTML')
  await expect(page.locator('[data-testid="modal-import-export"]')).toContainText('导入 MD')
  await expect(page.locator('[data-testid="modal-import-export"]')).toContainText('导入 HTML')

  // 导入方式为 Naive 单选按钮组（原生 input 被 Naive 视觉隐藏）
  const merge = page.getByRole('radio', { name: '合并导入' })
  const overwrite = page.getByRole('radio', { name: '覆盖导入' })
  await expect(merge).toHaveCount(1)
  await expect(overwrite).toHaveCount(1)
  await expect(merge).toBeChecked()
})

test('clear selection with Escape', async ({ page }) => {
  await page.keyboard.press('Control+a')
  await expect(page.getByText('已选 3 项').first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('已选 3 项').first()).toBeHidden()
})

test('add category via sidebar all-row context menu', async ({ page }) => {
  // Right-click "全部" row — opens AddCategoryModal directly (not a ctx menu)
  await sidebarRow(page, '全部').click({ button: 'right' })

  // AddCategoryModal appears（标题「新建分类」在 n-modal 的 card header 里）
  await page.waitForSelector('[data-testid="modal-add-category"]')

  // Fill in category name (input has no type attr)
  await page.locator('[data-testid="modal-add-category"] input').fill('新分类')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="modal-add-category"]'))

  // Verify new category appears in sidebar
  await expect(page.getByRole('complementary')).toContainText('新分类')
})
