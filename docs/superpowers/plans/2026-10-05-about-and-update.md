# 关于页与 GitHub 更新系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置弹窗新增「关于」分段（基本信息/链接与作者/更新入口/技术信息/自动检查开关），并接入 tauri-plugin-updater 实现应用内更新。

**Architecture:** 官方 updater 插件（Rust 注册 + JS 调用），前端新建 `src/updater.ts` 薄封装便于测试 mock；`autoCheckUpdate` 设置经 `settings.json` 持久化；CI 通过签名密钥 secret 让 tauri-action 自动产出 `latest.json`。

**Tech Stack:** Tauri 2, Vue 3 + Pinia, TypeScript, tauri-plugin-updater 2, tauri-plugin-process 2, Vitest.

## Global Constraints

- Vite 固定端口 1420（strictPort），不要改 `vite.config.ts`。
- `src/api.ts` 是前端与 Rust 的唯一契约；但 updater 是官方插件 API，不经 `invoke`，走 `src/updater.ts`。
- `Settings` 前后端字段必须同步（`src/types.ts` ↔ `src-tauri/src/settings.rs`），serde 用 camelCase。
- capabilities 新增权限要登记到 `src-tauri/capabilities/default.json`。
- Windows 本地跑 cargo 前需把 `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\lib\onecore\x64` 加入 `LIB` 环境变量，否则 LNK1181。
- 不要把私钥提交进仓库；`TAURI_SIGNING_PRIVATE_KEY` 走 GitHub Secrets。
- 无边框透明窗口：新 UI 走现有 CSS 变量体系，不引入新样式框架。

---

### Task 1: Rust 依赖与插件注册

**Files:**
- Modify: `src-tauri/Cargo.toml:20-30`
- Modify: `src-tauri/src/lib.rs:16-49`
- Modify: `src-tauri/capabilities/default.json:6-11`
- Modify: `src-tauri/tauri.conf.json:30-45`

**Interfaces:**
- Produces: Rust 侧 updater/process 插件已注册，前端可调用 `@tauri-apps/plugin-updater` 与 `@tauri-apps/plugin-process`。

- [ ] **Step 1: 编辑 Cargo.toml**

在 `[dependencies]` 追加：

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 2: 编辑 lib.rs**

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
```

- [ ] **Step 3: 编辑 capabilities/default.json**

```json
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "opener:default",
    "dialog:default",
    "updater:default",
    "process:allow-relaunch"
  ]
```

- [ ] **Step 4: 编辑 tauri.conf.json**

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    ...
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/liangcheng147/website-collector/releases/latest/download/latest.json"],
      "pubkey": "<SIGNING_PUBLIC_KEY>"
    }
  }
```

- [ ] **Step 5: 生成签名密钥对**

Run: `npx tauri signer generate -w ~/.tauri/site-collector.key`
把公钥替换 `tauri.conf.json` 中 `<SIGNING_PUBLIC_KEY>`；私钥与密码存本地安全位置，稍后放 GitHub Secrets。

- [ ] **Step 6: 验证 Rust 编译**

Run（先设置 LIB 环境变量，见 Global Constraints）:
`$env:LIB = "$env:LIB;C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\lib\onecore\x64"; cd src-tauri; cargo check`
Expected: 编译成功，无 updater/process 相关报错。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json
git commit -m "feat: register updater and process plugins"
```

### Task 2: Settings 新增 autoCheckUpdate（Rust）

**Files:**
- Modify: `src-tauri/src/settings.rs:5-21`
- Test: `src-tauri/src/settings.rs:46-141`

**Interfaces:**
- Produces: `Settings.auto_check_update: bool`（serde camelCase → `autoCheckUpdate`），旧 settings.json 缺字段时默认 `true`。

- [ ] **Step 1: 写失败测试**

在 `mod tests` 中追加：

```rust
#[test]
fn missing_auto_check_update_defaults_true() {
    let d = tmp_dir("auto_check_missing");
    fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
    let s = load_settings(&d);
    assert!(s.auto_check_update);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn auto_check_update_roundtrip() {
    let d = tmp_dir("auto_check_roundtrip");
    let mut s = Settings::defaults();
    s.auto_check_update = false;
    save_settings(&d, &s).unwrap();
    assert!(!load_settings(&d).auto_check_update);
    let _ = fs::remove_dir_all(&d);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri; cargo test settings::`
Expected: FAIL（`auto_check_update` 字段不存在）。

- [ ] **Step 3: 实现**

```rust
#[serde(default)] pub theme: String,
#[serde(default = "default_palette")] pub palette: String,
#[serde(default)] pub zoom: u32,
#[serde(default)] pub sidebar_collapsed: Vec<String>,
#[serde(default)] pub collapsed_categories: Vec<String>,
#[serde(default = "default_true")] pub auto_check_update: bool,

fn default_true() -> bool { true }
```

并在 `Settings::defaults()` 中加 `auto_check_update: true`。

- [ ] **Step 4: 测试通过**

Run: `cd src-tauri; cargo test settings::`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/settings.rs
git commit -m "feat: add auto_check_update setting"
```

### Task 3: Settings 类型与 store 默认值（前端）

**Files:**
- Modify: `src/types.ts:7-13`
- Modify: `src/store/app.ts:55`

**Interfaces:**
- Produces: `Settings.autoCheckUpdate: boolean`；store 默认 `autoCheckUpdate: true`。

- [ ] **Step 1: 编辑 types.ts**

```ts
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  palette: string
  zoom: number
  sidebarCollapsed: string[]
  collapsedCategories: string[]
  autoCheckUpdate: boolean
}
```

- [ ] **Step 2: 编辑 app.ts 默认 settings**

```ts
settings: { theme: 'system', palette: 'teal', zoom: 100, sidebarCollapsed: [], collapsedCategories: [], autoCheckUpdate: true } as Settings,
```

- [ ] **Step 3: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/store/app.ts
git commit -m "feat: add autoCheckUpdate to settings type"
```

### Task 4: 前端 updater 封装模块

**Files:**
- Create: `src/updater.ts`
- Create: `src/updater.spec.ts`

**Interfaces:**
- Produces:
  - `checkForUpdate(): Promise<Update | null>` — 对 `@tauri-apps/plugin-updater` 的 `check()` 薄封装，网络/无更新返回 `null`
  - `downloadAndInstall(update, onProgress): Promise<void>` — 包 `update.downloadAndInstall`
  - `relaunchApp(): Promise<void>` — `@tauri-apps/plugin-process` 的 `relaunch()`
  - `Update` 类型从 `@tauri-apps/plugin-updater` re-export

- [ ] **Step 1: 安装依赖**

Run: `npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process`

- [ ] **Step 2: 写失败测试 `src/updater.spec.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkMock = vi.fn()
const relaunchMock = vi.fn()
vi.mock('@tauri-apps/plugin-updater', () => ({ check: () => checkMock() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunchMock() }))

import { checkForUpdate, relaunchApp } from './updater'

describe('updater', () => {
  beforeEach(() => { checkMock.mockReset(); relaunchMock.mockReset() })
  it('returns null when no update', async () => {
    checkMock.mockResolvedValue(null)
    expect(await checkForUpdate()).toBeNull()
  })
  it('returns update object when available', async () => {
    const u = { version: '9.9.9' }
    checkMock.mockResolvedValue(u)
    expect(await checkForUpdate()).toBe(u)
  })
  it('returns null when check throws', async () => {
    checkMock.mockRejectedValue(new Error('offline'))
    expect(await checkForUpdate()).toBeNull()
  })
  it('relaunchApp delegates', async () => {
    await relaunchApp()
    expect(relaunchMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/updater.spec.ts`
Expected: FAIL（`./updater` 不存在）。

- [ ] **Step 4: 实现 `src/updater.ts`**

```ts
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type { Update }

export async function checkForUpdate(): Promise<Update | null> {
  try {
    return (await check()) ?? null
  } catch {
    return null
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<void> {
  let downloaded = 0
  await update.downloadAndInstall((e) => {
    if (e.event === 'Started') onProgress?.(0, e.data.contentLength)
    else if (e.event === 'Progress') {
      downloaded += e.data.chunkLength
      onProgress?.(downloaded, undefined)
    }
  })
}

export async function relaunchApp(): Promise<void> {
  await relaunch()
}
```

注意：`onProgress` 的 total 只在 Started 事件有；调用方可在第一次回调时记录 total。若实现与官方 API 类型不符，以 `node_modules/@tauri-apps/plugin-updater/dist-js/index.d.ts` 为准调整。

- [ ] **Step 5: 测试通过**

Run: `npx vitest run src/updater.spec.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/updater.ts src/updater.spec.ts
git commit -m "feat: add updater wrapper module"
```

### Task 5: SettingsModal 新增「关于」分段

**Files:**
- Modify: `src/components/SettingsModal.vue:11,44-98`

**Interfaces:**
- Consumes: `src/updater.ts`（`checkForUpdate`、`downloadAndInstall`、`relaunchApp`、`Update`），`@tauri-apps/api/app` 的 `getVersion`，`@tauri-apps/api/os` 的 `version`（或 `navigator.userAgent` 展示 WebView）。
- Produces: 设置弹窗第四个分段 `about`。

- [ ] **Step 1: 扩展 section 类型并引入依赖**

```ts
import { ref, onMounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { getVersion } from '@tauri-apps/api/app'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
import * as updater from '../updater'
import { useAppStore } from '../store/app'
const section = ref<'theme' | 'display' | 'storage' | 'about'>('theme')
```

- [ ] **Step 2: 添加 about 分段状态**

```ts
const appVersion = ref('')
const updateState = ref<'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error'>('idle')
const updateInfo = ref<updater.Update | null>(null)
const downloadPct = ref(0)
const updateMsg = ref('')
onMounted(async () => {
  filePath.value = await api.getDataFilePath()
  appVersion.value = await getVersion()
})
async function checkNow() {
  updateState.value = 'checking'; updateMsg.value = ''
  const u = await updater.checkForUpdate()
  if (u) { updateInfo.value = u; updateState.value = 'available' }
  else { updateState.value = 'none'; updateMsg.value = '已是最新版本' }
}
async function installNow() {
  if (!updateInfo.value) return
  updateState.value = 'downloading'; downloadPct.value = 0
  try {
    let total = 0
    await updater.downloadAndInstall(updateInfo.value, (d, t) => {
      if (t) total = t
      if (total > 0) downloadPct.value = Math.round((d / total) * 100)
    })
    updateState.value = 'ready'
  } catch (e) { updateState.value = 'error'; updateMsg.value = '下载失败：' + e }
}
async function doRelaunch() { await updater.relaunchApp() }
function toggleAutoCheck(e: Event) {
  store.updateSettings({ autoCheckUpdate: (e.target as HTMLInputElement).checked })
}
```

- [ ] **Step 3: 模板加分段按钮**

```html
<button class="btn" :class="{ active: section === 'about' }" @click="section = 'about'">关于</button>
```

并把现有 storage 分支的 `v-else` 改为 `v-else-if="section === 'storage'"`，再追加：

```html
<template v-else-if="section === 'about'">
  <label>软件</label>
  <p>SiteCollector v{{ appVersion }}</p>
  <label style="margin-top:14px">链接</label>
  <p class="muted"><a @click.prevent="api.openUrl('https://github.com/liangcheng147/website-collector')">GitHub 仓库</a> · 作者 bjb · MIT License</p>
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
    <p class="muted">下载中 {{ downloadPct }}%</p>
    <progress :value="downloadPct" max="100" style="width:100%"></progress>
  </div>
  <div v-else-if="updateState === 'ready'">
    <p>已下载完成，重启后生效。</p>
    <button class="btn primary" @click="doRelaunch">立即重启</button>
  </div>
  <p v-else-if="updateState === 'error'" class="muted">{{ updateMsg }}</p>
  <label style="margin-top:14px"><input type="checkbox" :checked="store.settings.autoCheckUpdate" @change="toggleAutoCheck" /> 启动时自动检查更新</label>
  <label style="margin-top:14px">技术信息</label>
  <p class="muted">{{ navigator.userAgent }}</p>
</template>
```

若 `api.ts` 没有 `openUrl` 导出，检查 `src/api.ts` 中 opener 的用法（`openLink`），保持一致替换。

- [ ] **Step 4: 类型检查与测试**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.vue
git commit -m "feat: add about section to settings modal"
```

### Task 6: 启动自动检查更新

**Files:**
- Modify: `src/App.vue:38-41`

**Interfaces:**
- Consumes: `src/updater.ts` 的 `checkForUpdate`，`store.settings.autoCheckUpdate`，`store` 的 `flash`（若无则用 ref 提示条）。

- [ ] **Step 1: 修改 onMounted**

```ts
import { checkForUpdate } from './updater'
...
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  await store.init()
  if (store.settings.autoCheckUpdate) {
    const u = await checkForUpdate()
    if (u) store.flash(`发现新版本 v${u.version}，请到设置 → 关于中更新`)
  }
})
```

若 `store.flash` 不存在，改用 `store.checkAll` 同类已有的提示机制（查看 `src/store/app.ts` 中 `flash` 或 toast 实现，保持一致）。

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/App.vue
git commit -m "feat: check for updates on startup when enabled"
```

### Task 7: CI 注入签名密钥

**Files:**
- Modify: `.github/workflows/release.yml`（Build and release 步骤 env）

- [ ] **Step 1: 编辑 workflow**

```yaml
      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

- [ ] **Step 2: 配置 GitHub Secrets**

仓库 Settings → Secrets and variables → Actions，新增 `TAURI_SIGNING_PRIVATE_KEY`（私钥文件内容）与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: sign updater artifacts with private key secrets"
```

### Task 8: 全量验证

- [ ] **Step 1:** `npm test` 全部通过
- [ ] **Step 2:** `npm run build`（vue-tsc + vite build）通过
- [ ] **Step 3:** `cd src-tauri; cargo test` 通过（需先设 LIB）
- [ ] **Step 4:** `npm run tauri dev` 冒烟：设置 → 关于 分段可见，版本号正确，「检查更新」在未配置端点时静默报错提示

---

## Self-Review

- Spec coverage：关于页四块内容（Task 5）、autoCheckUpdate（Task 2/3/5/6）、updater 插件（Task 1/4）、CI latest.json（Task 1/7）、权限（Task 1）、测试（Task 2/4）✅
- Placeholder：无 TBD；pubkey 明确写了生成命令与替换位置 ✅
- Type consistency：`checkForUpdate` 返回 `Update | null`，`downloadAndInstall(update, onProgress)` 签名在 Task 4 定义后 Task 5 同名使用；`auto_check_update` ↔ `autoCheckUpdate` camelCase 一致 ✅
