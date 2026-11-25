/**
 * Sidebar resize E2E: drag handle adjusts width and persists across reload.
 */
import { test, expect, Page } from '@playwright/test'

async function mockInvoke(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        switch (cmd) {
          case 'load_data':
            return { version: 1, categories: [], sites: [], recycleBin: [], tags: [] }
          case 'get_settings':
            return {
              theme: 'system', palette: 'teal', zoom: 100, sidebarCollapsed: [], collapsedCategories: [],
              autoCheckUpdate: false, autoFetchFavicon: true, autoCheck: false, checkInterval: 0,
              checkScope: 'all', retryCount: 1, concurrency: 3,
            }
          case 'save_data':
          case 'set_settings': return undefined
          case 'get_data_location': return { dir: '/tmp', isFallback: false }
          case 'check_connectivity': return true
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

test('拖动分割线加宽侧栏并在刷新后保留', async ({ page }) => {
  const handle = page.locator('[data-testid="sidebar-resizer"]')
  await expect(handle).toHaveAttribute('aria-valuenow', '170')

  const box = (await handle.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, y, { steps: 5 })
  await page.mouse.up()

  const stored = await page.evaluate(() => localStorage.getItem('site-collector-sidebar-width'))
  expect(Number(stored)).toBeGreaterThanOrEqual(250)
  await expect(handle).toHaveAttribute('aria-valuenow', String(Number(stored)))

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-testid="sidebar-resizer"]')).toHaveAttribute('aria-valuenow', String(Number(stored)))
})

test('双击分割线复位为 170', async ({ page }) => {
  const handle = page.locator('[data-testid="sidebar-resizer"]')
  await handle.dblclick()
  await expect(handle).toHaveAttribute('aria-valuenow', '170')
})
