# 归集 · 青绿色高级感风格 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅刷新「归集」前端视觉风格为青绿色高级感（teal #0D9488 + 橙色强调 #EA580C），不改变任何功能、结构、布局、内容、窗口属性或图标。

**Architecture:** 改动集中在单一文件 `src/styles/main.css` 的设计令牌（CSS 自定义属性）层。绝大多数组件已通过 `var(--…)` 引用令牌，更新令牌值即自动换肤；仅 `.app` 背景渐变与 `.empty::before` 阴影两处写死了旧靛蓝色相，需同步替换为 teal 透明色。无任何 DOM/结构/逻辑变更。

**Tech Stack:** Vue 3 + Vite + 原生 CSS 自定义属性（无 CSS 框架）。验证用 `npm run build`（含 `vue-tsc --noEmit`）+ Vitest + 手动视觉抽查。

## Global Constraints

- 仅风格层改动；**禁止**任何功能、交互逻辑、数据结构、IPC 命令变更。
- **禁止**任何组件结构、DOM 层级、布局（栅格/定位/间距分布）变更。
- **禁止**修改 `src-tauri/`、`src/api.ts`、窗口属性（`decorations`/`transparent`/标题栏拖拽区）。
- **禁止**引入 SVG 图标集或替换现有文本符号；**禁止**增删文案/字段。
- 唯一改动文件：`src/styles/main.css`。
- 令牌精确值见 spec `docs/superpowers/specs/2026-08-28-teal-premium-style-design.md` 第 3 节，须逐字一致。
- 改动后 `npm run build` 与现有 66 项 `npm test` 必须全绿（纯展示改动不应影响逻辑测试）。

---

### Task 1: 更新浅色令牌 `:root`

**Files:**
- Modify: `src/styles/main.css:1-14`（`:root { … }` 块）

**Interfaces:**
- Consumes: 无
- Produces: 更新后的浅色 CSS 变量，供全局组件经 `var(--…)` 消费

- [ ] **Step 1: 替换 `:root` 块为新青绿色令牌**

将 `main.css` 第 1–14 行整块替换为：

```css
:root {
  --bg:#F6F9F8; --panel:#FFFFFF;
  --primary:#0D9488; --primary-w:#0F766E; --primary-t:#CCFBF1;
  --accent:#EA580C; --accent-on:#FFFFFF;
  --text:#0F2E2A; --text-2:#5B7A76; --border:#D8EBE7; --border-2:#C3DED9; --hover:#EEF5F3;
  --ok:#15A34A; --ok-txt:#14833E; --pending:#E08A00; --pending-txt:#A8660A; --danger:#DC2626; --danger-txt:#C02424;
  --danger-bg:#FDF1F1; --danger-bd:#F2C9C9;
  --radius:8px; --radius-lg:14px; --radius-pill:999px;
  --shadow:0 1px 2px rgba(13,60,55,.05); --shadow-md:0 14px 40px rgba(13,60,55,.12);
  --ring:0 0 0 3px rgba(13,148,136,.30);
  --font:"Geist Variable","Segoe UI",-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  --mono:"Geist Variable Mono",Consolas,"Cascadia Mono",monospace;
  --ease:cubic-bezier(.2,.7,.3,1);
  --titlebar-h:38px; --win-radius:10px;
}
```

- [ ] **Step 2: 验证旧色已移除、新色已就位**

Run: `grep -n "3B5BDB\|2F4AC4\|EBF0FF" src/styles/main.css`
Expected: 无匹配（旧浅色令牌已消失）。

- [ ] **Step 3: 构建与测试门禁**

Run: `npm run build && npm test`
Expected: `vue-tsc` 无错、Vite 构建成功；Vitest 66 项全 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/styles/main.css
git commit -m "style: 青绿色主题·浅色令牌"
```

---

### Task 2: 更新深色令牌 `html[data-theme="dark"]`

**Files:**
- Modify: `src/styles/main.css:164-181`（`html[data-theme="dark"] { … }` 起始块，至 `--ring` 行）

**Interfaces:**
- Consumes: 无
- Produces: 更新后的深色 CSS 变量

- [ ] **Step 1: 替换深色令牌块**

将 `html[data-theme="dark"]` 内的令牌声明（原行 165–170 区域）替换为：

```css
  --bg:#0B1413; --panel:#12201E;
  --primary:#2DD4BF; --primary-w:#14B8A6; --primary-t:#10302C;
  --accent:#FB923C; --accent-on:#1A0E05;
  --text:#E6F0EE; --text-2:#93ADA8; --border:#1E3330; --border-2:#294742; --hover:#162624;
  --ok:#4ADE80; --ok-txt:#5BE38C; --pending:#FBBF24; --pending-txt:#FBC74A; --danger:#F87171; --danger-txt:#F88383; --danger-bg:#2A1D1D; --danger-bd:#4A2A2A;
  --hover:#162624; --ring:0 0 0 3px rgba(45,212,191,.32);
```

> 保留该块内其余规则（如 `color-scheme:dark`、`button:not(.primary){background:var(--bg)}`、`.modal`/`.cb`/`.ctx`/`.btn.primary` 的覆盖）不变。原文件在深色块中对 `--hover` 有重复声明，合并为上面单行即可。

- [ ] **Step 2: 验证旧深色令牌已移除**

Run: `grep -n "6B8AFF\|4A6CF7\|232A45\|107,138,255" src/styles/main.css`
Expected: 无匹配。

- [ ] **Step 3: 构建与测试门禁**

Run: `npm run build && npm test`
Expected: 构建成功；66 项测试全 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/styles/main.css
git commit -m "style: 青绿色主题·深色令牌"
```

---

### Task 3: 修正写死的旧靛蓝色相

**Files:**
- Modify: `src/styles/main.css:38`（`.app` 径向渐变）
- Modify: `src/styles/main.css:124`（`.empty::before` 阴影）

**Interfaces:**
- Consumes: 无
- Produces: 全文件不再残留旧靛蓝色相，视觉在透明窗口下一致

- [ ] **Step 1: 修正 `.app` 背景渐变**

将原 `rgba(59,91,219,.05)` 改为 `rgba(13,148,136,.05)`：

```css
  radial-gradient(120% 80% at 50% -20%, rgba(13,148,136,.05), transparent 60%),
```

- [ ] **Step 2: 修正 `.empty::before` 内阴影**

将原 `rgba(59,91,219,.10)` 改为 `rgba(13,148,136,.10)`：

```css
.empty::before { content:""; width:38px; height:38px; border-radius:11px; background:var(--primary-t); margin-bottom:4px; box-shadow:inset 0 0 0 1px rgba(13,148,136,.10); }
```

- [ ] **Step 3: 全文件旧色总校验**

Run: `grep -rn "3B5BDB\|2F4AC4\|EBF0FF\|6B8AFF\|4A6CF7\|232A45\|59,91,219\|107,138,255" src/styles/main.css`
Expected: 无任何匹配（三重旧色全部清除）。

- [ ] **Step 4: 构建与测试门禁**

Run: `npm run build && npm test`
Expected: 构建成功；66 项测试全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/styles/main.css
git commit -m "style: 清除残留旧靛蓝色相（渐变/空态）"
```

---

### Task 4: 全量验证与视觉抽查

**Files:**
- 无新增/修改（仅验证）

**Interfaces:**
- Consumes: 前三任务产出的令牌与修正
- Produces: 验收结论

- [ ] **Step 1: 构建 + 全测试**

Run: `npm run build && npm test`
Expected: 构建成功；66 项测试全 PASS。

- [ ] **Step 2: 浅色主题视觉抽查（浏览器快速预览）**

Run: `npm run dev`（Vite 浏览器预览，invoke 已桩接）
Expected: 标题栏/侧栏/表格/弹窗/管理页/标签输入/上下文菜单均呈青绿色调；主色 teal、关键 CTA 橙；布局/功能与改动前一致。

- [ ] **Step 3: 深色主题视觉抽查**

在预览中切换 `data-theme="dark"`（或应用内主题开关）
Expected: 深青黑底 + 亮 teal 主色；对比度正常。

- [ ] **Step 4: 便携版最终抽查（可选但推荐）**

按 `AGENTS.md` 的 LIB  workaround 构建便携 exe（`cmd /c "call VsDevCmd.bat -arch=amd64 && set LIB=…onecore\x64… && npm run tauri build"`），运行 `src-tauri\target\release\website-collector.exe` 在真实透明窗口下确认浅/深主题观感。
Expected: 透明窗口下青绿色调正常，无旧靛蓝残留。

- [ ] **Step 5: 提交说明（无代码改动则不提交）**

若 Step 1–4 仅验证通过、无新改动，则无需提交；在 PR/进度中记录验收结论即可。

---

## 自检备注（计划作者）

- 规格覆盖：spec 第 3 节浅/深令牌 → Task 1/2；spec 第 4 节写死色相 → Task 3；验收 → Task 4。无遗漏。
- 无占位符：所有步骤均含确切替换值与可执行命令。
- 类型一致性：纯 CSS 令牌，无函数/类型名跨任务不一致风险。
- 严格守住「只改风格」：每个 Task 仅触及 `main.css` 颜色/令牌值，未动选择器结构、`padding`/`margin` 布局语义、DOM、`.vue`/`.ts`/`src-tauri`。
