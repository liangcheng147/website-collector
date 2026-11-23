# Naive UI 迁移 · 第一册（地基）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把表现层从「手写 CSS + 全局类名」切到 Naive UI，建立单一主题数据源；本册完成设计文档的批次 0–4（地基、外壳表面、通用弹窗、设置页）。

**Architecture:** 颜色只定义在 `src/theme/`。`buildThemeOverrides()` 把调色板转成 Naive 主题对象，`applyShellVars()` 把同一份数据写成 CSS 变量给自绘外壳；`n-config-provider` 用 `abstract` + `preflight-style-disabled` 挂载，`n-global-style` 保证 teleport 到 `body` 的弹窗也拿到主题。控件按「外壳表面 → 通用弹窗 → 设置页」逐层替换，每批一个可回滚的提交。

**Tech Stack:** Vue 3.5, Pinia, Naive UI 2.45.3, Vite 6, TypeScript

**Spec:** `docs/superpowers/specs/2026-11-23-naive-ui-migration-design.md`

**分册说明：** 原设计有 8 个批次。本册是批次 0–4，第二册（批次 5–7：侧边栏树、列表与表格、收尾）等本册落地后再写，避免接口在长文档里漂移。第二册还需包含：`src-tauri/capabilities/` 放行 `core:webview:allow-set-webview-zoom`、把缩放从 `transform` 改为原生 `setZoom`、`main.css` 拆出 `shell.css`、`n-empty` 替换空状态、`n-dropdown` 替换右键菜单、`useSelection` 的去留判定。

## Global Constraints

- 窗口 `decorations: false` + `transparent: true`；不得引入会给根节点加背景色的东西
- 标题栏（`TitleBar.vue`）与窗口按钮保留自绘，`data-tauri-drag-region` 不得改
- 11 套色板 × 亮/暗 必须全部可用；切换不得修改 CSS 文件
- 十六进制颜色只允许出现在 `src/theme/` 下
- `naive-ui` 固定 `2.45.3`；不引入 Tailwind；不换图标库（继续 `lucide-vue-next`）
- 每批结束必须：`npm test` 全绿、`npm run build` 通过；改动到 e2e 已定位元素的批次必须同步更新 `e2e/*.spec.ts` 并跑 `npx playwright test`
- 每批至少一个提交，不得把多批混在一个提交里
- 本册不改 Rust 侧、数据格式、IPC 契约、信息架构

## Review Focus

1. **teleport 到 `body` 的弹窗拿不到主题变量** —— `n-modal` 默认挂到 `body`，而 `n-config-provider` 的变量只挂在它自己的包裹层。期望：body 层的弹窗与主界面观感一致。测试：断言 `n-global-style` 被渲染。
2. **连续切换色板时变量残留** —— 期望：切到任意色板后 `html` 上的 `--primary` 等于该色板主色，不叠加、不清空。测试：`applyShellVars` 连续调用两次，取值正确。
3. **暗色下自绘外壳与 Naive 控件不一致** —— 期望：暗色下标题栏/侧栏/状态栏与弹窗控件同为暗色。测试：`applyShellVars(p, true)` 写入的 `--bg` 等于 `SHELL_DARK.neutral.bg`。
4. **`n-config-provider` 的包裹元素破坏高度链** —— 期望：`html/body/#app/.app` 仍是 `height: 100%`。测试：断言 provider 使用 `abstract`。
5. **`prefers-reduced-motion` 被 Naive 的过渡覆盖** —— 期望：系统开启减弱动效时所有过渡被抑制。测试：现有 media query 保留，并在 Task 2 断言其仍在 `main.css` 中。

---

## File Structure

| 文件 | 职责 | 本册状态 |
|---|---|---|
| `src/theme/palettes.ts` | 11 套调色板数据（主色唯一来源） | 新建 |
| `src/theme/tokens.ts` | 语义色 + 外壳中性色（亮/暗） | 新建 |
| `src/theme/index.ts` | `buildThemeOverrides` / `applyShellVars` / `resolveTheme` | 新建 |
| `src/theme/palettes.spec.ts` | 主题数据测试 | 新建 |
| `eslint.config.js` | ESLint flat config | 新建 |
| `.github/workflows/ci.yml` | 增加 lint 步骤 | 修改 |
| `src/App.vue` | `n-config-provider` + providers + 主题接线 | 修改 |
| `src/store/app.ts` | `applyAppearance` 改用主题模块 | 修改 |
| `src/styles/main.css` | 收缩为：单一定量表 + 标题栏 + 外壳 + 滚动条 + 减少动效 | 修改 |
| `src/components/TopBar.vue`、`StatusBar.vue` | 控件替换 | 修改 |
| `src/components/AddEditModal.vue`、`ImportExportModal.vue`、`PickCategoryModal.vue`、`AddTagsModal.vue`、`AddCategoryModal.vue`、`ConfirmModal.vue`、`PromptModal.vue` | 弹窗替换 | 修改 |
| `src/components/ModalMask.vue` | 被 `n-modal` 取代 | 删除 |
| `src/components/SettingsModal.vue` | `n-modal` + `n-tabs` | 修改 |
| `tests/*.spec.ts`（16 个） | 读 CSS 文本的伪测试 | 删除 |

---

### Task 1: 迁移基线与主题数据（批次 0）

**Files:**
- Create: `src/theme/palettes.ts`, `src/theme/tokens.ts`, `src/theme/index.ts`, `src/theme/palettes.spec.ts`, `eslint.config.js`
- Modify: `package.json`, `.github/workflows/ci.yml`, `src/App.vue`, `src/main.ts`
- Delete: `tests/buttons.spec.ts`, `tests/context-menu.spec.ts`, `tests/css-tokens.spec.ts`, `tests/darkmode.spec.ts`, `tests/empty-state.spec.ts`, `tests/icons.spec.ts`, `tests/micro.spec.ts`, `tests/modal.spec.ts`, `tests/scrollbar.spec.ts`, `tests/searchbox.spec.ts`, `tests/sidebar.spec.ts`, `tests/statusbar.spec.ts`, `tests/sticky-bar.spec.ts`, `tests/table.spec.ts`, `tests/titlebar.spec.ts`, `tests/tooltip.spec.ts`

**Interfaces:**
- Produces（后续所有任务依赖这些名字，不得改名）：
  ```ts
  // src/theme/palettes.ts
  export type PaletteId = 'teal' | 'ocean' | 'indigo' | 'violet' | 'rose' | 'amber'
    | 'emerald' | 'slate' | 'stone' | 'sky' | 'plum'
  export interface PaletteColors { primary: string; container: string; onPrimary: string }
  export interface Palette { id: PaletteId; name: string; light: PaletteColors; dark: PaletteColors }
  export const PALETTES: readonly Palette[]
  export const DEFAULT_PALETTE_ID: PaletteId   // 'teal'
  export function getPalette(id: string): Palette   // 未知 id 回退 DEFAULT_PALETTE_ID
  ```
  ```ts
  // src/theme/tokens.ts
  export interface SemanticTokens {
    ok: string; okText: string; pending: string; pendingText: string
    danger: string; dangerText: string; dangerBg: string; dangerBorder: string
  }
  export interface NeutralTokens {
    bg: string; panel: string; text: string; text2: string
    border: string; border2: string; hover: string
  }
  export interface ShellTokens { semantic: SemanticTokens; neutral: NeutralTokens }
  export const SHELL_LIGHT: ShellTokens
  export const SHELL_DARK: ShellTokens
  export function getShellTokens(dark: boolean): ShellTokens
  ```
  ```ts
  // src/theme/index.ts
  export function mix(hex: string, other: string, ratio: number): string
  export function buildThemeOverrides(p: Palette, dark: boolean): GlobalThemeOverrides
  export function applyShellVars(p: Palette, dark: boolean): void
  export function resolveTheme(s: { theme: 'system' | 'light' | 'dark'; palette?: string }): { dark: boolean; palette: Palette }
  ```

- [ ] **Step 1: 建分支与回退点标签**

```bash
git tag v0.3.4-ui-baseline
git switch -c feat/naive-ui
git log --oneline -1 && git tag --points-at HEAD
```

Expected: 新分支 HEAD 与 `v0.3.4-ui-baseline` 指向同一提交。

- [ ] **Step 2: 安装 Naive UI**

```bash
npm i naive-ui@2.45.3
npm i -D eslint typescript-eslint eslint-plugin-vue
```

Expected: `package.json` 中 `naive-ui` 版本为 `2.45.3`（不带 `^` 前缀以外的浮动范围）。

- [ ] **Step 3: 写主题数据的失败测试**

创建 `src/theme/palettes.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { PALETTES, DEFAULT_PALETTE_ID, getPalette } from './palettes'
import { buildThemeOverrides, applyShellVars, mix, resolveTheme } from './index'
import { SHELL_LIGHT, SHELL_DARK, getShellTokens } from './tokens'

const HEX = /^#[0-9a-fA-F]{6}$/

describe('palettes', () => {
  it('有 11 套色板且 id 唯一', () => {
    expect(PALETTES).toHaveLength(11)
    expect(new Set(PALETTES.map(p => p.id)).size).toBe(11)
  })

  it('每套色板的亮暗主色都是合法十六进制', () => {
    for (const p of PALETTES) {
      for (const mode of ['light', 'dark'] as const) {
        expect(p[mode].primary).toMatch(HEX)
        expect(p[mode].container).toMatch(HEX)
        expect(p[mode].onPrimary).toMatch(HEX)
      }
    }
  })

  it('未知 id 回退到默认色板', () => {
    expect(getPalette('nope').id).toBe(DEFAULT_PALETTE_ID)
  })
})

describe('buildThemeOverrides', () => {
  it('每套色板在两种模式下都产出主色', () => {
    for (const p of PALETTES) {
      for (const dark of [false, true]) {
        const o = buildThemeOverrides(p, dark)
        expect(o.common?.primaryColor).toBe(p[dark ? 'dark' : 'light'].primary)
        expect(o.common?.borderRadius).toBeTruthy()
      }
    }
  })
})

describe('applyShellVars', () => {
  it('暗色写入暗色中性色', () => {
    applyShellVars(getPalette('teal'), true)
    expect(document.documentElement.style.getPropertyValue('--bg').trim())
      .toBe(SHELL_DARK.neutral.bg)
  })

  it('连续切换不残留上一个色板的主色', () => {
    applyShellVars(getPalette('teal'), false)
    applyShellVars(getPalette('ocean'), false)
    expect(document.documentElement.style.getPropertyValue('--primary').trim())
      .toBe(getPalette('ocean').light.primary)
  })
})

describe('tokens', () => {
  it('亮暗中性色不同', () => {
    expect(getShellTokens(false).neutral.bg).not.toBe(getShellTokens(true).neutral.bg)
  })
})

describe('mix', () => {
  it('按比例混合', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('resolveTheme', () => {
  it('system 跟随 matchMedia', () => {
    expect(resolveTheme({ theme: 'system' }).dark).toBe(
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    )
  })
  it('显式 dark/light 不受系统影响', () => {
    expect(resolveTheme({ theme: 'dark' }).dark).toBe(true)
    expect(resolveTheme({ theme: 'light' }).dark).toBe(false)
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run src/theme/palettes.spec.ts`
Expected: FAIL，提示 `./palettes`、`./index`、`./tokens` 模块不存在。

- [ ] **Step 5: 实现 `src/theme/palettes.ts`**

11 套色板的数值从 `src/styles/main.css` L352–L373 逐套搬运：`primary` 取 `--primary`，`container` 取 `--primary-t`。`onPrimary` 亮色一律 `#FFFFFF`，暗色一律 `#06201C`。`name` 取现有中文名（青绿/海洋/靛青/紫罗兰/玫瑰/琥珀/翡翠/石墨/砂岩/天空/梅紫）。`id` 用英文 key（`teal`/`ocean`/...）。

- [ ] **Step 6: 实现 `src/theme/tokens.ts`**

`SHELL_LIGHT` / `SHELL_DARK` 的数值从 `src/styles/main.css` L2–L7 与 L198–L202 搬运：语义色对应 `--ok`/`--ok-txt`/`--pending`/`--pending-txt`/`--danger`/`--danger-txt`/`--danger-bg`/`--danger-bd`，中性色对应 `--bg`/`--panel`/`--text`/`--text-2`/`--border`/`--border-2`/`--hover`。

- [ ] **Step 7: 实现 `src/theme/index.ts`**

- `mix(hex, other, ratio)`：两位十六进制逐通道线性插值，结果保留 6 位小写。
- `buildThemeOverrides(p, dark)`：
  - `common.primaryColor = c.primary`，`primaryColorHover = mix(c.primary, '#FFFFFF', dark ? 0.12 : 0.10)`，`primaryColorPressed = mix(c.primary, '#000000', 0.12)`，`primaryColorSuppl = c.container`
  - `common.borderRadius = '8px'`，`common.fontFamily` 取 `main.css` 的 `--font` 值，`common.fontSizeMedium = '13px'`
  - `Button.heightMedium = '36px'`，`Button.heightSmall = '30px'`，`Button.borderRadiusMedium = '8px'`
- `applyShellVars(p, dark)`：把 `getShellTokens(dark)` 的中性色写到 `document.documentElement.style`，键名为 `--bg`/`--panel`/`--text`/`--text-2`/`--border`/`--border-2`/`--hover`/`--ok`/`--ok-txt`/`--pending`/`--pending-txt`/`--danger`/`--danger-txt`/`--danger-bg`/`--danger-bd`；再写 `--primary`/`--primary-t`/`--primary-w`/`--ring`（`--primary-w = mix(primary,'#000000',0.15)`，`--ring` 为 `0 0 0 3px` + 30% 透明度的主色）。
- `resolveTheme(s)`：按 `s.theme` 与 `window.matchMedia` 计算 `dark`；调色板用 `getPalette(s.palette ?? DEFAULT_PALETTE_ID)`。

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run src/theme/palettes.spec.ts`
Expected: PASS（9 个用例）。

- [ ] **Step 9: 删除 16 个读 CSS 文本的伪测试**

```bash
git rm tests/buttons.spec.ts tests/context-menu.spec.ts tests/css-tokens.spec.ts tests/darkmode.spec.ts tests/empty-state.spec.ts tests/icons.spec.ts tests/micro.spec.ts tests/modal.spec.ts tests/scrollbar.spec.ts tests/searchbox.spec.ts tests/sidebar.spec.ts tests/statusbar.spec.ts tests/sticky-bar.spec.ts tests/table.spec.ts tests/titlebar.spec.ts tests/tooltip.spec.ts
```

- [ ] **Step 10: 运行全量测试确认没有别处引用被删文件**

Run: `npm test`
Expected: PASS。用例总数从 148 降到 132（减去 16 个文件里的用例，加上 Task 1 新增的 9 个 → 实际以输出为准，不得有 import 报错）。

- [ ] **Step 11: 接入 providers（外观暂不变）**

修改 `src/App.vue`：在模板最外层包 `n-config-provider`，内部依次包 `n-global-style`、`n-dialog-provider`、`n-message-provider`，原有的 `.app` 作为 `n-message-provider` 的子节点。

```vue
<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, NDialogProvider, NMessageProvider } from 'naive-ui'
</script>

<template>
  <n-config-provider abstract preflight-style-disabled>
    <n-global-style />
    <n-dialog-provider>
      <n-message-provider>
        <div class="app">
          <!-- 原有内容不动 -->
        </div>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
```

要点：`abstract` 让 provider 不渲染包裹元素（保住 `height:100%` 链）；`preflight-style-disabled` 关掉 Naive 的 reset。此时不传 `theme` / `theme-overrides`，外观必须与改动前一致。

- [ ] **Step 12: 手动确认外观未变，并锁定两条结构约束**

Run: `npm run dev`，Expected: 界面与改动前一致，控制台无 Naive 警告。

在 `e2e/smoke.spec.ts` 增加两条断言，防止日后有人去掉 `abstract` 或 `n-global-style`：

```ts
  // provider 必须是 abstract，否则会多一层包裹元素，破坏 height:100% 链
  await expect(page.locator('#app > .app')).toBeVisible()

  // n-global-style 必须存在，否则 teleport 到 body 的弹窗拿不到主题变量
  const primaryVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--n-primary-color').trim(),
  )
  expect(primaryVar).toBeTruthy()
```

Run: `npx playwright test`
Expected: PASS

- [ ] **Step 13: 接入 ESLint 与 CI**

创建 `eslint.config.js`（flat config）：`eslint` 推荐规则 + `typescript-eslint` 的 `recommended` + `eslint-plugin-vue` 的 `flat/recommended`。`package.json` 增加 `"lint": "eslint ."`。

运行 `npm run lint`，按提示修到 0 error / 0 warning；若改动量大，先提交一个纯自动修复的提交：

```bash
npx eslint . --fix
git add -A && git commit -m "chore: eslint auto-fix baseline"
```

`.github/workflows/ci.yml` 在「Run unit tests」之前插入：

```yaml
      - name: Run lint
        run: npm run lint
```

- [ ] **Step 14: 提交**

```bash
git add -A
git commit -m "feat(ui): adopt naive-ui and add single-source theme data

Adds src/theme (palettes, tokens, overrides) as the only place colors
are defined, mounts an abstract n-config-provider, and removes the 16
specs in tests/ that only asserted on main.css text.

Refs: docs/superpowers/specs/2026-11-23-naive-ui-migration-design.md"
```

---

### Task 2: 主题接线与样式表收敛（批次 1）

**Files:**
- Modify: `src/store/app.ts`, `src/App.vue`, `src/styles/main.css`

**Interfaces:**
- Consumes: Task 1 的 `resolveTheme` / `buildThemeOverrides` / `applyShellVars`
- Produces: `store.applyAppearance()` 的新行为（写 `data-theme` / `data-palette` + 调 `applyShellVars`）；`App.vue` 暴露 `themeOverrides` 计算属性（`buildThemeOverrides` 的返回值）

- [ ] **Step 1: 收敛 `main.css` 的变量表**

在 `main.css` 顶部只保留**一套**命名：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-full`，`--shadow-sm` / `--shadow-md` / `--shadow-lg`，`--space-1`…`--space-6`，`--duration-fast` / `--duration-normal` / `--duration-slow`，`--ease`，`--font`，`--mono`，`--titlebar-h`，`--win-radius`。

删除重复定义（L17–L21 中与 L8–L14 重名的部分），并把全文引用旧名（`--radius`、`--shadow`、`--radius-pill`）改为新名。

- [ ] **Step 2: 写 store 行为的失败测试**

在 `src/store/app.spec.ts` 追加：

```ts
  it('写入 data-theme 与 data-palette', () => {
    store.applyAppearance()
    expect(document.documentElement.dataset.theme).toMatch(/light|dark/)
    expect(document.documentElement.dataset.palette).toBeTruthy()
  })
```

Run: `npx vitest run src/store/app.spec.ts`
Expected: FAIL（`applyAppearance` 尚未调用 `resolveTheme` / `applyShellVars`）

- [ ] **Step 3: 改 `store.applyAppearance()`**

```ts
applyAppearance() {
  if (typeof document === 'undefined') return
  const s = this.settings
  const { dark, palette } = resolveTheme({ theme: s.theme, palette: s.palette })
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.palette = palette.id
  applyShellVars(palette, dark)
  const app = document.querySelector('.app') as HTMLElement | null
  // zoom 仍是 transform 方案，本册不动；第二册改为原生 setZoom
}
```

Run: `npx vitest run src/store/app.spec.ts`
Expected: PASS

- [ ] **Step 4: 在 `App.vue` 提供主题**

`App.vue` 新增一个计算属性，作为 provider 与 `applyAppearance` 的唯一判据：

```ts
const theme = computed(() => resolveTheme(store.settings))
const themeOverrides = computed(() => buildThemeOverrides(theme.value.palette, theme.value.dark))
```

`<n-config-provider>` 绑定：

```vue
<n-config-provider
  abstract
  preflight-style-disabled
  :theme="theme.dark ? darkTheme : null"
  :theme-overrides="themeOverrides"
  :locale="zhCN"
  :date-locale="dateZhCN"
>
```

`import { darkTheme, zhCN, dateZhCN } from 'naive-ui'`。

注意：`applyAppearance` 必须与这里读同一个 `resolveTheme`，否则 `data-theme` 与实际主题会不一致。

- [ ] **Step 5: 删除 `main.css` 中已被主题模块接管的段落与死规则**

删除：L348–L373（22 段 `html[data-palette=...]`）、L195–L218（`html[data-theme="dark"]` 覆盖）、L414–L428（`[data-tooltip]` —— 全项目无任何模板使用它，属死规则）。

保留 `:root` 的中性色定义作为**未接线前的兜底**，但把其中的颜色值改为引用变量（`var(--bg)` 等），避免出现第二份颜色文本。

- [ ] **Step 6: 验证 11 套色板 × 亮暗**

Run: `npm run dev`
逐个点击 11 套色板、切换亮/暗/跟随系统，Expected：每次切换后主色立即变化，标题栏、侧栏、状态栏与主界面一致，无白边、无残留色。

- [ ] **Step 7: 验证减少动效仍在**

确认 `main.css` 中 `@media (prefers-reduced-motion: reduce)` 块仍存在（现有 e2e/单测可能覆盖，至少人工确认一次）。

- [ ] **Step 8: 全量验证并提交**

Run: `npm test && npm run build && npx playwright test`
Expected: 全绿。
Commit message: `feat(theme): drive the whole app from src/theme`

---

### Task 3: 外壳表面控件（批次 2）

**Files:**
- Modify: `src/components/TopBar.vue`, `src/components/StatusBar.vue`
- Test: `src/components/StatusBar.spec.ts`（更新选择器）

**Interfaces:**
- Consumes: Task 1/2 的主题
- Produces: `data-testid` 约定 —— 顶栏与状态栏中被 e2e 定位的元素加 `data-testid`：`search-input`、`tag-filter`、`btn-add`、`btn-check-all`、`btn-manage`、`btn-import-export`、`btn-settings`

- [ ] **Step 1: 更新 `StatusBar.spec.ts` 的选择器**

把依赖 `.statusbar` 内文本的断言保留（文本未变），若有用到样式类则改为 `data-testid` 或角色。

- [ ] **Step 2: 替换 `TopBar.vue` 的控件**

- 搜索框：`<input class="search">` → `n-input`，用 `#prefix` 插槽放 `Search` 图标
- 标签筛选：`<select class="btn">` → `n-select`，`options` 由 `store.data.tags` 生成
- 按钮：`检测全部` / `添加` → `n-button`（`type="primary"` 用于「添加」）；`管理` / `导入导出` / 设置图标 → `n-button quaternary`
- 每个控件加 Step 约定的 `data-testid`

- [ ] **Step 3: 运行顶栏相关测试**

Run: `npm test`
Expected: PASS（`TopBar` 无独立 spec，靠 `app.spec.ts` 兜底）

- [ ] **Step 4: 手动确认**

Run: `npm run dev`，Expected: 搜索、标签筛选、五个按钮功能与外观正常，暗色下一致。

- [ ] **Step 5: 提交**

Commit message: `refactor(ui): naive-ui controls in topbar and statusbar`

---

### Task 4: 通用弹窗迁移（批次 3，7 个）

**Files:**
- Modify: `src/components/AddEditModal.vue`, `ImportExportModal.vue`, `PickCategoryModal.vue`, `AddTagsModal.vue`, `AddCategoryModal.vue`, `ConfirmModal.vue`, `PromptModal.vue`
- Delete: `src/components/ModalMask.vue`
- Test: `src/components/AddEditModal.spec.ts`, `src/components/SettingsModal.spec.ts` 中涉及 modal 的用例、`e2e/site-management.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `n-dialog-provider`（已挂载）
- Produces: 每个弹窗组件对外接口（props/emit）**保持不变**，只换内部实现

- [ ] **Step 1: 把 `ModalMask` 的用法统一为 `n-modal`**

每个弹窗组件改为根节点 `<n-modal :show="true" preset="card" :title="..." :mask-closable="true" :close-on-esc="true" :trap-focus="true" :auto-focus="true" :to="...">`，原 `<slot />` 内容放进默认插槽，底部按钮区放进 `#footer` 插槽。

`to` 必须显式指定为 `body`（`to="body"`），与现有 `Teleport to="body"` 行为一致。

- [ ] **Step 2: `ConfirmModal` 与 `PromptModal` 改用 `useDialog`**

这两个组件从「父组件 `v-if` 控制」改为「父组件调用 `useDialog()` 创建」。注意：`useDialog` 只在 `n-dialog-provider` 内可用（Task 1 已挂载）。

`PromptModal` 需要输入框，`useDialog` 的 `content` 支持渲染函数，用 `h` 渲染 `n-input`。

- [ ] **Step 3: 更新 `AddEditModal.spec.ts`**

把 `find('.modal')` / `find('.cb')` 之类改为 `find('[data-testid="..."]')`、`getByRole('button', { name: '保存' })` 或按文本查找。为表单控件补 `data-testid`：`input-name`、`input-url`、`btn-fetch-title`、`textarea-note`、`btn-save`。

- [ ] **Step 4: 更新 `e2e/site-management.spec.ts`**

把 `.modal`、`.cb` 等选择器改为 `data-testid` / 角色 / 文本。

- [ ] **Step 5: 运行验证**

Run: `npm test && npx playwright test`
Expected: 全绿；手动 `npm run dev` 确认 7 个弹窗的打开、Esc 关闭、遮罩点击关闭、焦点陷阱正常。

再确认一次 teleport 行为：打开「添加」弹窗，在 devtools 中确认 `.n-modal` 挂在 `body` 下（不是 `.app` 内），且其主色与主界面一致 —— 这条依赖 Task 1 的 `n-global-style`。

- [ ] **Step 6: 提交**

Commit message: `refactor(ui): replace hand-rolled modals with n-modal`

---

### Task 5: 设置页（批次 4）

**Files:**
- Modify: `src/components/SettingsModal.vue`, `src/styles/main.css`（删除 `.settings-*` 样式）
- Test: `src/components/SettingsModal.spec.ts`, `src/components/SettingsModal.updater.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `n-modal` 用法
- Produces: 无新增对外接口；`Settings` 类型不变

- [ ] **Step 1: 改为 `n-modal` + `n-tabs`**

根节点 `n-modal preset="card"`，标题「设置」；内容区用 `n-tabs placement="left" type="line"`，四个页签：主题、显示、数据存储、关于。删除 `.settings-layout` / `.settings-nav` / `.settings-body` 的自绘结构。

- [ ] **Step 2: 主题页**

`n-select`（主题模式）+ 配色网格保留（配色网格是自绘的，因为它展示的是自定义色块；保留 `.palette-grid` 但改用主题变量）。

- [ ] **Step 3: 显示页**

滑块改用 `n-input-number` 或保留 `<input type="range">` 但改用主题变量；`n-input-number` 更贴合「规范」，二选一并在提交说明里写清理由。

- [ ] **Step 4: 关于页**

开关改 `n-switch`；进度改 `n-progress`；其余按钮改 `n-button`。删除 14 处静态内联 `style="..."`。

- [ ] **Step 5: 更新 `SettingsModal.spec.ts`**

把 `.settings-nav-item`、`.toggle` 等改为 `n-tabs` 的 DOM（页签用 `role="tab"`）与 `n-switch`（`role="switch"`）。

- [ ] **Step 6: 验证并提交**

Run: `npm test && npm run build && npx playwright test`
Expected: 全绿；设置弹窗高度稳定、四个分区内容不变。
Commit message: `refactor(ui): settings page on n-tabs and n-switch`

---

## 本册完成标准

- `npm test` 全绿，且 `tests/` 下不再有读 CSS 文本的用例
- `npm run build` 通过，`npm run lint` 0 error
- `npx playwright test` 通过
- `main.css` 不再包含任何十六进制调色板颜色
- 11 套色板 × 亮/暗 手动切换正常
- 顶栏、状态栏、7 个通用弹窗、设置页全部使用 Naive 控件
