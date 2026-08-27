# AGENTS.md

本地优先的网站收藏桌面应用（Tauri 2 + Vue 3 + Rust）。前端是 `src/`，Rust 后端是 `src-tauri/`。

## 命令

- 完整开发（带桌面窗口 + 热更新）：`npm run tauri dev`
- 仅前端（浏览器，无 Tauri 运行时，需要桩接 `invoke`）：`npm run dev`
- 前端测试（Vitest）：`npm test`
- Rust 测试：`cd src-tauri && cargo test`
- 类型检查 + 构建：`npm run build`（先 `vue-tsc --noEmit` 再做 `vite build`，缺一不可）
- 打包安装器：`npm run tauri build`（产物触发前会先跑 `npm run build`）

CI（`.github/workflows/release.yml`）只跑 `npm test`，不跑 `cargo test`，也不做完整 `npm run build`。

## 关键约束与坑

- Vite 固定端口 **1420**（`strictPort: true`，见 `vite.config.ts`）。`tauri dev` 依赖此端口，改端口会启动失败。HMR 走 1421。
- `src/api.ts` 是前端与 Rust 的唯一契约：每个 `invoke('xxx', ...)` 必须对应 `src-tauri/src/commands.rs` 里一个 `#[tauri::command]`。新增/改名 IPC 命令时两侧要同步，否则运行时才报错。
- 应用窗口是**无边框 + 透明**（`tauri.conf.json` 中 `decorations: false`、`transparent: true`），标题栏是前端手写的（`api.ts` 里的 `minimize_window` / `toggle_maximize_window` / `close_window`）。改窗口/拖拽相关样式要注意透明背景的坑。
- 数据存在系统数据目录下的 JSON 文件，经由 Rust 读写（`save_data` / `load_data`）。没有后端服务或数据库，不要假设有网络 API。
- 链接存活检测：`check_site_cmd` 用 reqwest 探测，对返回 dead 的站点再用 `verify_site_webview_cmd` 在 WebView 里复核（见 `store/app.ts` 的 `checkAll`）。离线时 `check_connectivity_cmd` 返回 false，会中止检测而不误标。

## 架构速记

- `src/store/app.ts`：核心 Pinia store（分类/标签/站点/回收站/检测逻辑），业务逻辑集中地，测试在 `src/store/app.spec.ts`。
- `src/composables/`：组合式函数（如 `useSelection.ts` 处理选择/框选）。
- `src/components/`：Vue 组件。
- `src-tauri/src/`：Rust 命令与逻辑。`commands.rs`（IPC 入口）、`data.rs`（读写/合并）、`check.rs` + `verify.rs`（检测）、`md.rs`（Markdown 导入导出）、`settings.rs`、`config.rs`。
- `src-tauri/capabilities/`：Tauri 权限配置，新增命令权限要在这里放行。

## 发布

推送 `v*` 标签（`git tag v0.1.x && git push origin v0.1.x`）触发 GitHub Actions 云端构建 NSIS/MSI 安装包并建 Release。本地无需手动构建发布产物。
