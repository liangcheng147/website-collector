# 功能批次 2 设计文档

日期：2026-09-26
状态：已确认
版本目标：v0.2.0

## 概述

本批次包含 10 项新功能与 3 项 Bug 修复，覆盖拖拽增强、浏览器书签互通、智能录入、检测提速、数据完整性与体验打磨。

## 功能清单

### F1. 多选拖拽

**问题**：当前拖拽只能单个站点移动，批量移动繁琐。

**方案**：拖拽任一已选中站点时，将 `store.selectedIds` 全部放入 `dataTransfer`；放置时调用现有 `moveSites(ids, catId)` 一次移动全部。拖拽未选中的站点保持现有单站点行为。放置目标不显示数量提示。

**改动**：
- `SiteTable.vue` `onSiteDragStart`：判断被拖站点是否在 `selectedIds` 中，是则将全部选中 ID 以逗号拼接放入 `dataTransfer`
- `CategoryNode.vue` / `Sidebar.vue` `onDrop`：按逗号拆分解析多 ID

### F2. 浏览器书签导入/导出

**问题**：无法与 Chrome/Firefox/Edge 书签互通，迁移成本高。

**方案**：Rust 端新增 `bookmarks_html.rs` 模块，解析/生成 Netscape Bookmark HTML 格式。

**导入规则**：
- `<H3>` → 分类，`<A HREF>` → 站点，嵌套 → 子分类
- 超过 3 层的文件夹拍平：深层内容上移至第 3 层文件夹
- 编码自动识别：优先 UTF-8，检测到乱码/无效序列时回退 GBK/GB18030（`encoding_rs`）
- HTML 内部同 URL 重复：保留首个（后续跳过）
- 合并模式：URL 已存在于当前数据 → 跳过，完成后提示"导入 X 个，跳过 Y 个重复"
- 覆盖模式：整体替换，先做 `.bak` 备份（与现有 MD 导入一致）

**导出规则**：
- 回收站站点不导出
- 未分类站点放在 HTML 根目录（不套文件夹）
- 分类层级原样映射

**新增 IPC**：`import_bookmarks_html(html: String) -> ParsedBookmarks`、`export_bookmarks_html(data: AppData) -> String`

**新增依赖**：Rust `scraper`（HTML 解析）、`encoding_rs`（GBK 转码）

### F3. URL 自动获取标题

**问题**：添加站点需手动输入名称。

**方案**：新增 `fetch_site_title_cmd`，reqwest GET 页面，提取 `<title>`。

**交互**：
- **自动**：URL 输入框失焦时触发
- **手动**：URL 框旁"获取名称"按钮，失败后变"重试获取"
- **填充规则**：仅名称框为空时填入；用户已输入则不覆盖
- **回退**：标题为空或明显占位符（"Loading..."等）→ 填域名（如 `github.com`）
- **失败**：URL 框下方小红字"无法获取标题，请手动输入或点击重试"
- **HTML 实体**：解码 `&amp;` `&lt;` 等
- **超时**：10 秒

### F4. 并发检测

**问题**：串行检测太慢（500 站点 ≈ 5-10 分钟）。

**方案**：HTTP 检测改为并发 5（`buffer_unordered(5)` 或等价机制）；**WebView 复核保持串行**（避免同时开多个隐藏窗口）。

- 进度条沿用现有"已检测 N/总数"逻辑
- 取消逻辑：等当前批次完成后停止
- 离线预检（`check_connectivity`）保持批次开始前执行一次

### F5. 编辑时 URL 去重

**问题**：编辑站点可将 URL 改成与已有站点相同。

**方案**：
- `updateSite` 前调用 `isDuplicateUrl(url, excludeId=当前站点id)`
- **归一化比较**：统一转小写 + 去尾部斜杠后比较
- 冲突时阻止保存，提示"该 URL 已存在"
- **同时修复**：回收站恢复（`restoreSites`）也加同样检查

### F6. 排序扩展

**问题**：仅支持名称/URL/状态排序。

**方案**：新增分类/备注/检测时间三个排序字段，表头点击三态循环（升→降→默认），与现有交互一致。

- **中文拼音排序**：`localeCompare(b, 'zh')`
- **null 值**（未分类、空备注、未检测）：跟随排序方向（升序在前，降序在后）
- 分类排序按分类显示名

### F7. 空状态引导

**问题**：无数据时界面空白，用户困惑。

**方案**：使用 `lucide-vue-next` 图标库（MIT 协议），各场景显示图标 + 文案：

| 场景 | 文案 |
|------|------|
| 全部为空 | "暂无站点，点击 + 添加第一个" |
| 筛选无结果 | "没有匹配的站点" |
| 分类为空 | "该分类下暂无站点" |
| 未分类为空 | "所有站点都已分类" |
| 回收站为空 | "回收站为空" |

**新增依赖**：`lucide-vue-next`

### F8. 筛选结果计数

**问题**：筛选后不知道结果数量。

**方案**：状态栏显示 `共 142 个 · 当前 12 个`；总数与当前相同时只显示总数。纯前端计算（`filteredSites.length`）。

### F9. 备注字数放宽

**问题**：50 字符太短。

**方案**：
- 限制 50 → 200 字符
- 输入框改 textarea，**禁止换行**（拦截 Enter 键，防止破坏 MD 导出格式）
- 显示字数统计 `18/200`
- 表格备注列超长截断 + hover 显示完整内容

### F10. Bug：checkOne 离线预检

**问题**：右键单个检测无离线预检，离线时误标 dead。

**方案**：`checkOne` 补齐 `check_connectivity` 预检，与 `checkAll`/`checkSelected` 一致。

### F11. Bug：save_data 原子写入

**问题**：`fs::write` 直接写，崩溃时可能损坏 JSON。

**方案**：写临时文件（同目录 `.tmp` 后缀）→ `fs::rename` 原子替换。

### F12. Bug：版本号对齐

**问题**：`package.json` 0.1.0 / `Cargo.toml` 0.1.2 / `tauri.conf.json` 0.1.5 不一致。

**方案**：三文件统一为 `0.2.0`。

## 架构影响

### 新增文件
- `src-tauri/src/bookmarks_html.rs`：Netscape HTML 解析/生成

### 修改文件（关键）
- `src/api.ts`：+3 个 IPC 包装（`importBookmarksHtml` / `exportBookmarksHtml` / `fetchSiteTitle`）
- `src-tauri/src/commands.rs`：+3 个命令
- `src-tauri/src/lib.rs`：注册新命令
- `src-tauri/capabilities/`：放行新命令权限
- `src/store/app.ts`：多选拖挽数据、排序扩展、去重、计数、检测并发
- `src/components/SiteTable.vue`：多选拖拽、排序表头、备注截断
- `src/components/Sidebar.vue` / `CategoryNode.vue`：多 ID drop 解析
- `src/components/AddEditModal.vue`：URL 自动获取标题、备注 textarea
- `src/components/StatusBar.vue`：筛选计数
- `src/components/ImportExportModal.vue`：书签 HTML 导入/导出选项

### 新增依赖
- Rust：`scraper`、`encoding_rs`
- 前端：`lucide-vue-next`

## 测试策略

- **Rust**（`cargo test`）：`bookmarks_html.rs` 解析（层级拍平、GBK 编码、内部去重、 malformed HTML）、`fetch_site_title` 提取逻辑（本地 TCP 测试服务器，沿用 `check.rs` 模式）、原子写入（写失败不破坏原文件）
- **前端**（Vitest）：多选拖拽 store 逻辑、排序（拼音、null 方向）、URL 归一化去重（编辑/恢复）、计数、备注校验（200 上限、禁换行）、空状态组件渲染、checkOne 离线中止

## 错误处理

| 场景 | 处理 |
|------|------|
| 书签 HTML 解析失败 | 报错提示"文件格式无法识别"，不修改现有数据 |
| 标题获取超时/失败 | 小红字提示 + 重试按钮，不阻塞用户手动输入 |
| 合并导入重复 | 跳过并统计，完成后提示数量 |
| 原子写入失败 | 回退保留原文件，记录 `.bak` |
