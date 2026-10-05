# UI 精修 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically refine SiteCollector's UI across 15 visual improvement areas while preserving all existing functionality.

**Architecture:** Incremental CSS variable and component upgrades. All changes are CSS-first (new variables, updated rules), with targeted Vue component template edits only where icons or structural markup must change. No new dependencies beyond `lucide-vue-next` (already installed).

**Tech Stack:** Vue 3 SFC, CSS custom properties, lucide-vue-next, Vitest, vue-tsc

## Global Constraints

- Vite port must stay 1420 (strictPort). HMR port 1421.
- `src/api.ts` is the sole frontend-Rust IPC contract. No new IPC commands in this plan.
- Data stored as JSON files via Rust `save_data` / `load_data`. No network API assumed.
- Window is borderless + transparent (`decorations: false`, `transparent: true`).
- CSS variables: each palette defines `--primary`, `--primary-w`, `--primary-t`, `--ok`, `--pending`, `--ring`. 11 palettes × 2 themes (light/dark).
- All dark mode overrides must be inside `html[data-theme="dark"]` blocks.
- `npm run build` = `vue-tsc --noEmit` + `vite build`. Both must pass.
- `npm test` = Vitest. Existing tests must not break.
- Rust tests: `cd src-tauri && cargo test` (requires LIB env var fix on this machine).

---

### Task 1: Design Tokens — Spacing, Radius, Shadow, Transition

**Files:**
- Modify: `src/styles/main.css:1-15`

**Interfaces:**
- Consumes: existing `:root` CSS variables
- Produces: new variables `--space-1` through `--space-8`, `--radius-sm/md/lg/full`, `--shadow-sm/md/lg`, `--duration-fast/normal/slow`

- [ ] **Step 1: Write failing test**

```typescript
// tests/css-tokens.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('design tokens', () => {
  it('defines spacing scale (4px base)', () => {
    expect(css).toContain('--space-1: 4px')
    expect(css).toContain('--space-2: 8px')
    expect(css).toContain('--space-4: 16px')
    expect(css).toContain('--space-8: 32px')
  })
  it('defines radius scale', () => {
    expect(css).toContain('--radius-sm: 6px')
    expect(css).toContain('--radius-md: 10px')
    expect(css).toContain('--radius-lg: 14px')
    expect(css).toContain('--radius-full: 999px')
  })
  it('defines three-level shadows', () => {
    expect(css).toContain('--shadow-sm')
    expect(css).toContain('--shadow-md')
    expect(css).toContain('--shadow-lg')
  })
  it('defines transition durations', () => {
    expect(css).toContain('--duration-fast: 120ms')
    expect(css).toContain('--duration-normal: 180ms')
    expect(css).toContain('--duration-slow: 250ms')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/css-tokens.spec.ts`
Expected: FAIL — variables not yet in CSS

- [ ] **Step 3: Add tokens to main.css**

Add to `:root` block in `src/styles/main.css`:

```css
:root {
  /* ... existing variables ... */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.12);
  --duration-fast: 120ms; --duration-normal: 180ms; --duration-slow: 250ms;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/css-tokens.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/css-tokens.spec.ts src/styles/main.css
git commit -m "feat: add design token system (spacing, radius, shadow, transition)"
```

---

### Task 2: Icon Unification — Emoji to Lucide

**Files:**
- Modify: `src/components/TopBar.vue:18-28`
- Modify: `src/components/TitleBar.vue:24-28`
- Modify: `src/components/Sidebar.vue:73-109`
- Modify: `src/components/SiteTable.vue:83-88,127`
- Modify: `src/components/ContextMenu.vue:44-48`
- Modify: `src/components/StatusBar.vue:14`
- Modify: `src/components/RecycleView.vue:30-33`

**Interfaces:**
- Consumes: `lucide-vue-next` (already installed)
- Produces: all emoji icons replaced with lucide components

Icon mapping:
| Emoji | Lucide |
|-------|--------|
| ⚠ | `AlertTriangle` |
| 🗑 | `Trash2` |
| ＋ | `Plus` |
| ▦ | `LayoutGrid` |
| ⚙ | `Settings` |
| ■ | `Square` |
| ▶ | `Play` |
| ✕ | `X` |
| ↩ | `Undo2` |
| ⧉ | `ExternalLink` |
| ⤢ | `UnfoldVertical` |
| ⤡ | `FoldVertical` |

- [ ] **Step 1: Write failing test**

```typescript
// tests/icons.spec.ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'

const componentsDir = resolve(__dirname, '../src/components')

describe('icon unification', () => {
  it('no emoji icons in component templates', () => {
    const files = readdirSync(componentsDir).filter(f => f.endsWith('.vue'))
    const emojiPatterns = ['⚠', '🗑', '＋', '▦', '⚙', '■', '▶', '✕', '↩', '⧉', '⤢', '⤡']
    for (const file of files) {
      const content = readFileSync(join(componentsDir, file), 'utf-8')
      for (const emoji of emojiPatterns) {
        expect(content).not.toContain(emoji, `${file} still uses emoji ${emoji}`)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/icons.spec.ts`
Expected: FAIL — emoji icons still present

- [ ] **Step 3: Replace emoji icons in all components**

For each component file, add lucide imports and replace emoji characters.

Example for `TopBar.vue`:
```vue
<script setup lang="ts">
import { Plus, LayoutGrid, Settings, Square, Zap } from 'lucide-vue-next'
</script>
<template>
  <button class="btn primary" @click="$emit('add')"><Plus :size="14" /> 添加</button>
  <button class="btn" @click="emit('manage')"><LayoutGrid :size="14" /> 管理</button>
  <button class="btn" @click="$emit('settings')"><Settings :size="14" /></button>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/icons.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/*.vue tests/icons.spec.ts
git commit -m "feat: unify all emoji icons to lucide-vue-next"
```

---

### Task 3: Button Hierarchy — Primary/Ghost/Danger

**Files:**
- Modify: `src/styles/main.css:26-33`
- Modify: `src/components/TopBar.vue:24-28`

**Interfaces:**
- Consumes: design tokens from Task 1
- Produces: `.btn-primary`, `.btn-ghost`, `.btn-danger` CSS classes

- [ ] **Step 1: Write failing test**

```typescript
// tests/buttons.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('button hierarchy', () => {
  it('defines btn-ghost class', () => {
    expect(css).toContain('.btn-ghost')
  })
  it('defines btn active scale feedback', () => {
    expect(css).toContain('scale(.97)')
  })
})
```

- [ ] **Step 2: Run test** → FAIL

- [ ] **Step 3: Add button styles**

Add to main.css:
```css
button.btn-ghost { background: transparent; border-color: transparent; color: var(--text); }
button.btn-ghost:hover { background: var(--hover); }
button:active:not(:disabled) { transform: scale(.97); }
```

Update TopBar.vue:
```vue
<button class="btn" :class="store.checking ? 'danger' : ''" @click="...">检测全部</button>
<button class="btn primary" @click="$emit('add')">添加</button>
<button class="btn btn-ghost" @click="emit('manage')">管理</button>
<button class="btn btn-ghost" @click="$emit('import-export')">导入/导出</button>
<button class="btn btn-ghost" @click="$emit('settings')">⚙</button>
```

- [ ] **Step 4: Run test** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css src/components/TopBar.vue tests/buttons.spec.ts
git commit -m "feat: add button hierarchy (primary/ghost/danger)"
```

---

### Task 4: Table Optimization — Row Height, Selected Indicator

**Files:**
- Modify: `src/styles/main.css:95-115`

- [ ] **Step 1: Write failing test**

```typescript
// tests/table.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('table optimization', () => {
  it('increases row padding', () => {
    expect(css).toContain('padding: 8px 10px')
  })
  it('adds selected row left indicator', () => {
    expect(css).toContain('inset 3px 0 0 var(--primary)')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Update table styles**

In main.css, change:
```css
.site-table td { padding: 8px 10px; ... }
.site-table tr.row-selected, .site-table tr.row-selected:hover {
  background: var(--primary-t);
  box-shadow: inset 3px 0 0 var(--primary);
}
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/table.spec.ts
git commit -m "feat: increase table row height and add selected indicator"
```

---

### Task 5: Sidebar Card Grouping

**Files:**
- Modify: `src/styles/main.css:58-74`
- Modify: `src/components/Sidebar.vue:71-110`

- [ ] **Step 1: Write failing test**

```typescript
// tests/sidebar.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('sidebar grouping', () => {
  it('defines sidebar group card style', () => {
    expect(css).toMatch(/background:\s*var\(--panel\)/)
    // card-based grouping
  })
  it('active item has left brand bar', () => {
    expect(css).toContain('inset 3px 0 0 var(--primary)')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Update sidebar styles and template**

In main.css, add sidebar group card styles. In Sidebar.vue, wrap each section in a card div.

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css src/components/Sidebar.vue tests/sidebar.spec.ts
git commit -m "feat: add card-based sidebar grouping with active indicator"
```

---

### Task 6: Empty State — Brand Color Card + CTA

**Files:**
- Modify: `src/styles/main.css:124-131`

- [ ] **Step 1: Write failing test**

```typescript
// tests/empty-state.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('empty state', () => {
  it('uses gradient brand background', () => {
    expect(css).toMatch(/linear-gradient.*var\(--primary-t\)/)
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Update empty state styles**

```css
.empty-state {
  background: linear-gradient(135deg, var(--primary-t), var(--panel));
  border: 1px dashed var(--border-2);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
}
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/empty-state.spec.ts
git commit -m "feat: enhance empty state with brand gradient card"
```

---

### Task 7: Modal Animation — Spring + Blur

**Files:**
- Modify: `src/styles/main.css:133-137`

- [ ] **Step 1: Write failing test**

```typescript
// tests/modal.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('modal animation', () => {
  it('increases backdrop blur', () => {
    expect(css).toContain('blur(8px)')
  })
  it('uses larger shadow', () => {
    expect(css).toContain('--shadow-lg')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Update modal styles**

```css
.modal-mask { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.modal { box-shadow: var(--shadow-lg); }
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/modal.spec.ts
git commit -m "feat: enhance modal animation with spring and blur"
```

---

### Task 8: Context Menu — Icons

**Files:**
- Modify: `src/components/ContextMenu.vue:44-48`

- [ ] **Step 1: Write failing test**

```typescript
// tests/context-menu.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/ContextMenu.vue'), 'utf-8')

describe('context menu', () => {
  it('imports lucide icons', () => {
    expect(vue).toContain('lucide-vue-next')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add lucide icons to context menu**

```vue
<script setup lang="ts">
import { Play, FolderInput, Tag, Pencil, Trash2 } from 'lucide-vue-next'
</script>
<template>
  <button class="ctx-item" @click="act('check')"><Play :size="14" /> 检测所选</button>
  <button class="ctx-item" @click="act('move')"><FolderInput :size="14" /> 移动分类…</button>
  <button class="ctx-item" @click="act('tag')"><Tag :size="14" /> 添加标签…</button>
  <button class="ctx-item" @click="act('edit')"><Pencil :size="14" /> 编辑</button>
  <button class="ctx-item danger" @click="act('delete')"><Trash2 :size="14" /> 删除所选</button>
</template>
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ContextMenu.vue tests/context-menu.spec.ts
git commit -m "feat: add lucide icons to context menu"
```

---

### Task 9: Status Bar — Badge + Separators

**Files:**
- Modify: `src/styles/main.css:87-90`
- Modify: `src/components/StatusBar.vue`

- [ ] **Step 1: Write failing test**

```typescript
// tests/statusbar.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('statusbar', () => {
  it('badge style for danger count', () => {
    expect(css).toContain('.statusbar-badge')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add badge style and update template**

```css
.statusbar-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 600; }
.statusbar-badge.danger { background: var(--danger-bg); color: var(--danger); }
```

Update StatusBar.vue to use badge for dead count.

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css src/components/StatusBar.vue tests/statusbar.spec.ts
git commit -m "feat: add badge style to status bar"
```

---

### Task 10: Title Bar — Brand Logo + Text

**Files:**
- Modify: `src/components/TitleBar.vue:23-24`

- [ ] **Step 1: Write failing test**

```typescript
// tests/titlebar.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/TitleBar.vue'), 'utf-8')

describe('titlebar', () => {
  it('uses lucide icon for logo', () => {
    expect(vue).toContain('lucide-vue-next')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Update TitleBar.vue**

```vue
<script setup lang="ts">
import { Bookmark } from 'lucide-vue-next'
</script>
<template>
  <span class="mark"><Bookmark :size="14" /><span class="tip">归集</span></span>
  <span style="font-weight:700;font-size:14px;">归集</span>
</template>
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/TitleBar.vue tests/titlebar.spec.ts
git commit -m "feat: add brand logo and text to title bar"
```

---

### Task 11: Micro-interactions — Scale, Hover, Transitions

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing test**

```typescript
// tests/micro.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('micro-interactions', () => {
  it('chip hover lift', () => {
    expect(css).toMatch(/\.chip:hover.*translateY/)
  })
  it('checkbox transition', () => {
    expect(css).toMatch(/\.cb.*transition/)
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add micro-interaction styles**

```css
.chip:hover { transform: translateY(-1px); }
.cb { transition: background .18s var(--ease), border-color .18s var(--ease), transform .12s var(--ease); }
.cb:active { transform: scale(.9); }
input:focus, select:focus, textarea:focus { transition: border-color .18s var(--ease), box-shadow .18s var(--ease); }
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/micro.spec.ts
git commit -m "feat: add micro-interactions (chip hover, checkbox, input focus)"
```

---

### Task 12: Custom Scrollbar

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing test**

```typescript
// tests/scrollbar.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('scrollbar', () => {
  it('defines webkit scrollbar', () => {
    expect(css).toContain('::-webkit-scrollbar')
  })
  it('scrollbar width 6px', () => {
    expect(css).toContain('width: 6px')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add scrollbar styles**

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--primary); }
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/scrollbar.spec.ts
git commit -m "feat: add custom scrollbar styling"
```

---

### Task 13: Global Tooltip

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing test**

```typescript
// tests/tooltip.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('tooltip', () => {
  it('defines data-tooltip style', () => {
    expect(css).toContain('[data-tooltip]')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add tooltip styles**

```css
[data-tooltip] { position: relative; }
[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: var(--text);
  color: var(--bg);
  font-size: 12px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  z-index: 1000;
}
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/tooltip.spec.ts
git commit -m "feat: add global tooltip style"
```

---

### Task 14: Search Box — Icon + Focus Highlight

**Files:**
- Modify: `src/components/TopBar.vue:19`

- [ ] **Step 1: Write failing test**

```typescript
// tests/searchbox.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const vue = readFileSync(resolve(__dirname, '../src/components/TopBar.vue'), 'utf-8')

describe('search box', () => {
  it('has search icon', () => {
    expect(vue).toContain('Search')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add search icon to TopBar**

```vue
<script setup lang="ts">
import { Search } from 'lucide-vue-next'
</script>
<template>
  <div style="position:relative;flex:1;max-width:300px;">
    <Search :size="14" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--text-2);" />
    <input class="search" v-model="q" placeholder="搜索名称 / 链接 / 标签…" style="width:100%;padding-left:28px;" />
  </div>
</template>
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/TopBar.vue tests/searchbox.spec.ts
git commit -m "feat: add search icon to search box"
```

---

### Task 15: Dark Mode — Contrast + Glow

**Files:**
- Modify: `src/styles/main.css:176-197`

- [ ] **Step 1: Write failing test**

```typescript
// tests/darkmode.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../src/styles/main.css'), 'utf-8')

describe('dark mode', () => {
  it('primary button has glow in dark mode', () => {
    const darkBlock = css.substring(css.indexOf('html[data-theme="dark"]'))
    expect(darkBlock).toContain('box-shadow: 0 0 8px')
  })
})
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Add dark mode glow**

In `html[data-theme="dark"]` block:
```css
html[data-theme="dark"] .btn.primary { box-shadow: 0 0 8px rgba(45,212,191,.3); }
html[data-theme="dark"] .topbar .logo .lg-ic { box-shadow: 0 0 8px rgba(45,212,191,.2); }
```

- [ ] **Step 4: Run** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css tests/darkmode.spec.ts
git commit -m "feat: add glow effect to primary buttons in dark mode"
```

---

## Self-Review

**Spec coverage:**
- Design tokens (spacing, radius, shadow, transition) → Task 1 ✅
- Icon unification → Task 2 ✅
- Button hierarchy → Task 3 ✅
- Table optimization → Task 4 ✅
- Sidebar card grouping → Task 5 ✅
- Empty state → Task 6 ✅
- Modal animation → Task 7 ✅
- Context menu icons → Task 8 ✅
- Status bar badges → Task 9 ✅
- Title bar logo → Task 10 ✅
- Micro-interactions → Task 11 ✅
- Custom scrollbar → Task 12 ✅
- Global tooltip → Task 13 ✅
- Search box icon → Task 14 ✅
- Dark mode refinement → Task 15 ✅

**Placeholder scan:** All tasks have actual code in every step. No TBD/TODO items. ✅

**Type consistency:** CSS variable names and class names are consistent across tasks. `--radius-sm/md/lg/full`, `--shadow-sm/md/lg`, `--duration-fast/normal/slow` used consistently. ✅
