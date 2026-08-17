# 归集 · 正式版视觉与便携存储 设计文档

> 日期：2026-08-17
> 状态：已与用户逐条确认
> 关联代码：`dev/website-collector`（v1.2 已合并）

## 1. 目标

把「网站收藏管家」正式版改造为 **「归集」**：全面换用「简约商务」视觉风格（方案 A），并改为 **便携固定式数据存储**（exe 旁 `./data/`）。功能逻辑保持不变，只改样式、命名与存储策略。

## 2. 全局约束

- **软件正式名**：「归集」（拼音 Guī Jí）。所有对外文案（窗口标题、顶栏 logo、productName）一律使用「归集」，不再出现「网站收藏管家」。
- **字母简写**：GJ。标题栏左侧放置 GJ 方块 logo（无文字、无图标），悬停显示「归集」。
- **无边框窗口**：`decorations: false`，自绘标题栏。
- **主色** `#3B5BDB`，hover `#2F4EC0`，淡底 `#EAF0FF`；背景暖白 `#F7F8FA`；面板纯白；主文字 `#1F2329`；次要文字 `#6B7280`；边框 `#E5E7EB`；悬停底 `#EEF1F6`。
- **语义色**：成功 `#16A34A`/文字 `#15803D`；警告 `#F59E0B`/文字 `#B45309`；错误 `#DC2626`。
- **圆角**：6px（按钮/输入框）、10px（面板/弹窗）、999px（胶囊标签）。
- **阴影**：常规 `0 1px 2px rgba(16,24,40,.06)`；浮层 `0 4px 14px rgba(16,24,40,.08)`。
- **字体**：系统无衬线 `"Segoe UI",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif`；数字/链接等宽 `Consolas,monospace`。不打包字体。
- **字号**：标题 15 / 表头 12 / 正文 13 / 辅助 11。
- **图标**：线性 1.5px，选中态填充主色。
- **暗色模式**：v1 不做，但所有颜色一律通过 CSS 变量实现，变量集中在 `src/styles/main.css` 的 `:root`。
- **弹窗宽度**：外层 `min(420px, 92%)`，嵌套弹窗 `min(380px, 92%)`，`max-height: calc(100% - 32px)` + `overflow:auto`。
- **布局**：侧栏固定 170px，内容 `1fr`；窗口 1200×800，min 900×600。
- **数据存储**：固定存 exe 旁 `./data/websites.json`；安装目录无写权限时回退系统用户目录。无「更改存储位置」功能、不做旧数据迁移。
- **Node 依赖约束**：不新增 npm 依赖。
- **Rust 依赖约束**：不新增 cargo 依赖。

## 3. 架构

改动分三条线，互不耦合，各自独立可测：

1. **数据层（Rust）**：新增「数据目录解析」逻辑——exe 所在目录优先，无写权限时回退 app_data_dir。替换现有 `config::read_data_dir` 主导的路径解析。
2. **窗口（Tauri 配置 + Rust）**：`tauri.conf.json` 加 `decorations:false`；新增命令 `window` 操作（最小化/最大化/关闭/最大化状态）。前端自绘标题栏。
3. **前端（Vue）**：`main.css` 全部重写为简约商务变量与组件样式；`TopBar` 改为新布局（GJ 图标 + 归集 + 搜索 + 操作按钮）；新增 `TitleBar.vue` 自绘标题栏；`SettingsModal` 去掉「更改位置」改为「打开数据目录」；弹窗宽度 560→420。

## 4. 数据流

### 4.1 数据目录解析（Rust）

拆成**纯函数 + IO 探测**，纯函数可直接单测：

```rust
// config.rs 内新增（纯逻辑，无 IO）
/// exe_dir: 可执行文件所在目录；app_data_dir: 系统用户数据目录；exe_writable: 探测结果
pub fn resolve_data_dir(exe_dir: &Path, app_data_dir: &Path, exe_writable: bool) -> (PathBuf, bool) {
    if exe_writable { (exe_dir.join("data"), false) } else { (app_data_dir, true) }
}
```

```rust
// 写权限探测（IO）
pub fn exe_dir_writable(exe_dir: &Path) -> bool {
    let probe = exe_dir.join(format!(".wprobe_{}", std::process::id()));
    match fs::write(&probe, b"") { Ok(_) => { let _ = fs::remove_file(&probe); true }, Err(_) => false }
}
```

- `active_data_dir(app)`：`let exe_dir = std::env::current_exe().and_then(|p| Ok(p.parent().unwrap_or(std::path::Path::new(".")).to_path_buf())).unwrap_or_else(|_| std::path::PathBuf::from("."));` 再取 `app.path().app_data_dir()`，调用 `resolve_data_dir(exe_dir, app_data_dir, exe_dir_writable(&exe_dir))`，返回 `.0`。
- 回退发生时：命令 `get_data_location` 返回 `{ dir, isFallback }`（`isFallback = resolve_data_dir(...).1`），前端状态栏显示「数据已存到系统目录（安装位置无写入权限）」。
- `set_data_dir` / `migrate_data_dir` / `probe_data_dir` 相关命令与 API **删除**；`config.rs` 中 `read_data_dir` / `write_data_dir` / `exists` 一并删除（含测试）。
- `FirstLaunchModal` 引导流程删除（首次启动不再询问存储位置，直接使用 exe 旁 data）。保留 `has_config` 命令？否——一并删除，前端不再判断 firstLaunch。

### 4.2 打开数据目录（Rust）

- 新增命令 `open_data_dir`：调用 `tauri_plugin_opener::open_path` 打开 `active_data_dir`；目录不存在则先创建。

### 4.3 窗口控制（Rust 命令 + 前端）

新增命令（在 commands.rs 或独立 window.rs）：

```
minimize_window(app)  ->  get_webview_window("main").minimize()
toggle_maximize_window(app) -> get_webview_window("main").toggle_maximize()
close_window(app) -> get_webview_window("main").close()
is_maximized(app) -> bool
```

前端 TitleBar 三按钮调用上述命令；双击标题栏 = `toggle_maximize_window`。

### 4.4 前端数据流

- `store.init()` 后调用 `getDataLocation()` 获取 `{ dir, isFallback }`，`isFallback` 存 state，StatusBar 显示提示。
- 移除 `api.hasConfig()`、`api.setDataDir()`、`api.probeDataDir()`、`api.migrateDataDir()`；`App.vue` 删除 `firstLaunch` 状态与 `FirstLaunchModal` 引用。

## 5. 组件与样式映射

### 5.1 TitleBar.vue（新建）

- 全宽自绘标题栏，高 38px，白色背景，圆角随窗口。
- 左侧：GJ logo（24×24 靛蓝圆角方块，白字）；悬停显示 tooltip「归集」。
- 右侧三按钮：最小化（—）、最大化/还原（□）、关闭（✕）。关闭悬停 `#E81123` 白字。按钮区 44px 宽、hover 底 `#EEF1F6`。
- 整条 `data-tauri-drag-region` 可拖动；双击切换最大化。
- 关闭按钮用 `#E81123`（Windows 惯例）而不是主题错误色。

### 5.2 main.css 重写

- `:root` 全部换为 §2 颜色变量；字体改系统字体。
- 组件类逐一重排：`.topbar`、`.sidebar`、`.statusbar`、`.site-table`、`.cb`、`.chip`、`.batchbar`、`.modal*`、`.ctx*`、`.empty` 等，全部应用新主题。
- 去掉阴影边框（`2px 2px 0`）、去掉 `Courier New` 字体、去掉 `button:hover translateY` 糖果动效，改为轻过渡。
- 保留 `rowIn`/`statusPop` 动画但减淡（透明度/位置微动，保持克制）。

### 5.3 TopBar.vue

- logo 区：`<span class="lg-ic">GJ</span> 归集`。
- 其余按钮文字保留：搜索框、标签筛选、检测全部、＋ 添加、导入/导出、⚙。
- 按钮样式统一 `.btn`（白底细边框圆角）+ `.btn.primary`（靛蓝底）。

### 5.4 SettingsModal.vue

- 标题「设置 · 数据存储」。
- 只显示数据路径（`getDataFilePath()`）+「打开数据目录」按钮（`openDataDir`），删除「更改位置…」与迁移逻辑。

### 5.5 弹窗宽度

- `.modal`：`width: min(420px, 92%)`；`padding: 16px 18px`；`max-height: calc(100% - 32px); overflow: auto`。
- `.modal-cols` gap 16px；`.modal .help` padding-left 14px。
- 嵌套弹窗 `.modal-inner` 或同 `.modal` 覆盖 `min(380px, 92%)`。

### 5.6 其他

- `App.vue`：去掉 `firstLaunch` 与 FirstLaunchModal import/使用；`html,body,#app` 高度不变；`.app` 加 `--titlebar-h` 行参与 TitleBar 布局。
- `index.html`：`<title>归集</title>`。
- `tauri.conf.json`：`productName: "归集"`，`title: "归集"`，window 加 `decorations: false`。

## 6. 错误处理

- 数据目录回退：`get_data_location` 返回 `isFallback`，前端状态栏常驻提示「数据已存系统目录（安装位置无写权限）」，直到 `flash` 被新消息覆盖或再次检测。
- 打开数据目录失败：命令返回 Err，前端 `msg` 显示错误。
- 无其他新增错误路径；原有导入/检测错误处理不变。

## 7. 测试

### 7.1 Rust（cargo test）

- `resolve_data_dir` 纯函数测试：exe 可写 → `(exe_dir/data, false)`；exe 只读 → `(app_data_dir, true)`。
- `exe_dir_writable` 测试：temp 目录写入探测成功返回 true；只读目录（`fs::set_permissions` 去掉写权限，Windows 下用 temp 子目录 + 只读属性）返回 false。
- 删除 config.rs 旧测试（read_data_dir/write_data_dir/exists 均已删除）。
- `open_data_dir` 不测（依赖外部 opener）。

### 7.2 前端（vitest）

- `app.spec.ts`：`init` 后 `getDataLocation` 返回值写入 state（mock api）；移除 hasConfig/firstLaunch 相关断言。
- 新增 `store.location` 断言：`isFallback` 影响 StatusBar 提示。

### 7.3 手动验收清单

- `npm run tauri dev`：无边框窗口 + GJ 标题栏 + 三按钮可用；双击/拖动标题栏正常。
- 标题栏关闭按钮关窗、最大化/还原正常。
- 数据存到 exe 旁 `./data/websites.json`；设置弹窗「打开数据目录」打开正确目录。
- 弹窗 420px 不溢出，内容超长可滚动。
- 窗口缩到 900×600 布局不坏；缩小标题栏按钮仍可点。
- 全界面无糖果像素残留（边框阴影、字体、圆角）。

## 8. 范围外（明确不做）

- 暗色模式
- 旧数据迁移（从用户目录搬到 exe 旁）
- 自定义图标（正式版图标另行处理，本次仅 GJ 文字 logo）
- 移动端