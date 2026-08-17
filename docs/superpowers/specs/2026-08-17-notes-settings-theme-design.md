# 备注 + 设置（主题/缩放）设计文档

> 日期：2026-08-17
> 项目：「归集」（网站收藏管家，Tauri 2 + Vue 3 + Pinia）
> 状态：已与用户确认（含亮/暗双主题可视化预览）

## 1. 背景与目标

正式版「归集」需要新增两个能力：

1. **网站备注**：为每条网站记录一段 50 字以内的简介，表格直接可见。
2. **设置页扩展**：主题模式（跟随系统 / 亮 / 暗）+ 界面缩放（80%–200%），以及对应**整体暗色换肤**。

约束：仅改变视觉风格与新增字段/设置，**不改变任何现有交互逻辑与布局结构**；数据继续便携存储在 `./data/`。

## 2. 功能清单（已确认）

### 2.1 网站备注
- 添加/编辑网站弹窗新增「备注（50 字以内）」输入框（`AddEditModal.vue`）。
- 表格 `SiteTable.vue` **最后一列**新增「备注」，直接可见，超宽截断（`max-width` + `ellipsis`）。
- 备注**不参与搜索**（搜索仍只匹配名称/链接/标签）。
- 数据模型 `Site` 增加 `note: string` 字段，随 `websites.json` 存取。
- MD 导出/导入：备注用 `> ` 引用行跟在对应站点行下方；含 tab/换行的备注导出时清洗为空格；导入时读回备注。
- 回收站中删除/恢复站点时备注自动随站点保留。

### 2.2 设置页（三分区）
- 设置弹窗 `SettingsModal.vue` 改为三个分区：**主题 / 显示 / 数据存储**（分区按钮切换）。
- 主题分区：三选「跟随系统 / 亮色 / 暗色」。跟随系统 = **启动时读取一次**系统主题，运行中不实时跟随。
- 显示分区：界面缩放滑块，范围 80%–200%，步进 10%，整体放大/缩小所有界面文字与控件。
- 数据存储分区：保留现有「数据文件 + 打开数据目录 + 存储说明」内容不变。
- 设置持久化到独立文件 `./data/settings.json`（与 `websites.json` 分开）。

### 2.3 暗色模式（整体换肤）
- 暗色覆盖所有界面：标题栏、顶栏、侧栏、表格、状态栏、所有弹窗、表单控件、右键菜单。
- 通过 CSS 变量切换实现：亮色沿用现有 `:root` 变量，暗色通过根元素 class（如 `html[data-theme="dark"]`）覆盖同一套变量名。
- 暗色配色（已确认）：
  - 背景 `--bg: #16181D`，面板 `--panel: #1F2329`
  - 文字 `--text: #E4E6EB`，次级 `--text-2: #9AA0AE`
  - 主色 `--primary: #6B8AFF`（`--primary-w: #4A6CF7`），`--primary-t: #232A45`
  - 边框 `--border: #2A2D36`，`--border-2: #343846`，`--hover: #23262E`
  - 状态：`--ok/--ok-txt: #4ADE80`，`--pending/--pending-txt: #FBBF24`，`--danger: #F87171`，`--danger-bg: #2A1D1D`

## 3. 数据设计

### 3.1 `Site` 增加 `note` 字段

```rust
// src-tauri/src/data.rs
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String, pub name: String, pub url: String,
    pub category_id: Option<String>,
    #[serde(default)] pub tags: Vec<String>,
    #[serde(default)] pub status: String,
    pub last_check: Option<String>,
    #[serde(default)] pub note: String,
}
```

```ts
// src/types.ts
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
  note: string
}
```

> 兼容性：`#[serde(default)]` 保证旧 `websites.json`（无 note 字段）加载时自动补空字符串，无需数据迁移。

### 3.2 设置存储 `settings.json`

```rust
// src-tauri/src/settings.rs
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)] pub theme: String,   // "system" | "light" | "dark"
    #[serde(default)] pub zoom: u32,       // 80..=200，步进 10，默认 100
}
```

- 存储路径：与数据同目录 `./data/settings.json`（回退到系统目录时同数据目录）。
- 读写走 Tauri command，前端经 `@tauri-apps/api/core` invoke。

## 4. 架构与改动点

### 4.1 新增文件
| 文件 | 职责 |
|---|---|
| `src-tauri/src/settings.rs` | `Settings` 结构 + `settings_file_path` / `load_settings` / `save_settings` |
| `src/settings.ts`（或并入 `api.ts`） | 前端 invoke 封装：`getSettings` / `setSettings` |
| `src/styles/dark.css`（或并入 `main.css`） | 暗色 CSS 变量覆盖集 |
| `src/composables/useTheme.ts`（可选） | 主题与缩放的应用逻辑（设置 `data-theme`、`--zoom`） |

### 4.2 修改文件
| 文件 | 改动 |
|---|---|
| `src-tauri/src/data.rs` | `Site` 加 `note` 字段；`merge_into` 合并时保留/合并 note |
| `src-tauri/src/md.rs` | 导出加 `> ` 备注行（清洗 tab/换行）；导入解析 `>` 行读回 note |
| `src-tauri/src/lib.rs` | 注册 `get_settings` / `set_settings` command |
| `src-tauri/src/commands.rs` | 新增 `get_settings` / `set_settings` command 实现 |
| `src/types.ts` | `Site` 加 `note` |
| `src/store/app.ts` | 站点新增/编辑/更新时携带 note；`addSite`/`updateSite` 签名扩展 |
| `src/components/SiteTable.vue` | 表头 + 单元格新增「备注」列 |
| `src/components/AddEditModal.vue` | 新增「备注（50 字以内）」输入框 |
| `src/components/ImportExportModal.vue` | MD 格式示例文案更新 |
| `src/components/SettingsModal.vue` | 改为三分区，新增主题三选 + 缩放滑块 |
| `src/styles/main.css` | 增加暗色变量块（或单独文件）+ 分区按钮样式 |

### 4.3 主题与缩放应用机制
- 主题：根元素 `document.documentElement.dataset.theme = 'system'|'light'|'dark'`。CSS 中 `html[data-theme="dark"] { --bg: ...; }` 覆盖变量；`system` 时依据 `window.matchMedia('(prefers-color-scheme: dark)')` 是否命中决定亮/暗。
- 缩放：`document.documentElement.style.fontSize = zoom/100 * 14 + 'px'`（根字号 14px 为基准，所有尺寸均用 rem/em 或随根字号缩放）。启动时读取 settings 应用。

### 4.4 错误处理
- settings.json 缺失/损坏：`load_settings` 返回默认值（`system` + `100`），损坏时尝试备份 `.bak`（复用现有 `load_data` 模式）。
- settings.json 写入失败：`save_settings` 返回错误字符串，前端状态栏提示。

## 5. 测试策略

- **Rust 单测**（沿用 `#[cfg(test)]` 模式）：
  - `data.rs`：带 note 的 save/load roundtrip；旧 JSON（无 note）加载后 note 为空。
  - `md.rs`：导出含 `> 备注` 行；导入读回 note；备注含 tab/换行导出被清洗；roundtrip 结构不变。
  - `settings.rs`：默认值；save/load roundtrip；损坏文件回退默认。
- **前端测试**（Vitest，现有 17 用例目录）：`store/app.ts` 的 `addSite`/`updateSite` 携带 note；搜索不匹配 note。
- 手动验收：两种主题切换即时生效；缩放 80%/100%/150% 下界面正常；重启后设置保持。

## 6. 范围外（YAGNI）
- 不实时监听系统主题变化（按确认：启动读一次）。
- 备注不参与搜索、不做单独筛选。
- 不做亮/暗以外的更多主题。
- 缩放不针对单项字体分别设置。

## 7. 验收标准
1. 网站可添加/编辑备注，表格最后一列可见，旧数据加载正常。
2. MD 导出包含 `> ` 备注行、导入可读回；tab/换行备注不破坏格式。
3. 设置弹窗三分区可用；主题三选切换整体换肤；跟随系统按启动时系统主题生效。
4. 缩放滑块 80%–200% 生效且重启保持。
5. 全部现有测试 + 新增测试通过；`npm run tauri build` 成功。
