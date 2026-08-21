# 检测增强与交互修复（右键菜单 + 取消检测 + 检测方法升级）

- 日期：2026-08-20
- 状态：已实现
- 关联：`src/components/ContextMenu.vue`、`src/components/SiteTable.vue`、`src/components/CategoryNode.vue`、`src/components/TopBar.vue`、`src/components/StatusBar.vue`、`src/store/app.ts`、`src-tauri/src/check.rs`、`src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`

## 问题背景

三个独立问题：

1. **右键菜单**：菜单出现后，点击窗口其他位置不能关闭；有时右键唤出菜单"失效"。
2. **检测无取消**：检测全部/所选时只能干等，没有停止手段。
3. **检测误判**：仍存在「浏览器能打开、检测判 dead」的网站。实测案例 `www.4fb.cn` 为根因明确的典型：微软 IIS 8.5 老站，只提供 TLS1.2 CBC 加密套件（`ECDHE-RSA-AES256-SHA384`），而程序用 rustls（只支持 GCM 套件）→ 握手失败 → 判 dead；浏览器用 Windows 系统加密（Schannel）兼容 CBC → 能打开。

## 设计决策

### 议题1：右键菜单修复

**根因**：菜单关闭依赖 `.menu-mask`（`position:fixed; inset:0; z-index:99`），但它位于 `.app` 内部，而 `.app` 在缩放 ≠ 100% 时带 `transform: scale(zoom)`（app.ts `applyAppearance`）。父级有 transform 时，`position:fixed` 相对 transform 祖先而非视口定位 → 缩放 < 100% 时 mask 盖不满视口，点边缘不关闭。同时菜单开着时 mask 盖住表格行，二次右键命中 mask 的 `@contextmenu.prevent`（关闭而非重开），表现为"唤出失效"。

**方案**：删除 mask，改为 ContextMenu 组件内全局监听。

- `ContextMenu.vue`：`onMounted` 注册 `document.addEventListener('pointerdown', onGlobalDown)` 与 `document.addEventListener('wheel', onGlobalDown)`；`onGlobalDown` 判断 `e.target` 是否在 `el` 内，不在则 `emit('close')`；`onUnmounted` 一并移除两个监听（滚动不触发 pointerdown，故需 wheel 监听兜底）。菜单容器加 `@contextmenu.prevent` 防原生菜单。
- `SiteTable.vue` / `CategoryNode.vue`：删除 `.menu-mask` 相关标记与逻辑；`<ContextMenu @close="menu = null">`。
- 行为矩阵：

| 操作 | 结果 |
|---|---|
| 点菜单外任意位置（含缩放后边缘） | 关闭 |
| Esc | 关闭（保留现有 keydown） |
| 点菜单项 | 执行 + 关闭 |
| 右键另一行 | pointerdown 先关旧菜单 → contextmenu 在新位置开新菜单 |
| 滚动列表 | 关闭（wheel 监听） |

### 议题2：取消检测按钮

**方案**：前端 store 加取消标志，串行循环每轮检查中断。

- `app.ts` state 增加 `cancelRequested: boolean`。
- 新增 action `cancelCheck()`：置 `cancelRequested = true`。
- `checkAll` / `checkSelected` 循环内每处理完一个站点后：`if (this.cancelRequested) break`；`finally` 中重置 `checking = false` 与 `cancelRequested = false`。
- 语义：正在测的网站**测完再停**（await 完成、结果正常写入后 break），已测结果保留，剩余站点状态不动。
- `checkOne` 增加 `if (this.checking) return` 守卫（防检测中右键单测并发）。
- UI：
  - `TopBar.vue`：`store.checking ? 「■ 取消检测」(emit cancel → store.cancelCheck) : 「▶ 检测全部」`。
  - `SiteTable.vue` 批量栏：「检测所选」同样切换；检测中「移动分类/添加标签/删除所选」`disabled`，「✕ 取消选择」保留可用。
  - `StatusBar.vue`：检测中显示「检测中 x/y」；手动停止后显示「⏹ 已手动停止（测了 x/y）」（用一个 `cancelled` 状态，下次检测开始时清除）。

### 议题3：检测方法升级（两层）

#### 第一层：快检升级

1. **TLS 后端 rustls → native-tls**（Windows 用 Schannel，与浏览器完全一致）。`Cargo.toml` 中 `reqwest` features：`["json", "rustls-tls", "gzip", "brotli"]` → `["json", "native-tls", "gzip", "brotli"]`，`default-features = false` 不变。修复 4fb.cn 这类老加密站。
2. **判 dead 自动重试一次**：`check_site` 若整体流程判 dead，等待 1 秒后完整重跑一遍（`RETRY_DELAY = 1s` 常量），消除网络抖动误判。最坏耗时 ×2，可接受。
3. **保留**：403 → ok、根域名降级、http/https 双协议、浏览器头伪装、超时 10s、重定向 10 次、gzip/brotli。

#### 第二层：浏览器内核复核（只对判 dead 的站）

- 新增命令 `verify_site_webview_cmd(url: String) -> CheckResult`（`commands.rs` + `lib.rs` 注册）。
- 实现：Tauri v2 `WebviewWindowBuilder` 建**隐藏窗口**（`visible(false)`），加载 URL；用 `on_page_load` 事件 + oneshot channel + `tokio::time::timeout(8s)` 判定：
  - 主 frame 加载 Finished 且 URL 为 http(s) → **ok**（含 403/验证页，页面能加载即站点可用）。
  - 加载错误页（scheme 非 http(s)）或超时 → 尝试 http 变体（各 8s 超时）；仍失败 → **dead**。
- 窗口用完即关。每站一窗一关（判死站数量少，可接受；复用单窗口留作后续优化，本版不做）。
- 前端集成：`checkAll` / `checkSelected` 循环内：`r = checkSite(url)`；若 `r.status == "dead"` → `r2 = verifySiteWebview(url)` → 用 `r2` 覆盖结果。进度照常推进。
- **不新增**「复核死站」按钮：用户复查已死站直接走「失效」视图 + 「检测所选」，该流程自动包含第二层复核。

## 全局约束

- 检测结果仍为 `CheckResult { status, used_url }`（camelCase），状态仅 ok / dead / unknown 三态。
- reqwest 保持 `version = "0.12"`；本版将 `rustls-tls` 替换为 `native-tls`（Windows 无新增系统依赖，CI 目标平台为 Windows）。
- 不引入无头浏览器新依赖（WebView2 为 Tauri 自带运行时，仅新建隐藏窗口）。
- 前端不引新依赖；改动限于现有组件与 store。

## 测试

- **check.rs**：现有 10 个测试继续通过（native-tls 替换不影响本地 TCP 服务器测试）；新增重试测试（服务器首次拒连、第二次返回 200 → ok）。
- **store（vitest）**：新增取消逻辑测试（`cancelCheck` 中断循环、结果保留、状态复位）。
- **GUI 手动验证**（真实站点冒烟）：
  - `www.4fb.cn` → ok（快检 TLS 修复的直接验证）。
  - `aigei.com` / `hippopx.com` → ok（403 推断）。
  - 一个不存在域名 → dead（走第二层复核仍失败）。
  - 右键菜单五条行为矩阵逐项手测；取消检测三态按钮手测。

## 非目标

- 不做"立即硬停"（中断 in-flight 请求），本版统一"测完当前再停"。
- 不复用/缓存 WebView2 窗口（每站一窗，性能留待观察）。
- 不新增「复核死站」按钮、不新增检测状态、不做内容级验证。