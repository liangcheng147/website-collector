# 组件风格统一 + 设置页面重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一应用中所有组件的视觉规范（开关、按钮、输入框、标签、弹窗），并将设置弹窗从 Tab 模式改为左侧导航 + 右侧内容模式。

**Architecture:** 在 `main.css` 中新增 Toggle 组件样式并统一现有组件规范，然后重构 `SettingsModal.vue` 为左右分栏布局，最后逐个对齐其他弹窗的组件样式。

**Tech Stack:** Vue 3 + TypeScript + 自定义 CSS（CSS 变量设计系统）

## Global Constraints

- 保持现有青绿色系（`--primary: #0D9488`）
- 保持现有字体/字号/动画曲线
- 所有弹窗使用统一的 `.modal` 容器类
- 按钮高度 36px、圆角 8px、padding 0 14px
- 输入框高度 36px、圆角 8px、padding 0 10px
- 开关 44×24px、圆角 12px
- 标签圆角 999px、padding 2px 10px、字号 12px
- 弹窗 padding 20px、圆角 14px
- 焦点态 3px `var(--ring)`

---

### Task 1: 在 main.css 中新增 Toggle 组件样式并统一按钮/输入框/标签规范

**Files:**
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: 现有 CSS 变量（`--primary`, `--border-2`, `--ring`, `--ease`, `--duration-normal`）
- Produces: `.toggle` 组件类、统一后的 `.btn` / `input` / `select` / `.chip` / `.modal` 样式

- [ ] **Step 1: 在 main.css 末尾添加 Toggle 组件样式**

在 `src/styles/main.css` 文件末尾（`[data-tooltip]` 规则之后）添加：

```css
/* ---- 开关 (Toggle) ---- */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--border-2);
  cursor: pointer;
  transition: background var(--duration-normal) var(--ease);
  flex-shrink: 0;
  border: none;
  padding: 0;
}
.toggle::after {
  content: "";
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  top: 2px;
  left: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,.15);
  transition: transform var(--duration-normal) var(--ease);
}
.toggle.checked {
  background: var(--primary);
}
.toggle.checked::after {
  transform: translateX(20px);
}
.toggle:active::after {
  width: 22px;
}
```

- [ ] **Step 2: 统一按钮样式**

在 `src/styles/main.css` 中找到 `button { ... }` 规则（第 37 行），将 `padding:5px 12px` 改为 `padding:0 14px; height:36px; display:inline-flex; align-items:center;`：

```css
button { font-family:var(--font); font-size:13px; font-weight:500; border:1px solid var(--border-2); background:#fff; border-radius:var(--radius); padding:0 14px; height:36px; display:inline-flex; align-items:center; color:var(--text); cursor:pointer; transition:background .16s var(--ease), border-color .16s var(--ease), color .16s var(--ease), transform .08s var(--ease), box-shadow .16s var(--ease); }
```

- [ ] **Step 3: 统一样式输入框/下拉框**

在 `src/styles/main.css` 中找到 `input, select, textarea { ... }` 规则（第 47 行），将 `padding:5px 10px` 改为 `padding:0 10px; height:36px;`：

```css
input, select, textarea { font-family:var(--font); font-size:13px; border:1px solid var(--border-2); border-radius:var(--radius); padding:0 10px; height:36px; background:#fff; color:var(--text); transition:border-color .16s var(--ease), box-shadow .16s var(--ease); }
```

- [ ] **Step 4: 统一标签/Chip 样式**

在 `src/styles/main.css` 中找到 `.chip { ... }` 规则（第 135 行），将 `padding:1px 9px` 改为 `padding:2px 10px;`：

```css
.chip { display:inline-flex; align-items:center; background:var(--primary-t); color:var(--primary); border-radius:var(--radius-pill); padding:2px 10px; font-size:12px; font-weight:500; margin-right:4px; line-height:1.6; }
```

- [ ] **Step 5: 统一弹窗 padding**

在 `src/styles/main.css` 中找到 `.modal { ... }` 规则（第 157 行），将 `padding:18px 20px` 改为 `padding:20px;`：

```css
.modal { background:#fff; border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); padding:20px; width:min(520px,92%); max-height:calc(100% - 32px); overflow:auto; }
```

- [ ] **Step 6: 运行测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/styles/main.css
git commit -m "style: add toggle component and unify button/input/chip/modal specs"
```

---

### Task 2: 重构 SettingsModal 为左侧导航 + 右侧内容模式

**Files:**
- Modify: `src/components/SettingsModal.vue`

**Interfaces:**
- Consumes: `ModalMask` 组件、`store.settings`、`updater` 模块
- Produces: 新的设置弹窗布局（左侧导航 + 右侧内容）

- [ ] **Step 1: 修改 SettingsModal.vue 的 template 结构**

将 `<template>` 中的内容替换为左右分栏布局。将现有的 `<div class="seg">` 替换为左侧导航，将内容区域包裹在右侧容器中：

```html
<template>
  <ModalMask @close="emit('close')">
    <div class="modal settings-layout">
      <h3>设置</h3>
      <div class="settings-body">
        <nav class="settings-nav">
          <button class="settings-nav-item" :class="{ active: section === 'theme' }" @click="section = 'theme'">主题</button>
          <button class="settings-nav-item" :class="{ active: section === 'display' }" @click="section = 'display'">显示</button>
          <button class="settings-nav-item" :class="{ active: section === 'storage' }" @click="section = 'storage'">数据存储</button>
          <button class="settings-nav-item" :class="{ active: section === 'about' }" @click="section = 'about'">关于</button>
        </nav>
        <div class="settings-content">
          <!-- 主题 -->
          <template v-if="section === 'theme'">
            <label>主题模式</label>
            <select :value="store.settings.theme" @change="setTheme(($event.target as HTMLSelectElement).value)">
              <option value="system">跟随系统</option>
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
            </select>
            <p class="muted">跟随系统：启动时读取系统主题，运行中不实时切换。</p>
            <label style="margin-top:14px">配色方案</label>
            <div class="palette-grid">
              <button
                v-for="p in palettes"
                :key="p.id"
                class="palette-swatch"
                :class="{ active: store.settings.palette === p.id }"
                :style="{ '--swatch-color': p.color }"
                :title="p.name"
                @click="setPalette(p.id)"
              >
                <span class="palette-dot"></span>
                <span class="palette-name">{{ p.name }}</span>
              </button>
            </div>
          </template>

          <!-- 显示 -->
          <template v-else-if="section === 'display'">
            <label>界面缩放（{{ store.settings.zoom }}%）</label>
            <div class="slider-row">
              <span style="font-size:12px" class="muted">80%</span>
              <input type="range" min="80" max="200" step="10" :value="store.settings.zoom" @input="onZoom" style="flex:1" />
              <span style="font-size:12px" class="muted">200%</span>
            </div>
            <p class="muted">整体放大或缩小界面文字与控件，步进 10%。</p>
          </template>

          <!-- 数据存储 -->
          <template v-else-if="section === 'storage'">
            <div class="modal-cols">
              <div>
                <label>数据文件</label>
                <input :value="filePath" readonly />
                <div class="actions" style="justify-content:flex-start"><button class="btn primary" @click="openDir">打开数据目录</button></div>
              </div>
              <div class="help">
                <label>存储说明</label>
                <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
                <p v-if="store.location.isFallback" class="muted" style="color:var(--pending-txt)"><AlertTriangle :size="12" /> 当前正使用系统目录（安装位置无写入权限）。</p>
              </div>
            </div>
          </template>

          <!-- 关于 -->
          <template v-else-if="section === 'about'">
            <label>软件</label>
            <p>SiteCollector v{{ appVersion }}</p>
            <label style="margin-top:14px">链接</label>
            <p class="muted"><a @click.prevent="api.openLink('https://github.com/liangcheng147/website-collector')">GitHub 仓库</a> · 作者 bjb · MIT License</p>
            <label style="margin-top:14px">更新</label>
            <div class="actions" style="justify-content:flex-start">
              <button class="btn primary" :disabled="updateState === 'checking' || updateState === 'downloading'" @click="checkNow">检查更新</button>
            </div>
            <p v-if="updateState === 'checking'" class="muted">检查中…</p>
            <p v-else-if="updateState === 'none'" class="muted">{{ updateMsg }}</p>
            <div v-else-if="updateState === 'available' && updateInfo">
              <p>发现新版本 v{{ updateInfo.version }}</p>
              <p class="muted" style="white-space:pre-wrap">{{ updateInfo.body }}</p>
              <button class="btn primary" @click="installNow">下载并安装</button>
            </div>
            <div v-else-if="updateState === 'downloading'">
              <template v-if="downloadKnown">
                <p class="muted">下载中 {{ downloadPct }}%</p>
                <progress :value="downloadPct" max="100" style="width:100%"></progress>
              </template>
              <p v-else class="muted">下载中…</p>
            </div>
            <div v-else-if="updateState === 'ready'">
              <p>已下载完成，重启后生效。</p>
              <button class="btn primary" @click="doRelaunch">立即重启</button>
            </div>
            <p v-else-if="updateState === 'error'" class="muted">{{ updateMsg }}</p>
            <label style="margin-top:14px" class="toggle-row">
              <span class="toggle" :class="{ checked: store.settings.autoCheckUpdate }" @click="toggleAutoCheck"></span>
              启动时自动检查更新
            </label>
            <label style="margin-top:14px">技术信息</label>
            <p class="muted">{{ userAgent }}</p>
          </template>

          <p class="muted">{{ msg }}</p>
          <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
        </div>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 2: 修改 toggleAutoCheck 方法**

将 `toggleAutoCheck` 方法改为：

```ts
function toggleAutoCheck() {
  store.updateSettings({ autoCheckUpdate: !store.settings.autoCheckUpdate })
}
```

- [ ] **Step 3: 在 main.css 中添加设置布局样式**

在 `src/styles/main.css` 中添加：

```css
/* ---- 设置弹窗布局 ---- */
.settings-layout {
  width: min(640px, 92%);
  height: 480px;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.settings-layout h3 {
  padding: 18px 20px 0;
  margin-bottom: 0;
}
.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.settings-nav {
  width: 140px;
  flex-shrink: 0;
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-nav-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  border-radius: 0;
  height: auto;
  transition: background .15s var(--ease), color .15s var(--ease);
}
.settings-nav-item:hover {
  background: var(--hover);
  color: var(--text);
}
.settings-nav-item.active {
  background: var(--primary-t);
  color: var(--primary);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--primary);
}
.settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 20px;
}
.settings-content label:first-child {
  margin-top: 0;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
```

- [ ] **Step 4: 运行测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.vue src/styles/main.css
git commit -m "feat: restructure settings modal to sidebar navigation layout"
```

---

### Task 3: 统一其他弹窗的按钮和输入框样式

**Files:**
- Modify: `src/components/AddEditModal.vue`
- Modify: `src/components/ImportExportModal.vue`
- Modify: `src/components/ConfirmModal.vue`
- Modify: `src/components/PromptModal.vue`

**Interfaces:**
- Consumes: Task 1 中统一的 `.btn` / `input` / `select` 样式
- Produces: 视觉一致的弹窗组件

- [ ] **Step 1: 检查 AddEditModal.vue**

`AddEditModal.vue` 已经使用 `.btn` 和 `.modal` 类，Task 1 的样式统一会自动生效。确认 `class="btn small"` 按钮在 36px 高度下看起来正常（small 按钮覆盖高度为 32px）。

在 `src/styles/main.css` 中找到 `.btn.small` 规则，将 `padding: 4px 10px` 改为 `padding: 0 10px; height: 32px;`：

```css
.btn.small { padding: 0 10px; height: 32px; font-size: 12px; white-space: nowrap; }
```

- [ ] **Step 2: 检查 ImportExportModal.vue**

确认使用 `.btn` 和 `.modal` 类，样式统一自动生效。

- [ ] **Step 3: 检查 ConfirmModal.vue**

确认使用 `.btn` 和 `.modal` 类，样式统一自动生效。

- [ ] **Step 4: 检查 PromptModal.vue**

确认使用 `.btn` 和 `.modal` 类，样式统一自动生效。

- [ ] **Step 5: 运行测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/styles/main.css src/components/AddEditModal.vue src/components/ImportExportModal.vue src/components/ConfirmModal.vue src/components/PromptModal.vue
git commit -m "style: unify button and input styles across all modals"
```

---

### Task 4: 统一 TagInput 标签样式

**Files:**
- Modify: `src/components/TagInput.vue`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: Task 1 中统一的 `.chip` 样式
- Produces: 视觉一致的标签输入组件

- [ ] **Step 1: 统一 TagInput 中的 chip 样式**

在 `src/styles/main.css` 中找到 `.tag-input-wrap .chip` 规则（第 274 行），将 `border-radius: 6px; padding: 1px 6px;` 改为 `border-radius: var(--radius-pill); padding: 2px 10px;`：

```css
.tag-input-wrap .chip { display: inline-flex; align-items: center; gap: 4px; background: var(--primary-t); color: var(--primary); border-radius: var(--radius-pill); padding: 2px 10px; font-size: 12px; }
```

- [ ] **Step 2: 运行测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 3: Commit**

```bash
git add src/styles/main.css src/components/TagInput.vue
git commit -m "style: unify tag chip styles"
```

---

### Task 5: 最终验证

**Files:**
- N/A

**Interfaces:**
- Consumes: 所有前序任务
- Produces: 完整的组件风格统一

- [ ] **Step 1: 运行完整测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 2: 运行类型检查 + 构建**

Run: `npm run build`
Expected: 类型检查通过，构建成功

- [ ] **Step 3: 手动验证清单**

- [ ] 设置弹窗：左侧导航 + 右侧内容，固定高度 480px
- [ ] 设置弹窗：复选框已改为 Toggle 开关
- [ ] 所有弹窗按钮：高度 36px，圆角 8px
- [ ] 所有输入框：高度 36px，圆角 8px
- [ ] 所有标签：pill 形，padding 2px 10px
- [ ] 所有弹窗：padding 20px
- [ ] 焦点态：3px ring 一致

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "style: final verification fixes"
```
