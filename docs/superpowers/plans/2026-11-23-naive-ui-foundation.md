# Naive UI 迁移 · 第一册（地基）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把表现层从「手写 CSS + 全局类名」切到 Naive UI，建立单一主题数据源；本册完成设计文档的批次 0–4（地基、外壳表面、通用弹窗、设置页）。

**Architecture:** 颜色只定义在 `src/theme/`。`buildThemeOverrides()` 把调色板转成 Naive 主题对象，`applyShellVars()` 把同一份数据写成 CSS 变量给自绘外壳；`n-config-provider` 用 `abstract` + `preflight-style-disabled` 挂载。控件按「外壳表面 → 通用弹窗 → 设置页」逐层替换，每批一个可回滚的提交。

**Tech Stack:** Vue 3.5, Pinia, Naive UI 2.45.3, Vite 6, TypeScript

**Spec:** `docs/superpowers/specs/2026-11-23-naive-ui-migration-design.md`

**分册说明：** 原设计有 8 个批次。本册是批次 0–4，第二册（批次 5–7：侧边栏树、列表与表格、收尾）等本册落地后再写，避免接口在长文档里漂移。第二册还需包含：`src-tauri/capabilities/` 放行 `core:webview:allow-set-webview-zoom`、把缩放从 `transform` 改为原生 `setZoom`、`main.css` 拆出 `shell.css`、`n-empty` 替换空状态、`n-dropdown` 替换右键菜单、`useSelection` 的去留判定。

## Global Constraints

- 窗口 `decorations: false` + `transparent: true`。**禁止使用 `n-global-style`** —— 它会把 `body` 的 `background-color` 写成主题的不透明色（见 naive-ui `GlobalStyle.mjs`），透明窗口会露白。
- 标题栏（`TitleBar.vue`）与窗口按钮保留自绘，`data-tauri-drag-region` 不得改。
- 11 套色板 × 亮/暗 必须全部可用；切换不得修改 CSS 文件。
- **十六进制颜色只允许出现在 `src/theme/` 下。** `main.css` 中不得出现任何颜色值（包括 `:root` 里）。
- `naive-ui` 固定 `2.45.3`（用 `--save-exact`）；不引入 Tailwind；不换图标库（继续 `lucide-vue-next`）。
- **每个任务结束必须跑 `npm test` 与 `npm run build` 并全绿**；改动到 e2e 已定位元素的任务必须同步更新 `e2e/*.spec.ts` 并跑 `npx playwright test`。
- 每个任务至少一个提交，不得把多批混在一个提交里。
- 本册不改 Rust 侧、数据格式、IPC 契约、信息架构。

## Review Focus

1. **teleport 到 `body` 的弹窗主题** —— 已核实 naive-ui `Modal.mjs`：弹窗容器自带 `cssVars`（`--n-color` / `--n-box-shadow` / `--n-text-color`），且 `inject` 跨 `Teleport` 生效，所以弹窗天然跟随主题，**不需要 `n-global-style`**。验证：`document.body` 上没有 `n-styled` 属性，且 `body` 计算背景为透明。
2. **连续切换色板时变量残留** —— 切到任意色板后 `html` 上的 `--primary` 等于该色板主色，不叠加、不清空。测试：`applyShellVars` 连续调用两次，取值正确。
3. **暗色下自绘外壳与 Naive 控件不一致** —— 测试：`applyShellVars(p, true)` 写入的 `--bg` 等于 `SHELL_DARK.neutral.bg`。
4. **`n-config-provider` 的包裹元素破坏高度链** —— 验证：`#app > .app` 是直接子元素（`abstract` 生效）。
5. **`prefers-reduced-motion` 被 Naive 的过渡覆盖** —— Task 2 用 Playwright `reducedMotion: 'reduce'` 断言过渡被抑制。

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
| 8 个弹窗组件 | 外壳换 `n-modal` | 修改 |
| `src/components/ModalMask.vue` | 被 `n-modal` 取代 | 删除 |
| `src/components/ConfirmModal.vue`、`PromptModal.vue` | 改 `useDialog` 调用 | 删除 |
| `tests/*.spec.ts`（16 个） | 读 CSS 文本的伪测试 | 删除 |

---

### Task 1: 迁移基线与主题数据（批次 0）

**Files:**
- Create: `src/theme/palettes.ts`, `src/theme/tokens.ts`, `src/theme/index.ts`, `src/theme/palettes.spec.ts`, `eslint.config.js`
- Modify: `package.json`, `.github/workflows/ci.yml`, `src/App.vue`
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

- [ ] **Step 1: 确认分支与回退点标签**

```bash
git branch --show-current          # 必须是 feat/naive-ui
git tag --points-at 184ef51        # 必须是 v0.3.4-ui-baseline
```

若标签不存在（控制器应已创建），执行 `git tag v0.3.4-ui-baseline 184ef51`。

- [ ] **Step 2: 安装 Naive UI 与 ESLint**

```bash
npm i --save-exact naive-ui@2.45.3
npm i -D eslint typescript-eslint eslint-plugin-vue
```

Expected: `package.json` 中 `naive-ui` 的依赖值恰为 `2.45.3`（无 `^`/`~`）。

- [ ] **Step 3: 写主题数据的失败测试**

创建 `src/theme/palettes.spec.ts`，**第一行必须是 `// @vitest-environment happy-dom`**（`vitest.config.ts` 未设 environment，默认 node，`document`/`window` 都不存在）：

```ts
// @vitest-environment happy-dom
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

按下面的**精确数值**写入（不要从 CSS 里猜，CSS 将在 Task 2 被删）：

| id | name | light.primary | light.container | dark.primary | dark.container |
|---|---|---|---|---|---|
| `teal` | 青绿 | `#0D9488` | `#CCFBF1` | `#2DD4BF` | `#10302C` |
| `ocean` | 海洋 | `#2563EB` | `#DBEAFE` | `#3B82F6` | `#1E3A5F` |
| `indigo` | 靛青 | `#4F46E5` | `#E0E7FF` | `#6366F1` | `#312E81` |
| `violet` | 紫罗兰 | `#7C3AED` | `#EDE9FE` | `#8B5CF6` | `#4C1D95` |
| `rose` | 玫瑰 | `#E11D48` | `#FFE4E6` | `#F43F5E` | `#4C1D33` |
| `amber` | 琥珀 | `#D97706` | `#FEF3C7` | `#F59E0B` | `#4A3506` |
| `emerald` | 翡翠 | `#059669` | `#D1FAE5` | `#10B981` | `#064E3B` |
| `slate` | 石墨 | `#475569` | `#F1F5F9` | `#64748B` | `#1E293B` |
| `stone` | 砂岩 | `#57534E` | `#F5F5F4` | `#78716C` | `#292524` |
| `sky` | 天空 | `#0284C7` | `#E0F2FE` | `#38BDF8` | `#0C4A6E` |
| `plum` | 梅紫 | `#A21CAF` | `#FAE8FF` | `#C026D3` | `#3B0764` |

`onPrimary`：亮色全部 `#FFFFFF`，暗色全部 `#06201C`。
`PALETTES` 的顺序与上表一致（设置页按它渲染）。

- [ ] **Step 6: 实现 `src/theme/tokens.ts`**

按下面的**精确数值**写入：

```ts
SHELL_LIGHT = {
  semantic: {
    ok: '#16A34A', okText: '#14833E',
    pending: '#D97706', pendingText: '#A8660A',
    danger: '#DC2626', dangerText: '#C02424',
    dangerBg: '#FDF1F1', dangerBorder: '#F2C9C9',
  },
  neutral: {
    bg: '#F6F9F8', panel: '#FFFFFF',
    text: '#0F2E2A', text2: '#5B7A76',
    border: '#D8EBE7', border2: '#C3DED9', hover: '#EEF5F3',
  },
}
SHELL_DARK = {
  semantic: {
    ok: '#4ADE80', okText: '#5BE38C',
    pending: '#FBBF24', pendingText: '#FBC74A',
    danger: '#F87171', dangerText: '#F88383',
    dangerBg: '#2A1D1D', dangerBorder: '#4A2A2A',
  },
  neutral: {
    bg: '#0B1413', panel: '#12201E',
    text: '#E6F0EE', text2: '#93ADA8',
    border: '#1E3330', border2: '#294742', hover: '#162624',
  },
}
```

注意亮色的 `ok`/`pending` 取 `#16A34A`/`#D97706`（现有 `html[data-palette=...][data-theme="light"]` 里的覆盖值），不是 `:root` 里的 `#15A34A`/`#E08A00`。

- [ ] **Step 7: 实现 `src/theme/index.ts`**

- `mix(hex, other, ratio)`：解析两个 6 位十六进制，逐通道线性插值（`Math.round`），结果返回 6 位**小写**十六进制。
- `buildThemeOverrides(p, dark)`：
  - `const c = p[dark ? 'dark' : 'light']`
  - `common.primaryColor = c.primary`
  - `common.primaryColorHover = mix(c.primary, dark ? '#FFFFFF' : '#000000', dark ? 0.12 : 0.10)`
  - `common.primaryColorPressed = mix(c.primary, '#000000', 0.12)`
  - `common.primaryColorSuppl = c.container`
  - `common.borderRadius = '8px'`
  - `common.fontFamily = '"Geist Variable","Segoe UI",-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif'`
  - `common.fontSizeMedium = '13px'`
  - `Button.heightMedium = '36px'`，`Button.heightSmall = '30px'`，`Button.borderRadiusMedium = '8px'`
  - 返回类型用 `import type { GlobalThemeOverrides } from 'naive-ui'`（**仅类型导入**）。
- `applyShellVars(p, dark)`：
  - `const t = getShellTokens(dark)`，`const c = p[dark ? 'dark' : 'light']`
  - 写到 `document.documentElement.style`：`--bg`/`--panel`/`--text`/`--text-2`/`--border`/`--border-2`/`--hover` 取 `t.neutral`；`--ok`/`--ok-txt`/`--pending`/`--pending-txt`/`--danger`/`--danger-txt`/`--danger-bg`/`--danger-bd` 取 `t.semantic`（注意 CSS 变量名带 `-txt`/`-bd`，接口字段叫 `okText`/`dangerBorder`）。
  - 再写 `--primary = c.primary`，`--primary-t = c.container`，`--on-primary = c.onPrimary`。
  - `--primary-w`：**亮色** `mix(c.primary, '#000000', 0.15)`，**暗色** `mix(c.primary, '#FFFFFF', 0.12)`（暗色下 hover 是变亮，不是变暗）。
  - `--ring`：`'0 0 0 3px ' + 主色加 alpha`，亮色 alpha 0.30、暗色 0.32（8 位十六进制，如 `#0D94884D`）。
  - 若 `document` 不存在（SSR/Node）直接 return。
- `resolveTheme(s)`：
  - `dark`：`s.theme === 'dark'` → true；`s.theme === 'light'` → false；`'system'` → `window.matchMedia('(prefers-color-scheme: dark)').matches`。
  - `palette = getPalette(s.palette ?? DEFAULT_PALETTE_ID)`。

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run src/theme/palettes.spec.ts`
Expected: PASS，**10 个用例**。

- [ ] **Step 9: 删除 16 个读 CSS 文本的伪测试**

```bash
git rm tests/buttons.spec.ts tests/context-menu.spec.ts tests/css-tokens.spec.ts tests/darkmode.spec.ts tests/empty-state.spec.ts tests/icons.spec.ts tests/micro.spec.ts tests/modal.spec.ts tests/scrollbar.spec.ts tests/searchbox.spec.ts tests/sidebar.spec.ts tests/statusbar.spec.ts tests/sticky-bar.spec.ts tests/table.spec.ts tests/titlebar.spec.ts tests/tooltip.spec.ts
```

- [ ] **Step 10: 运行全量测试确认没有别处引用被删文件**

Run: `npm test`
Expected: PASS，无 import 报错。不要断言具体总数。

- [ ] **Step 11: 接入 providers（外观暂不变）**

修改 `src/App.vue`：在模板最外层包 `n-config-provider`，内部依次包 `n-dialog-provider`、`n-message-provider`，原有的 `.app` 作为 `n-message-provider` 的子节点。**不要加 `n-global-style`。**

```vue
<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
</script>

<template>
  <n-config-provider abstract preflight-style-disabled>
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

在 `e2e/smoke.spec.ts` 增加两条断言：

```ts
  // provider 必须是 abstract，否则会多一层包裹元素，破坏 height:100% 链
  await expect(page.locator('#app > .app')).toBeVisible()

  // 不得使用 n-global-style：它会把 body 背景写成不透明色，破坏透明窗口
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bodyBg).toBe('rgba(0, 0, 0, 0)')
```

Run: `npx playwright test`
Expected: PASS

- [ ] **Step 13: 接入 ESLint 与 CI**

创建 `eslint.config.js`（flat config）：`eslint.configs.recommended` + `typescript-eslint.configs.recommended` + `vue.configs['flat/recommended']`。**不要引入 Prettier / stylistic 规则**（现有代码引号、分号风格混杂，格式化会产生与迁移无关的巨大 diff）。

必须包含 `ignores`：`dist`、`node_modules`、`.superpowers`、`src-tauri`、`e2e`（e2e 用 Playwright 全局，单独处理或忽略）。

`package.json` 增加 `"lint": "eslint ."`。

运行 `npm run lint`，按提示修到 0 error / 0 warning。可以用 `npx eslint . --fix` 处理可自动修复的项，但**提交前检查 diff**：若 `--fix` 产生了成片的引号/分号改写，回退并重做。

若手动修复量确实很大（`--fix` 后仍 > 40 条 error），停下来在报告里给出按规则分组的清单，状态报 `NEEDS_CONTEXT`。

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

- [ ] **Step 15: 任务收尾验证**

Run: `npm test && npm run build && npx playwright test`
Expected: 全绿。

---

### Task 2: 主题接线与样式表收敛（批次 1）

**Files:**
- Modify: `src/store/app.ts`, `src/App.vue`, `src/styles/main.css`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `resolveTheme` / `buildThemeOverrides` / `applyShellVars` / `getPalette` / `PALETTES`
- Produces: `store.applyAppearance()` 的新行为（写 `data-theme` / `data-palette` + 调 `applyShellVars`）；`App.vue` 的 `theme` / `themeOverrides` 计算属性

- [ ] **Step 1: 收敛 `main.css` 的变量表**

`main.css` 顶部只保留**一套**命名，映射关系如下（这是唯一权威映射，不得自行选择）：

| 保留名 | 值 | 替换掉的旧名 |
|---|---|---|
| `--radius-sm` | `6px` | — |
| `--radius-md` | `8px` | `--radius`（原 8px） |
| `--radius-lg` | `14px` | 重复定义的 `--radius-lg` |
| `--radius-full` | `999px` | `--radius-pill` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | `--shadow` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,.08)` | 带青绿调的旧 `--shadow-md` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,.12)` | — |
| `--space-1`…`--space-6` | `4/8/12/16/20/24px` | `--space-8` 删除（全项目未使用） |
| `--duration-fast` / `--duration-normal` / `--duration-slow` | `120/180/250ms` | — |
| `--ease` / `--font` / `--mono` / `--titlebar-h` / `--win-radius` | 原值 | — |

全文把 `var(--radius)` → `var(--radius-md)`、`var(--radius-pill)` → `var(--radius-full)`、`var(--shadow)` → `var(--shadow-sm)`。

**已知视觉变化**（两处，均为设计文档 §1 点名的既有缺陷）：
- 投影从青绿调 `rgba(13,60,55,.12)` 变为中性 `rgba(0,0,0,.08)`；
- `--radius-md` 从 10px 变为 8px，影响 `.sidebar .group-card` 与 `.cat-head` 两处。

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
  const { dark, palette } = resolveTheme(this.settings)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.palette = palette.id
  applyShellVars(palette, dark)
}
```

（`zoom` 仍是 `transform` 方案，本册不动；第二册改为原生 `setZoom`。）

Run: `npx vitest run src/store/app.spec.ts`
Expected: PASS

- [ ] **Step 4: 在 `App.vue` 提供主题**

`App.vue` 新增两个计算属性，作为 provider 的唯一判据：

```ts
import { computed } from 'vue'
import { darkTheme, zhCN, dateZhCN } from 'naive-ui'
import { resolveTheme, buildThemeOverrides } from './theme'

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

`applyAppearance` 与这里必须读同一个 `resolveTheme`，否则 `data-theme` 与实际主题会不一致。

- [ ] **Step 5: 删除 `main.css` 中已被主题模块接管的段落**

删除：
- L348–L373（22 段 `html[data-palette=...]`）
- L195–L218（`html[data-theme="dark"]` 覆盖）
- L414–L428（`[data-tooltip]` —— 全项目无任何模板使用它，属死规则）

`:root` 里的**颜色与 `--ring` 一律删除**，只留 Step 1 表格里的非颜色 token。`applyShellVars` 是这些变量的唯一写入者。

**已知代价**：`index.html` 的内联脚本仍在 pre-paint 阶段设置 `data-theme`/`data-palette`，但不再有对应 CSS 规则，因此启动到 JS 执行之间会有一个短暂的透明闪烁。记录为已知问题，第二册用构建期生成主题 CSS 解决。不要在 `main.css` 里留颜色兜底。

- [ ] **Step 6: 验证 11 套色板 × 亮暗**

Run: `npm run dev`
逐个点击 11 套色板、切换亮/暗/跟随系统，Expected：每次切换后主色立即变化，标题栏、侧栏、状态栏与主界面一致，无白边、无残留色。

- [ ] **Step 7: 用自动化测试锁定「减少动效」**

在 `e2e/smoke.spec.ts` 增加：用 `context.newPage({ reducedMotion: 'reduce' })`（或 `browser.newContext({ reducedMotion: 'reduce' })`）开一页，断言某个带过渡的元素计算样式 `transitionDuration` 为 `0.001s` 或 `0s`（`main.css` 的 `@media (prefers-reduced-motion: reduce)` 把 `transition-duration` 压到 `.001ms`）。

不要写「读 `main.css` 文本」的断言 —— 那正是本册要消灭的测试类型。

- [ ] **Step 8: 全量验证并提交**

Run: `npm test && npm run build && npx playwright test`
Expected: 全绿。
Commit message: `feat(theme): drive the whole app from src/theme`

---

### Task 3: 外壳表面控件（批次 2）

**Files:**
- Modify: `src/components/TopBar.vue`, `src/components/StatusBar.vue`
- Test: `src/components/StatusBar.spec.ts`, `e2e/*.spec.ts`（选中器随控件替换更新）

**Interfaces:**
- Consumes: Task 1/2 的主题
- Produces: `data-testid` 约定 —— 顶栏与状态栏中被 e2e 定位的元素加 `data-testid`：`search-input`、`tag-filter`、`btn-add`、`btn-check-all`、`btn-manage`、`btn-import-export`、`btn-settings`

- [ ] **Step 1: 更新 `StatusBar.spec.ts` 的选择器**

把依赖 `.statusbar` 内文本的断言保留（文本未变），若有用到样式类则改为 `data-testid` 或角色。

- [ ] **Step 2: 替换 `TopBar.vue` 的控件**

- 搜索框：`<input class="search">` → `n-input`，用 `#prefix` 插槽放 `Search` 图标
- 标签筛选：`<select class="btn">` → `n-select`，`options` 由 `store.data.tags` 生成
- 按钮：`检测全部` / `添加` → `n-button`（`type="primary"` 用于「添加」）；`管理` / `导入导出` / 设置图标 → `n-button quaternary`
- 每个控件加 Step 约定的 `data-testid`。注意 `n-input` / `n-select` 的根元素是包装 `div`，`data-testid` 会落在包装层，e2e 里用 `[data-testid="search-input"] input` 之类再下钻。

- [ ] **Step 3: 更新 e2e 选择器**

`e2e/*.spec.ts` 里凡是用 `.search`、`.btn`、`select`、`button` 文本定位的地方，改为 `data-testid` / `getByRole` / `getByText`。`e2e` 的选择器不得依赖样式类名。

- [ ] **Step 4: 运行测试**

Run: `npm test && npm run build && npx playwright test`
Expected: PASS

- [ ] **Step 5: 手动确认**

Run: `npm run dev`，Expected: 搜索、标签筛选、五个按钮功能与外观正常，暗色下一致。

- [ ] **Step 6: 提交**

Commit message: `refactor(ui): naive-ui controls in topbar and statusbar`

---

### Task 4: 通用弹窗迁移（批次 3，8 个外壳 + 2 个 dialog）

**Files:**
- Modify: `src/App.vue`, `src/components/AddEditModal.vue`, `ImportExportModal.vue`, `PickCategoryModal.vue`, `AddTagsModal.vue`, `AddCategoryModal.vue`, `SettingsModal.vue`, `src/components/CategoryNode.vue`, `ManageCategories.vue`, `ManageTags.vue`, `RecycleView.vue`
- Delete: `src/components/ModalMask.vue`, `src/components/ConfirmModal.vue`, `src/components/PromptModal.vue`
- Test: `src/components/AddEditModal.spec.ts`, `src/components/SettingsModal.spec.ts`, `e2e/site-management.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `n-config-provider` + `n-dialog-provider`
- Produces: `AddEditModal` / `ImportExportModal` / `PickCategoryModal` / `AddTagsModal` / `AddCategoryModal` / `SettingsModal` 的 props/emit **保持不变**

- [ ] **Step 1: 把 8 个弹窗外壳统一为 `n-modal`**

每个组件根节点改为：

```vue
<n-modal
  :show="true"
  preset="card"
  :title="..."
  to="body"
  :mask-closable="true"
  :close-on-esc="true"
  :trap-focus="true"
  :auto-focus="true"
  @update:show="emit('close')"
>
  <!-- 原 <slot /> 内容 -->
  <template #footer><!-- 原底部按钮区 --></template>
</n-modal>
```

- `to="body"` 必须显式写，与现有 `Teleport to="body"` 行为一致。
- `:show="true"` 保持父组件 `v-if` 控制挂载的模式。
- `@update:show` 必须转成 `close` 事件，否则遮罩点击 / Esc 关不掉。
- `SettingsModal` 一并转换（Task 5 只改它的内部结构，不再动外壳）。它当前内部的 `<h3>设置</h3>` 与 `n-modal` 的 `title` 重复，转换时删掉该 `h3`。
- 同时删除 `App.vue` 里这 8 个弹窗外层的 `<Transition name="mask">` 包裹（`n-modal` 自带过渡）。`main.css` 里的 `.modal-mask` / `.mask-enter-*` / `.modal` 系列 / `.grid2x2` 中只服务于旧弹窗的规则一并删除。

- [ ] **Step 2: `ConfirmModal` / `PromptModal` 改用 `useDialog`**

删除这两个组件，改用 `useDialog()`。调用点共 4 个文件：

| 文件 | 现状 | 改法 |
|---|---|---|
| `CategoryNode.vue` | `PromptModal`（重命名分类）、`ConfirmModal` | `const dialog = useDialog()`；`dialog.warning({ title, content, positiveText, negativeText, onPositiveClick })` |
| `ManageCategories.vue` | `ConfirmModal` | 同上 |
| `ManageTags.vue` | `PromptModal` ×2（重命名、合并） | 需要输入框：`content` 用 `h()` 渲染 `n-input`，`onPositiveClick` 里读该 `n-input` 的值 |
| `RecycleView.vue` | `ConfirmModal` ×2 | 同上；`type: 'error'` 对应原来的 `danger` 选项 |

映射规则：
- 原 `:options="[{ value:'ok', label, danger }, { value:'cancel', label:'取消' }]"` → `positiveText: label`、`negativeText: '取消'`；`danger: true` → `type: 'error'`，否则 `type: 'warning'`。
- 原 `message` / `hint` → `content`（`hint` 作为 `content` 里的第二段文字）。
- 原 `@choose` 的返回值 → `onPositiveClick`（返回 `Promise`，`false` 可阻止关闭；本项目的调用方不需要阻止，正常关闭即可）。
- 这些父组件必须位于 `n-dialog-provider` 内（`App.vue` 已挂载）。

- [ ] **Step 3: 更新 `AddEditModal.spec.ts`**

把 `document.body.querySelector('.btn.primary')` 改为 `getByRole('button', { name: '保存' })` 或 `[data-testid="btn-save"]`。为表单控件补 `data-testid`：`input-name`、`input-url`、`btn-fetch-title`、`textarea-note`、`btn-save`。文本输入框用 `document.body.querySelectorAll('input')` 的现有辅助函数仍然可用。

- [ ] **Step 4: 更新 `e2e/site-management.spec.ts`**

把 `.modal`、`.cb` 等选择器改为 `data-testid` / 角色 / 文本。

- [ ] **Step 5: 运行验证**

Run: `npm test && npm run build && npx playwright test`
Expected: 全绿；手动 `npm run dev` 确认 8 个弹窗的打开、Esc 关闭、遮罩点击关闭、焦点陷阱正常。

再确认一次 teleport 行为：打开「添加」弹窗，确认 `.n-modal-container` 挂在 `body` 下（不是 `.app` 内），且其内主按钮的颜色与主界面一致 —— 这条依赖 Task 1 的 `n-config-provider`。

- [ ] **Step 6: 提交**

Commit message: `refactor(ui): replace hand-rolled modals with n-modal`

---

### Task 5: 设置页（批次 4）

**Files:**
- Modify: `src/components/SettingsModal.vue`, `src/styles/main.css`（删除 `.settings-*` 与 `.palette-grid` 相关旧规则）
- Test: `src/components/SettingsModal.spec.ts`, `src/components/SettingsModal.updater.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `n-modal` 外壳
- Produces: 无新增对外接口；`Settings` 类型不变

- [ ] **Step 1: 内部结构改为 `n-tabs`**

`n-modal` 的默认插槽内用 `n-tabs placement="left" type="line"`，四个页签：主题、显示、数据存储、关于。删除 `.settings-layout` / `.settings-nav` / `.settings-body` 的自绘结构。

- [ ] **Step 2: 主题页**

- 主题模式 `<select>` → `n-select`。
- 配色网格：把组件里本地的 `palettes` 数组换成 `import { PALETTES } from '../theme'`，`p.color` → `p.light.primary`。保留自绘网格（它展示的是色块），但 `.palette-grid` / `.palette-swatch` 改用主题变量。

- [ ] **Step 3: 显示页**

`<input type="range">` → `n-slider`（带 `min`/`max`/`step`/`v-model`）。理由：`n-slider` 是 Naive 的规范控件，且能直接绑定数值，避免手动解析 `@input` 的字符串。在提交说明里写清选了 `n-slider`。

- [ ] **Step 4: 关于页**

- `.toggle` → `n-switch`
- `<progress>` → `n-progress`
- 其余 `<button class="btn primary">` → `n-button type="primary"`
- 删除 14 处静态内联 `style="..."`（改用类或 Naive 属性；动态数值如进度宽度除外）

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
- `main.css` 不再包含任何颜色值
- 11 套色板 × 亮/暗 手动切换正常
- 顶栏、状态栏、8 个弹窗、设置页全部使用 Naive 控件
- `ModalMask.vue` / `ConfirmModal.vue` / `PromptModal.vue` 已删除
