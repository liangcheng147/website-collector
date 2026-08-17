# 备注 + 设置（主题/缩放）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「归集」增加网站备注字段（含 MD 导入导出）、设置弹窗三分区（主题/显示/数据存储）、界面缩放与整体暗色换肤。

**Architecture:** 数据层在 Rust（`data.rs` 加 `note` 字段、新增 `settings.rs` 存 `./data/settings.json`），经 Tauri command 暴露；前端 Pinia store 承载站点与设置状态，主题/缩放通过根元素 `data-theme` 与 CSS `zoom` 应用；暗色配色以 `html[data-theme="dark"]` CSS 变量覆盖实现，亮色主题完全不动。

**Tech Stack:** Tauri 2 / Rust 2.11.5，Vue 3 + Pinia，TypeScript，Vitest + cargo test。

## Global Constraints

- 仅改变视觉风格与新增字段/设置，不改变任何现有交互逻辑与布局结构。
- 数据继续便携存储在 `./data/`（`websites.json` 与新增 `settings.json` 同目录）。
- 备注 50 字以内；不参与搜索（搜索仍只匹配名称/链接/标签）。
- 主题三档：`system` / `light` / `dark`；跟随系统 = 启动时读取一次，运行中不实时跟随。
- 缩放范围 80–200，步进 10，默认 100。
- 所有测试命令：Rust `cargo test`（在 `src-tauri/` 下）；前端 `npm test`；类型+构建 `npm run build`；打包 `npm run tauri build`。
- 提交信息风格：`feat:` / `fix:` / `docs:` + 中文说明（参照仓库历史）。
- 旧数据兼容：`Site.note` 用 `#[serde(default)]`，旧 `websites.json` 无需迁移。
- 暗色配色固定值：`--bg:#16181D`、`--panel:#1F2329`、`--text:#E4E6EB`、`--text-2:#9AA0AE`、`--primary:#6B8AFF`、`--primary-w:#4A6CF7`、`--primary-t:#232A45`、`--border:#2A2D36`、`--border-2:#343846`、`--hover:#23262E`、`--ok/--ok-txt:#4ADE80`、`--pending/--pending-txt:#FBBF24`、`--danger:#F87171`、`--danger-bg:#2A1D1D`。

---

### Task 1: Rust 数据模型 — `Site.note` 字段

**Files:**
- Modify: `src-tauri/src/data.rs`（`Site` 结构 + `merge_into` + 测试）
- Test: `src-tauri/src/data.rs`（现有 `mod tests` 内）

**Interfaces:**
- Produces: `Site` 新增 `pub note: String`（`#[serde(default)]`，camelCase）。`merge_into(current: &mut AppData, incoming: &AppData)` 语义：已存在（按 url 匹配）站点**保留**其现有 note；新建站点拷贝 incoming 的 note。

- [ ] **Step 1: 写失败测试**

在 `data.rs` 的 `mod tests` 中新增/修改：

```rust
#[test]
fn site_note_roundtrip() {
    let d = tmp_dir("note_rt");
    let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    data.sites.push(Site {
        id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
        category_id: None, tags: vec![], status: "ok".into(), last_check: None,
        note: "官方文档".into(),
    });
    save_data(&d, &data).unwrap();
    let loaded = load_data(&d);
    assert_eq!(loaded.sites[0].note, "官方文档");
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn legacy_json_without_note_loads_empty() {
    let d = tmp_dir("legacy_note");
    let p = data_file_path(&d);
    std::fs::write(&p, r#"{"version":1,"categories":[],"sites":[{"id":"s1","name":"A","url":"https://a.dev","categoryId":null,"tags":[],"status":"ok","lastCheck":null}],"recycleBin":[],"tags":[]}"#).unwrap();
    let data = load_data(&d);
    assert_eq!(data.sites[0].note, "");
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn merge_keeps_existing_note_and_copies_new() {
    let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "已有备注".into() });
    let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    incoming.sites.push(Site { id: "x".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "incoming 备注".into() });
    incoming.sites.push(Site { id: "y".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "新站点备注".into() });
    merge_into(&mut current, &incoming);
    assert_eq!(current.sites[0].note, "已有备注", "已存在站点保留原备注");
    assert_eq!(current.sites[1].note, "新站点备注", "新站点拷贝备注");
}
```

同时更新现有 `save_then_load_roundtrip` 测试中的 `Site` 构造（第 144-148 行）加 `note: "".into()`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test`
Expected: 编译错误 `no field 'note' on type 'Site'`。

- [ ] **Step 3: 实现**

在 `data.rs` 的 `Site` 结构体末尾加字段：

```rust
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

在 `merge_into` 的新建站点分支（约第 109-113 行）加 `note: s.note.clone(),`：

```rust
current.sites.push(Site {
    id: s.id.clone(), name: s.name.clone(), url: s.url.clone(),
    category_id: target_cat, tags: s.tags.clone(),
    status: "unknown".into(), last_check: None,
    note: s.note.clone(),
});
```

注意：`merge_into` 中"已存在"分支只更新 `name`/`category_id`，**不要**更新 `note`（保留原值）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test`
Expected: 全部 PASS（含新增 3 个 + 修改后的既有测试）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/data.rs
git commit -m "feat: Site 增加 note 备注字段（兼容旧数据，merge 保留原备注）"
```

---

### Task 2: Rust 设置模块 `settings.rs` + command 注册

**Files:**
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/commands.rs`（新增两个 command）
- Modify: `src-tauri/src/lib.rs`（`mod settings;` + 注册 command）

**Interfaces:**
- Produces:
  - `settings::Settings { theme: String, zoom: u32 }`（camelCase 序列化；默认 `theme="system"`、`zoom=100`）
  - `settings::defaults() -> Settings`
  - `settings::load_settings(data_dir: &Path) -> Settings`
  - `settings::save_settings(data_dir: &Path, s: &Settings) -> Result<(), String>`
  - command `get_settings(app: AppHandle) -> settings::Settings`
  - command `set_settings(app: AppHandle, settings: settings::Settings) -> Result<(), String>`
- Consumes: `commands::active_data_dir(&app) -> PathBuf`（已存在，私有函数，本文件内直接用）。

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/settings.rs`，包含实现与测试：

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)] pub theme: String,
    #[serde(default)] pub zoom: u32,
}

impl Settings {
    pub fn defaults() -> Self {
        Settings { theme: "system".into(), zoom: 100 }
    }
}

pub fn settings_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

pub fn load_settings(data_dir: &Path) -> Settings {
    let path = settings_file_path(data_dir);
    if !path.exists() { return Settings::defaults(); }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str::<Settings>(&s).unwrap_or_else(|_| {
            let _ = fs::copy(&path, path.with_extension("json.bak"));
            Settings::defaults()
        }),
        Err(_) => Settings::defaults(),
    }
}

pub fn save_settings(data_dir: &Path, s: &Settings) -> Result<(), String> {
    let path = settings_file_path(data_dir);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("settings_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn missing_returns_defaults() {
        let s = load_settings(&tmp_dir("missing"));
        assert_eq!(s.theme, "system");
        assert_eq!(s.zoom, 100);
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = tmp_dir("roundtrip");
        let s = Settings { theme: "dark".into(), zoom: 130 };
        save_settings(&d, &s).unwrap();
        assert_eq!(load_settings(&d).theme, "dark");
        assert_eq!(load_settings(&d).zoom, 130);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn corrupt_returns_defaults_and_backs_up() {
        let d = tmp_dir("corrupt");
        fs::write(settings_file_path(&d), "{ bad").unwrap();
        assert_eq!(load_settings(&d).zoom, 100);
        assert!(settings_file_path(&d).with_extension("json.bak").exists());
        let _ = fs::remove_dir_all(&d);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test`
Expected: 编译错误，因为 `lib.rs` 还没有 `mod settings;`。

- [ ] **Step 3: 注册模块与 command**

`src-tauri/src/lib.rs`：
- 第 6 行 `mod data;` 后加一行 `mod settings;`
- `invoke_handler` 列表中（约第 18-36 行）加：
```rust
commands::get_settings,
commands::set_settings,
```

`src-tauri/src/commands.rs`：
- 第 1 行改为：`use crate::{check, config, data, md, settings};`
- 文件末尾（`is_maximized` 后）加：

```rust
#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> settings::Settings {
    settings::load_settings(&active_data_dir(&app))
}

#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, settings: settings::Settings) -> Result<(), String> {
    settings::save_settings(&active_data_dir(&app), &settings)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test`
Expected: 全部 PASS（新增 3 个 settings 测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/settings.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 新增 settings.rs（./data/settings.json 读写）+ get/set_settings 命令"
```

---

### Task 3: Rust MD 导入导出 — 备注 `>` 引用行

**Files:**
- Modify: `src-tauri/src/md.rs`（`export_to_md` 遍历 + `import_from_md` 解析 + 测试）

**Interfaces:**
- Consumes: `Site.note: String`（Task 1）
- Produces:
  - 导出：站点行后跟 `> {note}` 行（note 非空时）；note 中 `\t` `\n` `\r` 替换为空格。
  - 导入：紧跟在某站点行之后的 `>` 开头的行 → 作为该站点 note；标题出现后重置"上一条站点"记录（防止跨分类串位）。

- [ ] **Step 1: 写失败测试**

修改 `md.rs` 现有测试并新增。`export_roundtrip_preserves_structure` 测试数据（第 110-115 行）的 `Site` 加 `note: "React 官方文档与教程站".into()`，断言改为：

```rust
assert!(md.contains("React\thttps://react.dev\t✅ 2026-08-15"));
assert!(md.contains("> React 官方文档与教程站"));
```

`import_ignores_status_and_tags` 的输入文本改为含备注行：

```rust
let text = "# 开发工具\n## 前端\nReact\thttps://react.dev\t✅ 2026-08-15\n> React 官方文档与教程站\nVue\thttps://vuejs.org\t❌ 2026-08-15\n";
let data = import_from_md(text);
// ...现有断言...
assert_eq!(data.sites[0].note, "React 官方文档与教程站");
assert_eq!(data.sites[1].note, "");
```

新增两个测试：

```rust
#[test]
fn export_sanitizes_note_tabs_and_newlines() {
    let data = AppData {
        version: 1,
        categories: vec![Category { id: "c1".into(), name: "开发".into(), children: vec![] }],
        sites: vec![Site {
            id: "s1".into(), name: "A".into(), url: "https://a.dev".into(),
            category_id: Some("c1".into()), tags: vec![], status: "ok".into(),
            last_check: Some("2026-08-15".into()), note: "多\t列\n换行\r备注".into(),
        }],
        recycle_bin: vec![], tags: vec![],
    };
    let md = export_to_md(&data);
    assert!(md.contains("> 多 列 换行 备注"));
    assert!(!md.contains('\t'), "备注中的 tab 已被替换为空格");
}

#[test]
fn import_note_binding_stops_at_heading() {
    let text = "# 开发\n- [A](https://a.dev)\n> A 的备注\n# 资讯\n> 游离备注不应被读入\n- [B](https://b.dev)\n";
    let data = import_from_md(text);
    assert_eq!(data.sites[0].note, "A 的备注");
    assert_eq!(data.sites[1].note, "");
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test`
Expected: 编译错误（`Site` 构造缺 `note`）或断言失败（当前导出无 `>` 行）。

- [ ] **Step 3: 实现**

`export_to_md` 的 `walk` 中，站点循环（第 8-10 行）改为：

```rust
for s in data.sites.iter().filter(|s| s.category_id.as_deref() == Some(&c.id)) {
    out.push_str(&site_line(s));
    let note = s.note.trim().replace('\t', " ").replace('\n', " ").replace('\r', " ");
    if !note.is_empty() { out.push_str(&format!("> {}\n", note)); }
}
```

`import_from_md` 中：
- 声明处（`let mut site_seq = 0usize;` 附近）加 `let mut last_site: Option<usize> = None;`
- 标题分支（`if line.starts_with('#')` 内、push 标题后）加 `last_site = None;`
- 站点分支末尾（`site_seq += 1;` 后）加 `last_site = Some(sites.len() - 1);`
- 新增一个解析分支（放在站点分支之后、`}` 之前）：

```rust
} else if let Some(note_text) = line.strip_prefix('>') {
    let note = note_text.trim();
    if let Some(idx) = last_site { if !note.is_empty() { sites[idx].note = note.to_string(); } }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/md.rs
git commit -m "feat: MD 导出/导入支持备注（> 引用行，清洗 tab/换行，标题处重置绑定）"
```

---

### Task 4: 前端类型 / API / store — note 与 settings

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`
- Modify: `src/store/app.ts`
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: command `get_settings` / `set_settings`（Task 2）
- Produces:
  - `types.ts`: `Site.note: string`；新增 `export interface Settings { theme: 'system' | 'light' | 'dark'; zoom: number }`
  - `api.ts`: `getSettings(): Promise<Settings>`、`setSettings(settings: Settings): Promise<void>`
  - store state `settings: Settings`（初始 `{ theme: 'system', zoom: 100 }`）
  - `addSite(input: { name; url; categoryId; tags; note })`
  - store action `applyAppearance()`：设置 `document.documentElement.dataset.theme` 为 `dark`/`light`；设置 `style.zoom = String(zoom/100)`。`typeof document === 'undefined'` 时直接返回（Vitest node 环境用）。
  - store action `updateSettings(patch: Partial<Settings>)`：合并、`applyAppearance()`、`api.setSettings` 持久化，失败 `flash('设置保存失败：' + e)`。

- [ ] **Step 1: 写失败测试**

`src/store/app.spec.ts`：
- 第 4-10 行 mock 增加：
```ts
getSettings: vi.fn().mockResolvedValue({ theme: 'system', zoom: 100 }),
setSettings: vi.fn().mockResolvedValue(undefined),
```
- `makeSite`（第 14-16 行）返回对象加 `note: ''`。
- 新增/修改测试：

```ts
it('addSite carries note', () => {
  const s = useAppStore()
  s.data = baseData
  s.addSite({ name: 'Vite', url: 'https://vite.dev', categoryId: 'c2', tags: ['工具'], note: '构建工具' })
  expect(s.data.sites.at(-1)!.note).toBe('构建工具')
})

it('updateSite sets note', () => {
  const s = useAppStore()
  s.data = baseData
  s.updateSite('a', { note: '新备注' })
  expect(s.data.sites[0].note).toBe('新备注')
})

it('search ignores note', () => {
  const s = useAppStore()
  s.data = baseData
  s.data.sites[0].note = '绝密内部关键词'
  s.view = { kind: 'all' }
  s.search = '绝密内部关键词'
  expect(s.filteredSites).toHaveLength(0)
})

it('updateSettings persists and applies', async () => {
  const s = useAppStore()
  await s.updateSettings({ zoom: 150 })
  expect(s.settings.zoom).toBe(150)
  expect(api.setSettings).toHaveBeenCalledWith({ theme: 'system', zoom: 150 })
})

it('init loads settings', async () => {
  vi.mocked(api.getSettings).mockResolvedValue({ theme: 'dark', zoom: 130 })
  const s = useAppStore()
  await s.init()
  expect(s.settings).toEqual({ theme: 'dark', zoom: 130 })
})
```

注意：现有 `addSite` 测试（第 89-96 行）的调用也要补 `note: ''`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: 类型/断言失败（`note` 不存在、`settings` 不存在等）。

- [ ] **Step 3: 实现**

`src/types.ts`：

```ts
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
  note: string
}
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  zoom: number
}
```

`src/api.ts`（第 2 行 import 加 `Settings`，末尾加）：

```ts
export const getSettings = () => invoke<Settings>('get_settings')
export const setSettings = (settings: Settings) => invoke<void>('set_settings', { settings })
```

`src/store/app.ts`：
- import `Settings` 类型（第 2 行 `import type { AppData, Site, TrashedSite, View, Category, Settings } from '../types'`）。
- state 增加：`settings: { theme: 'system', zoom: 100 } as Settings,`
- `addSite` 签名与实现（第 93-101 行）改为：

```ts
addSite(input: { name: string; url: string; categoryId: string | null; tags: string[]; note: string }) {
  if (this.isDuplicateUrl(input.url)) return
  this.data.sites.push({
    id: this.id_gen(), name: input.name, url: input.url,
    categoryId: input.categoryId, tags: [...input.tags],
    status: 'unknown', lastCheck: null, note: input.note,
  })
  this.refreshTags()
},
```

- `init()`（第 67-71 行）改为：

```ts
async init() {
  this.data = await api.loadData()
  const loc = await api.getDataLocation()
  this.location = loc
  this.settings = await api.getSettings()
  this.applyAppearance()
},
```

- 在 `flash` action 之后新增：

```ts
applyAppearance() {
  if (typeof document === 'undefined') return
  const s = this.settings
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.zoom = String(s.zoom / 100)
},
async updateSettings(patch: Partial<Settings>) {
  this.settings = { ...this.settings, ...patch }
  this.applyAppearance()
  try { await api.setSettings(this.settings) } catch (e) { this.flash('设置保存失败：' + e) }
},
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/api.ts src/store/app.ts src/store/app.spec.ts
git commit -m "feat: 前端支持 note 字段与 settings（applyAppearance 应用主题/缩放，updateSettings 持久化）"
```

---

### Task 5: 暗色主题 CSS + 分区按钮样式

**Files:**
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: store 设置 `document.documentElement.dataset.theme`（Task 4）
- Produces: `html[data-theme="dark"]` 变量覆盖块；`.seg` / `.seg .btn.active` / `.slider-row` 样式；`input[type=range]` 微调。

- [ ] **Step 1: 在 main.css 末尾追加暗色与分区样式**

在 `main.css` 文件末尾追加：

```css
/* ---- 暗色主题 ---- */
html[data-theme="dark"] {
  color-scheme: dark;
  --bg:#16181D; --panel:#1F2329;
  --primary:#6B8AFF; --primary-w:#4A6CF7; --primary-t:#232A45;
  --text:#E4E6EB; --text-2:#9AA0AE; --border:#2A2D36; --border-2:#343846; --hover:#23262E;
  --ok:#4ADE80; --ok-txt:#4ADE80; --pending:#FBBF24; --pending-txt:#FBBF24; --danger:#F87171; --danger-bg:#2A1D1D;
}
html[data-theme="dark"] button { background:var(--bg); }
html[data-theme="dark"] input, html[data-theme="dark"] select, html[data-theme="dark"] textarea { background:var(--bg); }
html[data-theme="dark"] input[readonly] { background:var(--bg); }
html[data-theme="dark"] .modal { background:var(--panel); }
html[data-theme="dark"] .cb { background:var(--bg); }
html[data-theme="dark"] .ctx { background:var(--panel); }
html[data-theme="dark"] .btn.primary, html[data-theme="dark"] .titlebar .mark { color:#0B0D12; }
html[data-theme="dark"] .modal-mask { background:rgba(0,0,0,.6); }

/* ---- 设置弹窗分区 ---- */
.seg { display:flex; gap:6px; margin-bottom:14px; }
.seg .btn.active { background:var(--primary-t); color:var(--primary); border-color:var(--primary-t); font-weight:600; }
.slider-row { display:flex; align-items:center; gap:10px; margin-top:6px; }
input[type="range"] { accent-color:var(--primary); padding:0; height:auto; }
```

> 注意：亮色主题的所有 `#fff` 硬编码保持不动，暗色仅在 `html[data-theme="dark"]` 作用域内覆盖，确保亮色外观与现在 100% 一致。

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: vue-tsc + vite build 通过（72 modules）。

- [ ] **Step 3: 提交**

```bash
git add src/styles/main.css
git commit -m "feat: 暗色主题 CSS 变量覆盖 + 设置弹窗分区/滑块样式"
```

---

### Task 6: 表格备注列 + 编辑弹窗备注框 + 导入导出示例文案

**Files:**
- Modify: `src/components/SiteTable.vue`
- Modify: `src/components/AddEditModal.vue`
- Modify: `src/components/ImportExportModal.vue`

**Interfaces:**
- Consumes: `Site.note`（Task 4）；`addSite` / `updateSite` 的 `note` 参数（Task 4）
- Produces: 表格最后一列「备注」；编辑弹窗「备注（50 字以内）」textarea（`maxlength=50`）。

- [ ] **Step 1: 表格加列**

`src/components/SiteTable.vue` 表头（第 45 行）改为：

```html
<tr><th></th><th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th><th>备注</th></tr>
```

行内（第 61 行 `生命` 单元格后）加：

```html
<td class="muted">{{ s.note }}</td>
```

- [ ] **Step 2: 编辑弹窗加备注输入**

`src/components/AddEditModal.vue`：
- script 中（第 11 行 `const tags` 后）加 `const note = ref(props.editing?.note ?? '')`
- `save()` 两个分支补 `note`：
```ts
if (props.editing) store.updateSite(props.editing.id, { name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList, note: note.value })
else {
  dup.value = store.isDuplicateUrl(url.value)
  if (dup.value) return
  store.addSite({ name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList, note: note.value })
}
```
- template 中（第 58 行 标签输入后）加：
```html
<label>备注（50 字以内）</label><textarea v-model="note" maxlength="50" style="height:52px;resize:none" placeholder="网站简介" />
```

- [ ] **Step 3: 导入导出示例文案更新**

`src/components/ImportExportModal.vue` 第 101 行改为：

```html
<code># 分类名<br />名称&#9;https://链接&#9;状态<br />&gt; 网站简介备注</code>
```

- [ ] **Step 4: 验证**

Run: `npm test`（应全绿）+ `npm run build`（vue-tsc 通过）
Expected: PASS + build 成功。

- [ ] **Step 5: 提交**

```bash
git add src/components/SiteTable.vue src/components/AddEditModal.vue src/components/ImportExportModal.vue
git commit -m "feat: 表格新增备注列，编辑弹窗新增备注输入（50 字），导入导出示例更新"
```

---

### Task 7: 设置弹窗三分区（主题 / 显示 / 数据存储）

**Files:**
- Modify: `src/components/SettingsModal.vue`

**Interfaces:**
- Consumes: store `settings`、`updateSettings(patch)`、`location`（Task 4）；api `getDataFilePath` / `openDataDir`（已存在）
- Produces: 三个分区按钮；主题三选 radio；缩放 range 滑块（80/200/step 10）；数据存储区沿用现有内容。

- [ ] **Step 1: 重写 SettingsModal.vue**

`src/components/SettingsModal.vue` 整个 `<script setup>` 与 `<template>` 替换为：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ModalMask from './ModalMask.vue'
import * as api from '../api'
import { useAppStore } from '../store/app'
const emit = defineEmits(['close'])
const store = useAppStore()
const filePath = ref('')
const msg = ref('')
const section = ref<'theme' | 'display' | 'storage'>('theme')
onMounted(async () => { filePath.value = await api.getDataFilePath() })
function setTheme(theme: 'system' | 'light' | 'dark') { store.updateSettings({ theme }) }
function onZoom(e: Event) { store.updateSettings({ zoom: Number((e.target as HTMLInputElement).value) }) }
async function openDir() {
  try { await api.openDataDir(); msg.value = '已打开数据目录' } catch (e) { msg.value = '打开失败：' + e }
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal" style="width:min(480px,92%)">
      <h3>设置</h3>
      <div class="seg">
        <button class="btn" :class="{ active: section === 'theme' }" @click="section = 'theme'">主题</button>
        <button class="btn" :class="{ active: section === 'display' }" @click="section = 'display'">显示</button>
        <button class="btn" :class="{ active: section === 'storage' }" @click="section = 'storage'">数据存储</button>
      </div>

      <template v-if="section === 'theme'">
        <label>主题模式</label>
        <div class="mode-row">
          <label><input type="radio" :checked="store.settings.theme === 'system'" @change="setTheme('system')" /> 跟随系统</label>
          <label style="margin-left:10px"><input type="radio" :checked="store.settings.theme === 'light'" @change="setTheme('light')" /> 亮色</label>
          <label style="margin-left:10px"><input type="radio" :checked="store.settings.theme === 'dark'" @change="setTheme('dark')" /> 暗色</label>
        </div>
        <p class="muted">跟随系统：启动时读取系统主题，运行中不实时切换。</p>
      </template>

      <template v-else-if="section === 'display'">
        <label>界面缩放（{{ store.settings.zoom }}%）</label>
        <div class="slider-row">
          <span style="font-size:12px" class="muted">80%</span>
          <input type="range" min="80" max="200" step="10" :value="store.settings.zoom" @input="onZoom" style="flex:1" />
          <span style="font-size:12px" class="muted">200%</span>
        </div>
        <p class="muted">整体放大或缩小界面文字与控件，步进 10%。</p>
      </template>

      <template v-else>
        <div class="modal-cols">
          <div>
            <label>数据文件</label>
            <input :value="filePath" readonly />
            <div class="actions" style="justify-content:flex-start"><button class="btn primary" @click="openDir">打开数据目录</button></div>
          </div>
          <div class="help">
            <label>存储说明</label>
            <p class="muted">数据固定存储在软件目录下 <code>./data/</code>，与软件一起，便携易备份。若安装目录无写入权限，自动回退到系统用户目录。</p>
            <p v-if="store.location.isFallback" class="muted" style="color:var(--pending-txt)">⚠ 当前正使用系统目录（安装位置无写入权限）。</p>
          </div>
        </div>
      </template>

      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </ModalMask>
</template>
```

> 注意：`theme` 为 `'system'` 时，需在 `onMounted` 中（`api.getDataFilePath` 同一处）主动调用一次 `store.applyAppearance()`，确保启动读一次系统主题。由于 `store.init()` 已调用过，可不再重复；如需覆盖测试可在本任务验收阶段手动确认。

- [ ] **Step 2: 验证**

Run: `npm test` + `npm run build`
Expected: 全绿 + build 成功。

- [ ] **Step 3: 提交**

```bash
git add src/components/SettingsModal.vue
git commit -m "feat: 设置弹窗三分区（主题/显示/数据存储），主题三选 + 缩放滑块"
```

---

### Task 8: 全量验证 + 打包

**Files:**
- 无代码改动（仅验证）

- [ ] **Step 1: 运行全部测试**

Run: `cargo test`（在 `src-tauri/` 下）
Expected: 19 个 + 新增（Task1 3 个 + Task2 3 个 + Task3 2 个）全部 PASS。

Run: `npm test`
Expected: 17 + 新增（Task4）全部 PASS。

- [ ] **Step 2: 前端类型检查 + 构建**

Run: `npm run build`
Expected: vue-tsc 无错误，vite build 成功（72 modules）。

- [ ] **Step 3: 手动验收要点**

`npm run tauri dev` 后检查：
1. 设置 → 主题：切「暗色」整体换肤（标题栏/侧栏/表格/弹窗/右键菜单）；切「亮色」恢复现状；切「跟随系统」与系统深色一致。
2. 设置 → 显示：滑块 80%/100%/150% 界面整体缩放即时生效。
3. 添加/编辑网站填备注，表格最后一列显示；重启应用后设置与备注均保持。
4. 导出 MD 含 `> 备注` 行；导入含 `> ` 的 MD 备注读回；`settings.json` 在数据目录生成。

- [ ] **Step 4: 打包**

Run: `npm run tauri build`
Expected: exe / MSI / NSIS 构建成功。

- [ ] **Step 5: 提交（如有遗漏改动）**

```bash
git status
# 若有未提交改动，归类提交
```

---

## Self-Review

**1. Spec coverage:**
- 备注字段/表格列/编辑弹窗/不参与搜索 → Task 1/4/6 ✓
- MD `>` 行导出导入 + 清洗 + 标题重置 → Task 3 ✓
- 设置三分区、主题三选、缩放滑块 → Task 5/7 ✓
- settings.json 独立存储 + 默认值 + 损坏回退 → Task 2 ✓
- 暗色整体换肤配色表 → Task 5 ✓
- 兼容旧数据 → Task 1（`#[serde(default)]`）✓
- 验收（测试/打包）→ Task 8 ✓

**2. Placeholder scan:** 无 TBD/TODO；所有步骤含具体代码。Step 3 的 Task 1 保留了 `merge_into` 既有分支说明（只改 name/category_id 不动 note）。

**3. Type consistency:**
- `Settings.theme` 在 Rust（`String`，值 `"system"/"light"/"dark"`）与 TS（`'system'|'light'|'dark'`）一致；zoom u32↔number。
- `addSite` 签名在 store（Task 4）与 AddEditModal 调用（Task 6）一致，均含 `note`。
- `applyAppearance` / `updateSettings` 命名在 store 定义与 SettingsModal 调用一致。
- command `get_settings`/`set_settings` 在 commands.rs（Task 2）、lib.rs（Task 2）、api.ts（Task 4）一致。
- `Settings::defaults()` 在 settings.rs 定义与测试使用一致。
