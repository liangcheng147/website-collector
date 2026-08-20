# 检测增强与交互修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复右键菜单关闭失效、加入检测取消按钮、将检测方法升级为「系统 TLS 快检 + 重试 + WebView2 浏览器内核复核」。

**Architecture:** 三个独立改动流：(1) 前端右键菜单改为 ContextMenu 内全局 `pointerdown`+`wheel` 监听关闭，删除失效的 `.menu-mask`；(2) 前端 store 加 `cancelRequested`/`cancelled` 状态，检测串行循环每轮检查标志中断，按钮态随 `checking` 切换；(3) 检测升级两层——第一层 reqwest 换 native-tls（Windows Schannel，与浏览器一致）并在判死自动重试一次，第二层新增隐藏 WebviewWindow 复核命令，判死站点由前端自动调起复核。

**Tech Stack:** Vue 3 + Pinia + Vitest（前端）；Rust + Tauri v2 + reqwest + WebView2（后端）。

## Global Constraints

- 检测结果仍为 `CheckResult { status, used_url }`（camelCase 序列化），状态仅 ok / dead / unknown 三态。
- reqwest 保持 `version = "0.12"`；本版将 `rustls-tls` 替换为 `native-tls`（Windows 用 Schannel，无新增系统依赖）。
- 不引入无头浏览器新依赖（WebView2 为 Tauri 自带运行时，仅新建隐藏窗口）。
- 前端不引新依赖。
- 现有测试必须全部继续通过：`cargo test`（src-tauri/ 内）与 `npm test`（仓库根）。

---

### Task 1: 右键菜单全局关闭修复

**Files:**
- Modify: `src/components/ContextMenu.vue`
- Modify: `src/components/SiteTable.vue:20-22,112-113`
- Modify: `src/components/CategoryNode.vue:57-59,85-86`

**Interfaces:**
- Consumes: 现有 `ContextMenu` props（`x`/`y`/`items`）与 `@action` 事件不变。
- Produces: `ContextMenu` 新增 `close` 事件（`@close`），点击菜单外任意位置/滚轮时触发。

**背景**：`.menu-mask`（`position:fixed; inset:0; z-index:99`）位于 `.app` 内部，缩放 ≠ 100% 时 `.app` 带 `transform: scale()`，fixed 相对 transform 祖先定位 → mask 盖不满视口，点边缘不关闭；且菜单开着时 mask 盖住表格行，二次右键命中 mask 的 `@contextmenu.prevent` 关闭而非重开。删除 mask，改为 ContextMenu 组件内全局监听。

- [ ] **Step 1: 改写 `ContextMenu.vue`**

将 `src/components/ContextMenu.vue` 整体替换为：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['action', 'close'])
const props = defineProps<{ x: number; y: number; items?: { kind: string; label: string; danger?: boolean }[] }>()
const el = ref<HTMLDivElement | null>(null)
const pos = ref({ x: props.x, y: props.y })

function onGlobalDown(e: Event) {
  if (!el.value?.contains(e.target as Node)) emit('close')
}

onMounted(async () => {
  await nextTick()
  if (!el.value) return
  const w = el.value.offsetWidth
  const h = el.value.offsetHeight
  const pad = 6
  let nx = props.x
  let ny = props.y
  if (props.x + w > window.innerWidth - pad) nx = Math.max(pad, window.innerWidth - w - pad)
  if (props.y + h > window.innerHeight - pad) ny = Math.max(pad, window.innerHeight - h - pad)
  pos.value = { x: nx, y: ny }
  document.addEventListener('pointerdown', onGlobalDown)
  document.addEventListener('wheel', onGlobalDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onGlobalDown)
  document.removeEventListener('wheel', onGlobalDown)
})

function act(kind: string) { emit('action', kind); store.clearSelection() }
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="ctx" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" @contextmenu.prevent>
      <template v-if="props.items && props.items.length">
        <button v-for="it in props.items" :key="it.kind" class="ctx-item" :class="{ danger: it.danger }" @click="act(it.kind)">{{ it.label }}</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="act('check')">▶ 检测所选</button>
        <button class="ctx-item" @click="act('move')">移动分类…</button>
        <button class="ctx-item" @click="act('tag')">添加标签…</button>
        <button class="ctx-item" @click="act('edit')">编辑</button>
        <button class="ctx-item danger" @click="act('delete')">删除所选</button>
      </template>
    </div>
  </Teleport>
</template>
```

说明：滚轮不触发 `pointerdown`，故 `wheel` 监听兜底实现「滚动关闭」；右键另一行时 `pointerdown` 先关旧菜单、`contextmenu` 再开新菜单，顺序天然正确。

- [ ] **Step 2: 更新 `SiteTable.vue`**

删除第 112 行的 `<div class="menu-mask" v-if="menu" @click="menu = null" @contextmenu.prevent="menu = null"></div>`，并把第 113 行改为：

```html
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" @action="onAction" @close="menu = null" />
```

第 20-22 行的 `onKey` / `onMounted` / `onUnmounted`（Escape 关闭）保留不动。

- [ ] **Step 3: 更新 `CategoryNode.vue`**

删除第 85 行的 `<div class="menu-mask" v-if="menu" @click="menu = null" @contextmenu.prevent="menu = null"></div>`，并把第 86 行改为：

```html
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems()" @action="(kind: string) => onAction(kind, cat)" @close="menu = null" />
```

- [ ] **Step 4: 类型检查 + 现有测试**

Run: `npm run build`（vue-tsc 类型检查）
Expected: 无类型错误。

Run: `npm test`
Expected: 现有 47/47 通过。

- [ ] **Step 5: 手动验证清单（需要用户操作）**

`npm run tauri dev` 启动后逐项确认：
1. 右键表格行 → 菜单弹出（含缩放非 100% 时）。
2. 点菜单外任意位置（含窗口边缘）→ 菜单关闭。
3. 按 Esc → 菜单关闭。
4. 点菜单项 → 功能执行且菜单关闭。
5. 菜单开着时右键另一行 → 旧菜单关、新菜单在新位置弹出。
6. 滚动列表 → 菜单关闭。
7. 侧边栏分类右键菜单同样逐项验证。

- [ ] **Step 6: Commit**

```bash
git add src/components/ContextMenu.vue src/components/SiteTable.vue src/components/CategoryNode.vue
git commit -m "fix: 右键菜单改为全局点击关闭，删除失效的遮罩层"
```

---

### Task 2: 检测取消逻辑（store）

**Files:**
- Modify: `src/store/app.ts:19-32,402-448`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: 现有 `checkAll` / `checkSelected` / `checkOne` / `checking` / `progress`。
- Produces:
  - 状态 `cancelRequested: boolean`、`cancelled: boolean`。
  - Action `cancelCheck()`（置 `cancelRequested = true`）。
  - `checkAll` / `checkSelected` 每处理完一个站点检查 `cancelRequested` 决定是否中断；`finally` 中把 `cancelled` 置为是否被取消并复位 `checking`/`cancelRequested`。

**背景**：检测是前端驱动串行循环（app.ts:402-448）。取消 = 标志位中断，不硬掐 in-flight 请求。

- [ ] **Step 1: 写失败测试**

在 `src/store/app.spec.ts` 末尾追加：

```ts
  it('cancelCheck stops checkAll after current site', async () => {
    const s = useAppStore()
    s.data = baseData
    const resolvers: ((v: any) => void)[] = []
    vi.mocked(api.checkSite).mockImplementation(() => new Promise<any>(res => resolvers.push(res)))
    const promise = s.checkAll()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(resolvers.length).toBe(1)
    resolvers[0]({ status: 'ok', usedUrl: 'x' })
    for (let i = 0; i < 10; i++) await Promise.resolve()
    s.cancelCheck()
    resolvers[1]({ status: 'dead', usedUrl: 'x' })
    await promise
    expect(api.checkSite).toHaveBeenCalledTimes(2) // 只测到 b 就停
    expect(s.data.sites.filter(x => x.lastCheck).length).toBe(2) // a、b 结果保留
    expect(s.progress.done).toBe(2)
    expect(s.checking).toBe(false)
    expect(s.cancelled).toBe(true)
  })

  it('checkOne is skipped while checking', async () => {
    const s = useAppStore()
    s.data = baseData
    s.checking = true
    await s.checkOne('a')
    expect(api.checkSite).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: 新增两条 FAIL（`cancelCheck`/`cancelled` 不存在），其余通过。

- [ ] **Step 3: 实现 store 改动**

`src/store/app.ts` state 区块（第 27 行 `checking: false` 附近）增加：

```ts
    checking: false,
    cancelled: false,
    cancelRequested: false,
```

新增 action（放在 `checkAll` 之前）：

```ts
    cancelCheck() { this.cancelRequested = true },
```

将 `checkAll`（第 402-419 行）替换为：

```ts
    async checkAll() {
      if (this.checking) return
      this.cancelled = false
      if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
      this.connectivityError = false
      this.checking = true
      this.progress = { done: 0, total: this.data.sites.length }
      try {
        for (const s of [...this.data.sites]) {
          const r = await api.checkSite(s.url)
          s.status = r.status
          s.lastCheck = new Date().toISOString()
          this.progress.done++
          this.persist()
          if (this.cancelRequested) break
        }
      } finally {
        this.cancelled = this.cancelRequested
        this.checking = false
        this.cancelRequested = false
      }
    },
```

将 `checkOne`（第 421-428 行）替换为：

```ts
    async checkOne(id: string) {
      if (this.checking) return
      const s = this.data.sites.find(x => x.id === id)
      if (!s) return
      const r = await api.checkSite(s.url)
      s.status = r.status
      s.lastCheck = new Date().toISOString()
      this.persist()
    },
```

将 `checkSelected`（第 430-448 行）替换为：

```ts
    async checkSelected() {
      if (this.checking) return
      this.cancelled = false
      if (!(await api.checkConnectivity())) { this.connectivityError = true; this.view = { kind: 'dead' }; return }
      this.connectivityError = false
      this.checking = true
      const ids = [...this.selectedIds]
      this.progress = { done: 0, total: ids.length }
      try {
        for (const id of ids) {
          const s = this.data.sites.find(x => x.id === id)
          if (s) { const r = await api.checkSite(s.url); s.status = r.status; s.lastCheck = new Date().toISOString() }
          this.progress.done++
          this.persist()
          if (this.cancelRequested) break
        }
      } finally {
        this.cancelled = this.cancelRequested
        this.checking = false
        this.cancelRequested = false
        this.clearSelection()
      }
    },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: 全部通过（含新增 2 条 + 现有 47 条，共 49 条）。

- [ ] **Step 5: Commit**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "feat: 检测取消逻辑（store）"
```

---

### Task 3: 检测中按钮切换「取消检测」（UI）

**Files:**
- Modify: `src/components/TopBar.vue:4,15`
- Modify: `src/App.vue:48`
- Modify: `src/components/StatusBar.vue:12`
- Modify: `src/components/SiteTable.vue:67-74`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: Task 2 的 `store.checking` / `store.cancelled` / `store.cancelCheck()` / `store.progress`。
- Produces: `TopBar` 新增 `cancel-check` 事件；无其他对外接口变化。

- [ ] **Step 1: 更新 `TopBar.vue`**

第 4 行改为：

```ts
const emit = defineEmits(['check-all', 'cancel-check', 'add', 'import-export', 'settings', 'manage'])
```

第 15 行改为：

```html
    <button class="btn" :class="store.checking ? 'danger' : 'primary'" @click="store.checking ? emit('cancel-check') : $emit('check-all')">{{ store.checking ? '■ 取消检测' : '▶ 检测全部' }}</button>
```

- [ ] **Step 2: 更新 `App.vue` 接线**

第 48 行 `<TopBar ... @check-all="store.checkAll" ...>` 加一个监听：

```html
    <TopBar @add="openAdd" @import-export="modal = 'import'" @settings="modal = 'settings'" @check-all="store.checkAll" @cancel-check="store.cancelCheck" @manage="manage = true" />
```

- [ ] **Step 3: 更新 `StatusBar.vue`**

第 12 行 `检测中` 一行替换为：

```html
    <span v-if="store.checking">检测中 {{ store.progress.done }}/{{ store.progress.total }}</span>
    <span v-else-if="store.cancelled">⏹ 已手动停止（测了 {{ store.progress.done }}/{{ store.progress.total }}）</span>
```

- [ ] **Step 4: 更新 `SiteTable.vue` 批量操作栏**

第 69-73 行替换为：

```html
      <button v-if="store.checking" class="btn danger" @click="store.cancelCheck()">■ 取消检测</button>
      <button v-else class="btn" @click="emit('check-site', [...store.selectedIds])">▶ 检测所选</button>
      <button class="btn" :disabled="store.checking" @click="emit('move', [...store.selectedIds])">移动分类…</button>
      <button class="btn" :disabled="store.checking" @click="emit('tag', [...store.selectedIds])">添加标签…</button>
      <button class="btn danger" :disabled="store.checking" @click="store.deleteSites([...store.selectedIds])">删除所选</button>
      <button class="btn" style="margin-left:auto" @click="store.clearSelection()">✕ 取消选择</button>
```

- [ ] **Step 5: 加禁用态样式**

在 `src/styles/main.css` 末尾追加：

```css
.btn:disabled { opacity: .5; cursor: default; }
```

- [ ] **Step 6: 类型检查 + 现有测试**

Run: `npm run build`；Expected: 无类型错误。
Run: `npm test`；Expected: 49/49 通过。

- [ ] **Step 7: 手动验证清单（需要用户操作）**

`npm run tauri dev` 验证三态：
1. 平时顶栏「▶ 检测全部」；勾选后批量栏「▶ 检测所选」。
2. 点「检测全部」→ 顶栏变红色「■ 取消检测」，批量栏「检测所选」也变「■ 取消检测」，移动/标签/删除按钮变灰。
3. 点「■ 取消检测」→ 按钮恢复蓝色，状态栏「⏹ 已手动停止（测了 x/y）」；已测结果保留。
4. 检测中再点「检测全部/检测所选」无效。

- [ ] **Step 8: Commit**

```bash
git add src/components/TopBar.vue src/App.vue src/components/StatusBar.vue src/components/SiteTable.vue src/styles/main.css
git commit -m "feat: 检测中按钮切换为取消检测（UI）"
```

---

### Task 4: 快检 TLS 后端切换 + 判死自动重试

**Files:**
- Modify: `src-tauri/Cargo.toml:23`
- Modify: `src-tauri/Cargo.lock`（随 cargo 更新）
- Modify: `src-tauri/src/check.rs:44-91`
- Test: `src-tauri/src/check.rs`（tests 模块）

**Interfaces:**
- Consumes: `check::client()` / `check::probe()` / `check::variants()` / `check::root_url()` / `check::normalize_url()`。
- Produces: `check_site(url: &str) -> CheckResult` 语义扩展为「判 dead 后等待 1 秒重试一次」；内部新增 `async fn check_site_attempt(url: &str) -> CheckResult`。

**背景**：`www.4fb.cn`（IIS 8.5）只提供 TLS1.2 CBC 套件（实测 `ECDHE-RSA-AES256-SHA384`），rustls 只支持 GCM → 握手失败判 dead；浏览器用 Schannel（native-tls）兼容 CBC → 可打开。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/check.rs` tests 模块末尾追加：

```rust
    #[test]
    fn retries_after_transient_failure() {
        // 第一次探测全部失败（临时故障），1 秒后自动重试成功 → 应判 ok
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            // 第 1 次连接（首次尝试 http）→ 404；第 2 次（首次尝试 https）→ 404（TLS 读到明文 → 失败）；
            // 第 3 次（重试 http）→ 200。
            let mut n = 0;
            for _ in 0..3 {
                if let Ok((mut stream, _)) = listener.accept() {
                    n += 1;
                    let mut buf = [0u8; 4096];
                    let _ = stream.read(&mut buf);
                    let (status, body) = if n >= 3 { ("200 OK", "ok") } else { ("404 Not Found", "nf") };
                    let resp = format!(
                        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status, body.len(), body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                }
            }
        });
        let url = format!("http://{}/", addr);
        let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
            check_site(&url).await
        });
        assert_eq!(res.status, "ok");
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test retries_after_transient_failure`（在 `src-tauri/` 内）
Expected: FAIL（无重试逻辑时首次全部 404 → dead ≠ ok）。

- [ ] **Step 3: 改 `Cargo.toml` TLS 后端**

第 23 行：

```toml
reqwest = { version = "0.12", features = ["json", "native-tls", "gzip", "brotli"], default-features = false }
```

- [ ] **Step 4: 实现重试**

将 `src-tauri/src/check.rs` 第 72-91 行的 `check_site` 替换为：

```rust
const RETRY_DELAY: Duration = Duration::from_secs(1);

async fn check_site_attempt(url: &str) -> CheckResult {
    let c = client();
    let full = normalize_url(url);
    // 1. 原 URL 双协议
    for cand in variants(url) {
        if let Some(r) = probe(&c, &cand).await {
            if r.status == "ok" { return r; }
        }
    }
    // 2. 降级测根域名（避免子页面 404 误标），同样双协议
    let root = root_url(url);
    if root != full {
        for cand in variants(&root) {
            if let Some(r) = probe(&c, &cand).await {
                if r.status == "ok" { return r; }
            }
        }
    }
    CheckResult { status: "dead".into(), used_url: full }
}

pub async fn check_site(url: &str) -> CheckResult {
    let r = check_site_attempt(url).await;
    if r.status == "dead" {
        tokio::time::sleep(RETRY_DELAY).await;
        return check_site_attempt(url).await;
    }
    r
}
```

说明：`tokio::time` 由 reqwest（其自带超时实现依赖 tokio `time` 特性）保证可用。若 `cargo build` 报 `could not find time in tokio`（理论上不会），则在 dev-dependencies 的 tokio 增加 `"time"` 特性。

- [ ] **Step 5: 全量测试**

Run: `cargo test`（在 `src-tauri/` 内）
Expected: 全部通过（含新增重试测试；`connectivity_false_on_bad_host` 因重试多约 1 秒，正常）。

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/check.rs
git commit -m "fix: 检测改用系统 TLS 并在判死后自动重试一次"
```

---

### Task 5: WebView2 浏览器内核复核命令（后端）

**Files:**
- Create: `src-tauri/src/verify.rs`
- Modify: `src-tauri/src/check.rs:58`（`fn variants` → `pub(crate) fn variants`）
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs:4-8,19-39`

**Interfaces:**
- Consumes: `check::CheckResult`、`check::normalize_url(url) -> String`、`check::variants(url) -> Vec<String>`（本任务改为 `pub(crate)`）。
- Produces: `verify::verify_site(app: &tauri::AppHandle, url: &str) -> check::CheckResult`；命令 `verify_site_webview_cmd(app: tauri::AppHandle, url: String) -> check::CheckResult`（注册进 invoke_handler）。

**背景**：对判 dead 的站用 Tauri 自带 WebView2 建隐藏窗口真开一次，加载完成（主 frame Finished 且 URL 为 http/https）即 ok，错误页/超时判 dead。每个变体 8 秒超时，先 https 后 http。

- [ ] **Step 1: 创建 `src-tauri/src/verify.rs`**

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{WebviewUrl, WebviewWindowBuilder};

use crate::check;

const VERIFY_TIMEOUT: Duration = Duration::from_secs(8);
static WINDOW_SEQ: AtomicU64 = AtomicU64::new(0);

async fn probe_webview(app: &tauri::AppHandle, url: &str) -> bool {
    let label = format!("verify_{}", WINDOW_SEQ.fetch_add(1, Ordering::Relaxed));
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    let window = match WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .visible(false)
        .build()
    {
        Ok(w) => w,
        Err(_) => return false,
    };
    window.on_page_load(move |ev| {
        if ev.event_type() == tauri::webview::PageLoadEventType::Finished {
            let scheme = ev.url().scheme();
            let _ = tx.send(scheme == "http" || scheme == "https");
        }
    });
    let ok = tokio::time::timeout(VERIFY_TIMEOUT, rx)
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or(false);
    let _ = window.close();
    ok
}

pub async fn verify_site(app: &tauri::AppHandle, url: &str) -> check::CheckResult {
    let mut last = check::normalize_url(url);
    for cand in check::variants(url) {
        last = cand.clone();
        if probe_webview(app, &cand).await {
            return check::CheckResult { status: "ok".into(), used_url: cand };
        }
    }
    check::CheckResult { status: "dead".into(), used_url: last }
}
```

- [ ] **Step 2: `check.rs` 的 `variants` 改为 `pub(crate)`**

第 58 行：`fn variants(url: &str) -> Vec<String> {` → `pub(crate) fn variants(url: &str) -> Vec<String> {`

- [ ] **Step 3: `commands.rs` 新增命令**

在 `check_connectivity_cmd`（第 45-48 行）之后追加：

```rust
#[tauri::command]
pub async fn verify_site_webview_cmd(app: tauri::AppHandle, url: String) -> check::CheckResult {
    crate::verify::verify_site(&app, &url).await
}
```

- [ ] **Step 4: `lib.rs` 注册模块与命令**

第 7 行 `mod settings;` 后加一行 `mod verify;`；在 `invoke_handler` 的 `commands::check_connectivity_cmd,` 后加一行 `commands::verify_site_webview_cmd,`。

- [ ] **Step 5: 编译验证**

Run: `cargo test`（在 `src-tauri/` 内）
Expected: 编译通过，全部测试通过（verify 函数不在测试路径，仅编译校验）。

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/verify.rs src-tauri/src/check.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 浏览器内核复核命令（WebView2 隐藏窗口）"
```

---

### Task 6: 判死站点接入浏览器内核复核（前端）

**Files:**
- Modify: `src/api.ts:8`（新增）
- Modify: `src/store/app.ts`（`checkAll`/`checkSelected`/`checkOne` 复用新 helper）
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: Task 5 命令 `verify_site_webview_cmd`；Task 2 的 `cancelRequested` 循环中断。
- Produces: `api.verifySiteWebview(url: string) => Promise<CheckResult>`；store 内部 `checkSiteWithVerify(s: Site)`（判死自动复核）。

- [ ] **Step 1: 更新 api mock 并写失败测试**

在 `src/store/app.spec.ts` 第 4-12 行的 `vi.mock('../api', ...)` 中 `checkSite` 一行后加：

```ts
  verifySiteWebview: vi.fn().mockResolvedValue({ status: 'ok', usedUrl: 'https://x.dev' }),
```

在文件末尾追加：

```ts
  it('checkAll verifies dead sites via webview', async () => {
    const s = useAppStore()
    s.data = baseData // a:ok, b:dead, c:unknown
    vi.mocked(api.checkSite).mockResolvedValue({ status: 'dead', usedUrl: 'x' })
    vi.mocked(api.verifySiteWebview).mockResolvedValue({ status: 'ok', usedUrl: 'x' })
    await s.checkAll()
    expect(s.data.sites.every(x => x.status === 'ok')).toBe(true)
    expect(api.verifySiteWebview).toHaveBeenCalledTimes(3)
  })

  it('checkAll does not verify already-ok sites', async () => {
    const s = useAppStore()
    s.data = baseData
    vi.mocked(api.checkSite).mockImplementation(async (url) =>
      url.includes('a') ? { status: 'ok', usedUrl: url } : { status: 'dead', usedUrl: url })
    await s.checkAll()
    expect(api.verifySiteWebview).toHaveBeenCalledTimes(2) // 只复核 b、c
  })
```

- [ ] **Step 2: 更新既有测试 `checkAll updates statuses and progress`**

该测试现有断言 `s.data.sites.every(x => x.status === 'dead')`，引入复核后 checkSite 返回 dead 会触发 verify（mock 默认 ok）→ 状态变 ok 破坏断言。在其 `vi.mocked(api.checkSite)...` 行后补一行：

```ts
    vi.mocked(api.verifySiteWebview).mockResolvedValue({ status: 'dead', usedUrl: 'https://x.dev' })
```

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: 新增两条 FAIL（`verifySiteWebview` 未实现），既有测试恢复通过。

- [ ] **Step 4: 实现 `api.ts`**

第 8 行后加：

```ts
export const verifySiteWebview = (url: string) => invoke<CheckResult>('verify_site_webview_cmd', { url })
```

- [ ] **Step 5: 实现 store helper 与三个入口**

`src/store/app.ts` 中新增 action（放在 `checkOne` 之前）：

```ts
    async checkSiteWithVerify(s: Site) {
      let r = await api.checkSite(s.url)
      if (r.status === 'dead') {
        r = await api.verifySiteWebview(s.url)
      }
      s.status = r.status
      s.lastCheck = new Date().toISOString()
    },
```

将 `checkAll` 循环体（Task 2 版）改为调用 helper：

```ts
        for (const s of [...this.data.sites]) {
          await this.checkSiteWithVerify(s)
          this.progress.done++
          this.persist()
          if (this.cancelRequested) break
        }
```

将 `checkSelected` 循环体改为：

```ts
        for (const id of ids) {
          const s = this.data.sites.find(x => x.id === id)
          if (s) await this.checkSiteWithVerify(s)
          this.progress.done++
          this.persist()
          if (this.cancelRequested) break
        }
```

将 `checkOne` 改为：

```ts
    async checkOne(id: string) {
      if (this.checking) return
      const s = this.data.sites.find(x => x.id === id)
      if (!s) return
      await this.checkSiteWithVerify(s)
      this.persist()
    },
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: 全部通过（新增 2 + 更新 1 + 其余，共 51 条）。

- [ ] **Step 7: 类型检查**

Run: `npm run build`
Expected: 无类型错误。

- [ ] **Step 8: Commit**

```bash
git add src/api.ts src/store/app.ts src/store/app.spec.ts
git commit -m "feat: 判死站点接入浏览器内核复核"
```

---

### Task 7: 端到端验证与收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-08-20-detection-cancel-menu-design.md:3`

**Interfaces:**
- Consumes: 全部前序任务产物。

**背景**：收尾任务——全量测试、真实站点冒烟（GUI，需用户操作）、规格状态改「已实现」。

- [ ] **Step 1: 全量测试（后端）**

Run: `cargo test`（在 `src-tauri/` 内）
Expected: 全部通过（含新增重试测试）。

- [ ] **Step 2: 全量测试 + 构建（前端）**

Run: `npm test`；Expected: 51/51 通过。
Run: `npm run build`；Expected: 无类型错误、构建成功。

- [ ] **Step 3: 真实站点冒烟（GUI，需要用户操作）**

`npm run tauri dev` 后验证检测升级：
1. 检测 `www.4fb.cn` → 判 **ok**（快检 TLS 修复的直接验证）。
2. 检测 `aigei.com`、`hippopx.com` → 判 **ok**（403 推断）。
3. 检测一个不存在域名（如 `nonexistent-domain-xyz123.com`）→ 判 **dead**（第二层复核仍失败）。
4. 结合 Task 3 步骤验证取消按钮在复核阶段也可用（测完当前站停止）。

- [ ] **Step 4: 更新规格状态**

`docs/superpowers/specs/2026-08-20-detection-cancel-menu-design.md` 第 3 行：

```markdown
- 状态：已确认
```
改为：
```markdown
- 状态：已实现
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-20-detection-cancel-menu-design.md
git commit -m "docs: 标记检测增强与交互修复已实现"
```
