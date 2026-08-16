# 网站收藏管家 v1.1（7 项功能修订） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成的 v1（Task 0-14）基础上实现 7 项修订：跨盘数据迁移、首次启动目录引导、JSON 导入导出与导入导出弹窗重构、选中行 hover 移除、弹窗拖拽误关闭修复、右键菜单 Teleport 与溢出翻转、分类创建入口与统一应用内弹窗。

**Architecture:** Rust 侧新增 `config.rs`（config.json 原子写 + 损坏恢复）并重写迁移命令（跨盘复制+删除、非空拒绝、失败回滚）、新增 JSON/md 文件级导入导出命令；前端引入 `tauri-plugin-dialog` 提供系统文件夹/保存/打开对话框，重写 ImportExportModal/SettingsModal、新增 FirstLaunchModal 与统一应用内弹窗组件，ContextMenu 改为 Teleport 到 body 并翻转定位。

**Tech Stack:** Tauri 2（Rust + reqwest/serde）、tauri-plugin-dialog、Vue 3、Pinia、Vite、TypeScript、Vitest。

## Global Constraints

（以下约束逐条来自 PRD v1.1，所有任务隐含包含本约束。值必须照抄，不得改动。）

- 分类嵌套最多 **3 层**；链接**唯一**；检测判定与断网保护、删除进回收站等 v1 规则保持不变。
- 跨盘迁移：目标目录**非空即拒绝**；迁移失败**自动回滚**；config.json **原子写入**，损坏时备份 `.bak` 后重建并重新出现首次启动引导。
- 首次启动引导页：仅当 `config.json` 缺失或损坏时出现；可跳过用默认路径（跳过时也要写入默认路径，避免下次重启再弹）；所选目录已有数据则先提示用户选择是否读入。
- 数据文件名为 `websites.json`；导入覆盖前自动备份 `.bak`（md 与 JSON 均如此）。
- JSON 交换格式 = `AppData` 完整序列化（含 categories/sites/recycleBin/tags），与 `websites.json` 存储格式一致；JSON 导入**仅覆盖**模式，执行前弹确认；md 导入保留覆盖/合并两种模式，弹窗内预选。
- 导出走系统保存对话框，预填 `网站收藏_<日期>.md` / `网站收藏_<日期>.json`；导出成功状态栏闪现提示 2-3 秒。
- 选中行 hover 保持紫色稳定，不闪烁变色。
- 弹窗仅点击遮罩空白关闭；在弹窗内拖选文字拖出遮罩松开**不关闭**。
- 右键菜单 Teleport 到 body（避开父级 transform），水平/垂直**独立判断**溢出翻转，紧贴鼠标、顶到窗口边界。
- 分类创建入口：添加/编辑弹窗下拉含「＋ 新建分类」；侧栏右键「全部」→ 添加顶层分类、右键分类 → 添加子分类（**第 3 层分类不显示「添加子分类」**）。
- **统一应用内弹窗替换所有 `window.prompt/confirm/alert`**（含重命名、删除分类二选一）；删除分类二选一用应用内两按钮弹窗。
- 主题/字体问题本次不改（保持糖果像素现状）；批量删除等危险操作不弹确认（进回收站可恢复）。
- 每次数据变更即时写盘（`save_data`）。
- v1.1 引入新依赖：`tauri-plugin-dialog`（cargo 侧 `"2"`）+ `@tauri-apps/plugin-dialog`（npm 侧 `^2`）。打包需在真机重新执行 `npm run tauri build`。

---

### Task 1: Rust config.json 模块（原子写 + 损坏恢复 + has_config/set_data_dir/probe_data_dir 命令）

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`（`mod config;` + 注册新命令）
- Modify: `src-tauri/src/commands.rs`（`active_data_dir` 改用 `config::read_data_dir`；新增 `has_config`、`set_data_dir`、`probe_data_dir` 命令）
- Test: `src-tauri/src/config.rs`（内嵌 `#[cfg(test)]`）

**Interfaces:**
- Consumes: 无（v1 的 `data.rs`/`commands.rs` 已存在）
- Produces:
  - `config::config_path(app_data_dir: &Path) -> PathBuf`
  - `config::read_data_dir(app_data_dir: &Path) -> Option<String>`（缺失/损坏返回 None，损坏时备份 `config.json.bak`）
  - `config::write_data_dir(app_data_dir: &Path, dir: &str) -> Result<(), String>`（原子：先写 tmp 再 rename）
  - `config::exists(app_data_dir: &Path) -> bool`
  - commands：`has_config(app) -> bool`、`set_data_dir(app, dir) -> Result<(), String>`、`probe_data_dir(dir) -> ProbeResult{ exists, siteCount }`（camelCase）
- 后续任务依赖：Task 2 迁移命令、Task 4 前端 API、Task 5 首次启动页。

- [ ] **Step 1: 创建 `config.rs`**

```rust
use std::fs;
use std::path::{Path, PathBuf};

pub fn config_path(app_data_dir: &Path) -> PathBuf { app_data_dir.join("config.json") }

/// 读取 config.json 中的 dataDir。缺失/损坏返回 None；
/// 损坏时先备份为 config.json.bak 再返回 None（首次启动引导页会重新出现）。
pub fn read_data_dir(app_data_dir: &Path) -> Option<String> {
    let p = config_path(app_data_dir);
    if !p.exists() { return None; }
    match fs::read_to_string(&p) {
        Ok(s) => match serde_json::from_str::<serde_json::Value>(&s) {
            Ok(v) => v.get("dataDir").and_then(|d| d.as_str()).map(|s| s.to_string()),
            Err(_) => { let _ = fs::copy(&p, p.with_extension("bak")); None }
        },
        Err(_) => None,
    }
}

/// 原子写入：先写 config.json.tmp，再 rename 覆盖，避免写一半损坏。
pub fn write_data_dir(app_data_dir: &Path, dir: &str) -> Result<(), String> {
    let p = config_path(app_data_dir);
    if let Some(parent) = p.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(&serde_json::json!({ "dataDir": dir })).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// config.json 是否存在且可解析。
pub fn exists(app_data_dir: &Path) -> bool {
    let p = config_path(app_data_dir);
    if !p.exists() { return false; }
    match fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str::<serde_json::Value>(&s).is_ok(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cfg_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn read_missing_returns_none() {
        let d = tmp_dir("missing");
        assert_eq!(read_data_dir(&d), None);
        assert!(!exists(&d));
    }

    #[test]
    fn write_then_read_roundtrip() {
        let d = tmp_dir("roundtrip");
        write_data_dir(&d, "D:\\bookmarks").unwrap();
        assert_eq!(read_data_dir(&d).as_deref(), Some("D:\\bookmarks"));
        assert!(exists(&d));
        assert!(!config_path(&d).with_extension("json.tmp").exists(), "tmp 文件应被 rename 清理");
    }

    #[test]
    fn corrupt_config_backs_up_and_returns_none() {
        let d = tmp_dir("corrupt");
        fs::write(config_path(&d), "{ not valid json").unwrap();
        assert_eq!(read_data_dir(&d), None);
        assert!(!exists(&d));
        assert!(config_path(&d).with_extension("bak").exists(), "损坏 config 应备份 .bak");
    }
}
```

- [ ] **Step 2: 注册模块并更新 `commands.rs`**

在 `src-tauri/src/lib.rs` 顶部模块声明处加入 `mod config;`：

```rust
mod check;
mod commands;
mod config;
mod data;
mod md;
```

在 `commands.rs` 顶部把旧的 `config_path` 私有函数删除（改用新模块），并重写 `active_data_dir`：

```rust
fn active_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    config::read_data_dir(&data_dir(app)).map(std::path::PathBuf::from).unwrap_or_else(|| data_dir(app))
}
```

在 `commands.rs` 末尾追加三个命令（置于 `check_site_cmd` 之前即可）：

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult { pub exists: bool, pub site_count: u32 }

#[tauri::command]
pub fn has_config(app: tauri::AppHandle) -> bool {
    config::exists(&data_dir(&app))
}

#[tauri::command]
pub fn set_data_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    config::write_data_dir(&data_dir(&app), &dir)
}

#[tauri::command]
pub fn probe_data_dir(dir: String) -> ProbeResult {
    let p = data::data_file_path(std::path::Path::new(&dir));
    if p.exists() {
        let d = data::load_data(std::path::Path::new(&dir));
        ProbeResult { exists: true, site_count: d.sites.len() as u32 }
    } else {
        ProbeResult { exists: false, site_count: 0 }
    }
}
```

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中加入 `commands::has_config`、`commands::set_data_dir`、`commands::probe_data_dir`：

```rust
.invoke_handler(tauri::generate_handler![
    greet,
    commands::get_data_dir,
    commands::has_config,
    commands::set_data_dir,
    commands::probe_data_dir,
    commands::load_data,
    commands::save_data,
    commands::migrate_data_dir,
    commands::check_site_cmd,
    commands::check_connectivity_cmd,
    commands::export_md_cmd,
    commands::import_md_cmd,
])
```

- [ ] **Step 3: 运行 cargo 测试确认通过**

Run: `cargo test config`
Expected: 3 个 config 测试全部 PASS。

- [ ] **Step 4: 运行 cargo 编译确认无回归**

Run: `cargo build`
Expected: 编译成功，无错误。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/config.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: config.json 原子写与损坏恢复，新增 has_config/set_data_dir/probe_data_dir"
```

---

### Task 2: Rust 迁移命令重写（非空拒绝 + 跨盘复制删除 + 回滚 + 完整路径命令）

**Files:**
- Modify: `src-tauri/src/data.rs`（新增 `ensure_empty_or_create`、`copy_then_remove`、`move_data_file`）
- Modify: `src-tauri/src/commands.rs`（重写 `migrate_data_dir`；新增 `get_data_file_path`）
- Test: `src-tauri/src/data.rs`（内嵌测试）

**Interfaces:**
- Consumes: Task 1 的 `config::write_data_dir`、`config::read_data_dir`
- Produces:
  - `data::ensure_empty_or_create(dir: &Path) -> Result<(), String>`（存在则要求为空，否则拒绝；不存在则创建）
  - `data::copy_then_remove(src: &Path, dst: &Path) -> Result<(), String>`（复制后删源，失败回滚删目标）
  - `data::move_data_file(src: &Path, dst: &Path) -> Result<(), String>`（优先 rename；跨盘失败走复制+删除）
  - command：`migrate_data_dir(app, new_dir) -> Result<(), String>`（顺序：非空拒绝 → 移文件 → 写 config；写 config 失败回滚移文件）
  - command：`get_data_file_path(app) -> String`（返回 `websites.json` 完整路径）
- 后续任务依赖：Task 4 前端 API、Task 6 设置弹窗、Task 5 首次启动页。

- [ ] **Step 1: 在 `data.rs` 追加文件迁移辅助函数**

```rust
/// 目标目录必须存在且为空；不存在则创建。非空拒绝。
pub fn ensure_empty_or_create(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        let mut it = fs::read_dir(dir).map_err(|e| e.to_string())?;
        if it.next().is_some() { return Err(format!("目标目录非空，拒绝迁移：{}", dir.display())); }
    } else {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 复制后删除源；任一步失败回滚（删除已复制的目标副本）。
pub fn copy_then_remove(src: &Path, dst: &Path) -> Result<(), String> {
    fs::copy(src, dst).map_err(|e| { let _ = fs::remove_file(dst); format!("跨盘复制失败，已回滚：{}", e) })?;
    fs::remove_file(src).map_err(|e| { let _ = fs::remove_file(dst); format!("复制成功但删除源失败，已回滚目标文件：{}", e) })
}

/// 优先同卷 rename；跨卷失败时退化为复制+删除。源不存在则视为成功。
pub fn move_data_file(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() { return Ok(()); }
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(_) => copy_then_remove(src, dst),
    }
}
```

- [ ] **Step 2: 在 `data.rs` 内嵌测试**

```rust
#[test]
fn ensure_empty_rejects_non_empty() {
    let d = std::env::temp_dir().join(format!("mv_test_{}_full", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("x.txt"), "x").unwrap();
    assert!(ensure_empty_or_create(&d).is_err(), "非空目录应被拒绝");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn ensure_empty_creates_missing() {
    let d = std::env::temp_dir().join(format!("mv_test_{}_create", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    assert!(ensure_empty_or_create(&d).is_ok());
    assert!(d.exists());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn copy_then_remove_moves_file() {
    let base = std::env::temp_dir().join(format!("mv_test_{}_copy", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let src = base.join("a.json");
    let dst = base.join("b.json");
    fs::write(&src, "hello").unwrap();
    copy_then_remove(&src, &dst).unwrap();
    assert!(!src.exists() && dst.exists());
    assert_eq!(fs::read_to_string(&dst).unwrap(), "hello");
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn move_data_file_same_volume() {
    let base = std::env::temp_dir().join(format!("mv_test_{}_rename", std::process::id()));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let src = base.join("a.json");
    let dst = base.join("b.json");
    fs::write(&src, "data").unwrap();
    move_data_file(&src, &dst).unwrap();
    assert!(!src.exists() && dst.exists());
    let _ = fs::remove_dir_all(&base);
}
```

- [ ] **Step 3: 重写 `commands.rs` 的 `migrate_data_dir` 并新增 `get_data_file_path`**

删除原有 `migrate_data_dir` 实现（旧逻辑直接 rename + 非原子写 config），替换为：

```rust
#[tauri::command]
pub fn migrate_data_dir(app: tauri::AppHandle, new_dir: String) -> Result<(), String> {
    let base = data_dir(&app);
    let from = active_data_dir(&app);
    let to = std::path::PathBuf::from(&new_dir);
    data::ensure_empty_or_create(&to)?;
    let src = data::data_file_path(&from);
    let dst = data::data_file_path(&to);
    data::move_data_file(&src, &dst)?;
    if let Err(e) = config::write_data_dir(&base, &new_dir) {
        let _ = data::move_data_file(&dst, &src); // 回滚文件移动
        return Err(format!("写入配置失败，已回滚：{}", e));
    }
    Ok(())
}

#[tauri::command]
pub fn get_data_file_path(app: tauri::AppHandle) -> String {
    data::data_file_path(&active_data_dir(&app)).to_string_lossy().to_string()
}
```

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中加入 `commands::get_data_file_path`。

- [ ] **Step 4: 运行 cargo 测试与编译**

Run: `cargo test` 然后 `cargo build`
Expected: 新增 4 个迁移测试 + 既有测试全部 PASS；编译成功。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/data.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: 跨盘迁移（非空拒绝/复制删除/回滚）与数据文件完整路径命令"
```

---

### Task 3: Rust JSON 导入导出 + md 文件级导入导出（合并 merge_into 到 data.rs）

**Files:**
- Modify: `src-tauri/src/data.rs`（新增 `backup_data_file`、`export_json_to_path`、`import_json_from_path`；把 `merge_into` 从 commands.rs 移入并设为 `pub`）
- Modify: `src-tauri/src/md.rs`（新增 `export_md_to_path`、`import_md_from_path`）
- Modify: `src-tauri/src/commands.rs`（删除旧 `export_md_cmd`/`import_md_cmd`/`merge_into`；新增 4 个文件级命令）
- Modify: `src-tauri/src/lib.rs`（注册新命令，移除旧命令）
- Test: `src-tauri/src/data.rs`、`src-tauri/src/md.rs`（内嵌测试）

**Interfaces:**
- Consumes: Task 1 的 `config::read_data_dir`、`data::data_file_path`、`data::load_data`/`save_data`
- Produces:
  - `data::backup_data_file(app_data_dir: &Path) -> Result<(), String>`（websites.json → websites.json.bak）
  - `data::export_json_to_path(data: &AppData, path: &Path) -> Result<(), String>`
  - `data::import_json_from_path(app_data_dir: &Path, path: &Path) -> Result<AppData, String>`（仅覆盖：备份 + save + 返回新数据）
  - `md::export_md_to_path(data: &AppData, path: &Path) -> Result<(), String>`
  - `md::import_md_from_path(app_data_dir: &Path, path: &Path, mode: &str) -> Result<AppData, String>`
  - commands：`export_md_to_file(app, path)`、`export_json_to_file(app, path)`、`import_md_from_file(app, path, mode)`、`import_json_from_file(app, path)`，均返回 `Result<..., String>`（import 返回 `data::AppData`）
- 后续任务依赖：Task 4 前端 API、Task 7 导入导出弹窗。

- [ ] **Step 1: 在 `data.rs` 追加导入导出辅助与测试**

```rust
pub fn backup_data_file(app_data_dir: &Path) -> Result<(), String> {
    let p = data_file_path(app_data_dir);
    if p.exists() { fs::copy(&p, p.with_extension("json.bak")).map_err(|e| e.to_string())?; }
    Ok(())
}

pub fn export_json_to_path(data: &AppData, path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn import_json_from_path(app_data_dir: &Path, path: &Path) -> Result<AppData, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let incoming: AppData = serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败：{}", e))?;
    backup_data_file(app_data_dir)?;
    save_data(app_data_dir, &incoming)?;
    Ok(incoming)
}
```

测试（`data.rs` 内嵌）：

```rust
#[test]
fn export_import_json_roundtrip() {
    let d = tmp_dir("json_rt");
    let data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    let out = d.join("backup.json");
    export_json_to_path(&data, &out).unwrap();
    assert!(out.exists());
    let back = import_json_from_path(&d, &out).unwrap();
    assert_eq!(back.version, 1);
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn import_json_backs_up_and_replaces() {
    let d = tmp_dir("json_bak");
    let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None });
    save_data(&d, &data).unwrap();
    let mut fresh = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    fresh.sites.push(Site { id: "s2".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None });
    let in_path = d.join("in.json");
    export_json_to_path(&fresh, &in_path).unwrap();
    let back = import_json_from_path(&d, &in_path).unwrap();
    assert_eq!(back.sites.len(), 1);
    assert_eq!(back.sites[0].id, "s2");
    assert!(data_file_path(&d).with_extension("json.bak").exists(), "覆盖导入应自动备份 .bak");
    let _ = std::fs::remove_dir_all(&d);
}
```

- [ ] **Step 2: 把 `merge_into` 移入 `data.rs` 并设为 `pub`**

从 `commands.rs` 剪切整个 `fn merge_into`（含内部 `find_or_create` 闭包），粘贴到 `data.rs`（放在 `save_data` 之后），并去掉 `data::` 前缀、改为本模块类型：

```rust
pub fn merge_into(current: &mut AppData, incoming: &AppData) {
    let mut cat_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut next = current.categories.len();
    fn find_or_create(
        list: &mut Vec<Category>,
        incoming_cat: &Category,
        map: &mut std::collections::HashMap<String, String>,
        next: &mut usize,
    ) {
        let matched = list.iter().position(|c| c.name == incoming_cat.name);
        let id = if let Some(i) = matched {
            let id = list[i].id.clone();
            for child in &incoming_cat.children {
                find_or_create(&mut list[i].children, child, map, next);
            }
            id
        } else {
            let id = format!("auto{}", *next); *next += 1;
            let mut node = Category { id: id.clone(), name: incoming_cat.name.clone(), children: vec![] };
            for child in &incoming_cat.children {
                find_or_create(&mut node.children, child, map, next);
            }
            list.push(node);
            id
        };
        map.insert(incoming_cat.id.clone(), id);
    }
    for c in &incoming.categories {
        find_or_create(&mut current.categories, c, &mut cat_id_map, &mut next);
    }
    for s in &incoming.sites {
        let target_cat = s.category_id.as_ref().and_then(|id| cat_id_map.get(id)).cloned();
        if let Some(existing) = current.sites.iter_mut().find(|x| x.url == s.url) {
            existing.name = s.name.clone();
            if target_cat.is_some() { existing.category_id = target_cat.clone(); }
        } else {
            current.sites.push(Site {
                id: s.id.clone(), name: s.name.clone(), url: s.url.clone(),
                category_id: target_cat, tags: s.tags.clone(),
                status: "unknown".into(), last_check: None,
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    let mut tags = Vec::new();
    for s in &current.sites { for t in &s.tags { if seen.insert(t.clone()) { tags.push(t.clone()); } } }
    current.tags = tags;
}
```

在 `commands.rs` 中删除原来的 `merge_into`。

- [ ] **Step 3: 在 `md.rs` 追加文件级导入导出与测试**

```rust
use crate::data::{self, AppData, Category, Site};

pub fn export_md_to_path(data: &AppData, path: &std::path::Path) -> Result<(), String> {
    std::fs::write(path, export_to_md(data)).map_err(|e| e.to_string())
}

pub fn import_md_from_path(app_data_dir: &std::path::Path, path: &std::path::Path, mode: &str) -> Result<AppData, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let incoming = import_from_md(&text);
    let mut current = data::load_data(app_data_dir);
    match mode {
        "overwrite" => { data::backup_data_file(app_data_dir)?; data::save_data(app_data_dir, &incoming)?; Ok(incoming) }
        "merge" => { data::merge_into(&mut current, &incoming); data::save_data(app_data_dir, &current)?; Ok(current) }
        _ => Err("mode must be overwrite or merge".into()),
    }
}
```

测试（`md.rs` 内嵌，复用既有 `tmp` 目录习惯）：

```rust
#[test]
fn export_md_to_file_writes() {
    let d = std::env::temp_dir().join(format!("md_export_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    let out = d.join("out.md");
    export_md_to_path(&data, &out).unwrap();
    assert!(out.exists());
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn import_md_from_file_overwrite_backs_up() {
    let d = std::env::temp_dir().join(format!("md_import_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
    data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None });
    data::save_data(&d, &data).unwrap();
    let in_path = d.join("in.md");
    std::fs::write(&in_path, "# 新分类\n- [X](https://x.dev)\n").unwrap();
    let back = import_md_from_path(&d, &in_path, "overwrite").unwrap();
    assert_eq!(back.sites.len(), 1);
    assert_eq!(back.sites[0].name, "X");
    assert!(data::data_file_path(&d).with_extension("json.bak").exists());
    let _ = std::fs::remove_dir_all(&d);
}
```

注意：`md.rs` 目前顶部是 `use crate::data::{AppData, Category, Site};`，需改为 `use crate::data::{self, AppData, Category, Site};`。

- [ ] **Step 4: 重写 `commands.rs` 文件级命令，删除旧命令**

删除 `export_md_cmd`、`import_md_cmd` 两个旧命令，新增：

```rust
#[tauri::command]
pub fn export_md_to_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data = data::load_data(&active_data_dir(&app));
    md::export_md_to_path(&data, std::path::Path::new(&path))
}

#[tauri::command]
pub fn export_json_to_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data = data::load_data(&active_data_dir(&app));
    data::export_json_to_path(&data, std::path::Path::new(&path))
}

#[tauri::command]
pub fn import_md_from_file(app: tauri::AppHandle, path: String, mode: String) -> Result<data::AppData, String> {
    md::import_md_from_path(&active_data_dir(&app), std::path::Path::new(&path), &mode)
}

#[tauri::command]
pub fn import_json_from_file(app: tauri::AppHandle, path: String) -> Result<data::AppData, String> {
    data::import_json_from_path(&active_data_dir(&app), std::path::Path::new(&path))
}
```

在 `lib.rs` 的 `invoke_handler` 中：移除 `commands::export_md_cmd`、`commands::import_md_cmd`，加入 `commands::export_md_to_file`、`commands::export_json_to_file`、`commands::import_md_from_file`、`commands::import_json_from_file`。

- [ ] **Step 5: 运行 cargo 测试与编译**

Run: `cargo test` 然后 `cargo build`
Expected: 既有测试 + 新增 JSON/md 文件测试全部 PASS；编译成功。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/data.rs src-tauri/src/md.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: JSON 完整备份导入导出与 md 文件级导入导出"
```

---

### Task 4: 前端依赖与 API 层（dialog 插件 + api.ts 更新）

**Files:**
- Modify: `src-tauri/Cargo.toml`（加 `tauri-plugin-dialog = "2"`）
- Modify: `src-tauri/src/lib.rs`（注册 dialog 插件）
- Modify: `package.json`（加 `@tauri-apps/plugin-dialog": "^2"`）
- Modify: `src/api.ts`（新增/移除命令封装）
- Test: `src/store/app.spec.ts`（vi.mock 保持现有导出即可，无需改动）

**Interfaces:**
- Consumes: Task 1/2/3 的 Rust 命令
- Produces:
  - `api.hasConfig() -> Promise<boolean>`
  - `api.setDataDir(dir) -> Promise<void>`
  - `api.probeDataDir(dir) -> Promise<{ exists: boolean; siteCount: number }>`
  - `api.getDataFilePath() -> Promise<string>`
  - `api.exportMdToFile(path) -> Promise<void>`
  - `api.exportJsonToFile(path) -> Promise<void>`
  - `api.importMdFromFile(path, mode) -> Promise<AppData>`
  - `api.importJsonFromFile(path) -> Promise<AppData>`
  - 移除 `api.exportMd`、`api.importMd`
- 后续任务依赖：Task 5/6/7。

- [ ] **Step 1: 安装 dialog 插件**

```bash
npm install @tauri-apps/plugin-dialog
cargo add tauri-plugin-dialog --manifest-path src-tauri/Cargo.toml
```

Expected: 两条命令成功；`package.json` 出现 `"@tauri-apps/plugin-dialog": "^2.x"`；`src-tauri/Cargo.toml` 出现 `tauri-plugin-dialog = "2.x"`。

- [ ] **Step 2: 注册插件**

在 `src-tauri/src/lib.rs` 的 `tauri::Builder::default()` 链中，在 `.plugin(tauri_plugin_opener::init())` 后面加一行：

```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: 更新 `src/api.ts`**

整文件替换为：

```ts
import { invoke } from '@tauri-apps/api/core'
import type { AppData, CheckResult } from './types'

export const loadData = () => invoke<AppData>('load_data')
export const saveData = (data: AppData) => invoke<void>('save_data', { data })
export const checkSite = (url: string) => invoke<CheckResult>('check_site_cmd', { url })
export const checkConnectivity = () => invoke<boolean>('check_connectivity_cmd')
export const getDataDir = () => invoke<string>('get_data_dir')
export const getDataFilePath = () => invoke<string>('get_data_file_path')
export const hasConfig = () => invoke<boolean>('has_config')
export const setDataDir = (dir: string) => invoke<void>('set_data_dir', { dir })
export const probeDataDir = (dir: string) => invoke<{ exists: boolean; siteCount: number }>('probe_data_dir', { dir })
export const migrateDataDir = (newDir: string) => invoke<void>('migrate_data_dir', { newDir })
export const exportMdToFile = (path: string) => invoke<void>('export_md_to_file', { path })
export const exportJsonToFile = (path: string) => invoke<void>('export_json_to_file', { path })
export const importMdFromFile = (path: string, mode: string) => invoke<AppData>('import_md_from_file', { path, mode })
export const importJsonFromFile = (path: string) => invoke<AppData>('import_json_from_file', { path })
```

- [ ] **Step 4: 运行前端检查**

Run: `npm run test` 然后 `npm run build`
Expected: store 测试 14/14 PASS（vi.mock 未引用被移除的 exportMd/importMd）；vue-tsc 与 vite build 通过。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs package.json package-lock.json src/api.ts
git commit -m "feat: 引入 tauri-plugin-dialog 并更新前端 API 封装"
```

---

### Task 5: 首次启动引导页（FirstLaunchModal + App 接线）

**Files:**
- Create: `src/components/FirstLaunchModal.vue`
- Modify: `src/App.vue`（init 后检测 hasConfig，弹引导页；`@click.self` 暂保留，Task 9 统一替换为 ModalMask）
- Test: 手动验收（vitest 无 DOM 环境，走 vue-tsc + build + `npm run tauri dev` 人工验证）

**Interfaces:**
- Consumes: `api.hasConfig`、`api.getDataDir`、`api.probeDataDir`、`api.setDataDir`、`api.loadData`
- Produces: `FirstLaunchModal.vue`（emit `close`；跳过/选择完成均自行关闭）
- 后续任务依赖：无（独立交付）。

- [ ] **Step 1: 创建 `FirstLaunchModal.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as api from '../api'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['close'])
const defaultDir = ref('')
const step = ref<'choose' | 'confirm'>('choose')
const pickedDir = ref('')
const pickedCount = ref(0)
const msg = ref('')

onMounted(async () => { defaultDir.value = await api.getDataDir() })

async function pick() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({ directory: true, title: '选择数据目录' })
  if (!dir) return
  const probe = await api.probeDataDir(String(dir))
  if (probe.exists && probe.siteCount > 0) {
    pickedDir.value = String(dir)
    pickedCount.value = probe.siteCount
    step.value = 'confirm'
  } else {
    try {
      await api.setDataDir(String(dir))
      await store.init()
      emit('close')
    } catch (e) { msg.value = '写入失败：' + e }
  }
}

async function readPicked() {
  try {
    await api.setDataDir(pickedDir.value)
    await store.init()
    emit('close')
  } catch (e) { msg.value = '写入失败：' + e }
}

async function useDefault() {
  try {
    await api.setDataDir(defaultDir.value)
    await store.init()
    emit('close')
  } catch (e) { msg.value = '写入失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>选择数据目录</h3>
      <template v-if="step === 'choose'">
        <p class="muted">首次使用，请选择数据存储位置（默认：{{ defaultDir }}）</p>
        <div class="actions">
          <button class="btn" @click="useDefault">使用默认位置</button>
          <button class="btn primary" @click="pick">选择数据目录…</button>
        </div>
      </template>
      <template v-else>
        <p class="muted">该目录已有 {{ pickedCount }} 个网站数据，是否读入？</p>
        <div class="actions">
          <button class="btn" @click="step = 'choose'">换一个目录</button>
          <button class="btn primary" @click="readPicked">读入该目录</button>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 `App.vue` 接入**

在 `App.vue` 的 `<script setup>` 中：引入 `api` 与 `FirstLaunchModal`，新增状态与 init 逻辑。

```ts
import * as api from './api'
import FirstLaunchModal from './components/FirstLaunchModal.vue'
const firstLaunch = ref(false)
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  await store.init()
  firstLaunch.value = !(await api.hasConfig())
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
```

模板底部（在 `AddTagsModal` 之后）加：

```html
<FirstLaunchModal v-if="firstLaunch" @close="firstLaunch = false" />
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: vue-tsc 无报错，vite build 通过。

- [ ] **Step 4: 手动验收（真机 `npm run tauri dev`）**

- 删除（或损坏）`config.json` 后启动 → 出现「选择数据目录」页。
- 点「使用默认位置」→ 关闭并写入默认路径；重启不再弹出。
- 点「选择数据目录…」选一个空目录 → 直接写入并关闭。
- 选一个含 `websites.json` 且有数据的目录 → 提示「已有 N 个网站数据」，读入后侧栏数据加载。
- 点「换一个目录」回到选择步。

- [ ] **Step 5: 提交**

```bash
git add src/components/FirstLaunchModal.vue src/App.vue
git commit -m "feat: 首次启动数据目录引导页"
```

---

### Task 6: 设置弹窗（完整路径显示 + 文件夹选择迁移）

**Files:**
- Modify: `src/components/SettingsModal.vue`（整文件重写）
- Test: 手动验收（vue-tsc + build + `npm run tauri dev`）

**Interfaces:**
- Consumes: `api.getDataDir`、`api.getDataFilePath`、`api.migrateDataDir`
- Produces: 无新接口
- 后续任务依赖：无（独立交付）。

- [ ] **Step 1: 重写 `SettingsModal.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as api from '../api'
const emit = defineEmits(['close'])
const dir = ref('')
const filePath = ref('')
const msg = ref('')

onMounted(async () => {
  dir.value = await api.getDataDir()
  filePath.value = await api.getDataFilePath()
})
async function migrate() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, title: '选择新的数据目录' })
  if (!picked) return
  try {
    await api.migrateDataDir(String(picked))
    dir.value = await api.getDataDir()
    filePath.value = await api.getDataFilePath()
    msg.value = '已迁移到新位置'
  } catch (e) { msg.value = '迁移失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>设置 · 存储位置</h3>
      <p class="muted">数据文件：{{ filePath }}</p>
      <button class="btn" @click="migrate">更改位置…</button>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 3: 手动验收（真机 `npm run tauri dev`）**

- 打开设置 → 显示完整数据文件路径（含 `websites.json`）。
- 点「更改位置…」→ 文件夹对话框；选空目录 → 迁移成功，路径刷新，数据保留。
- 选一个**非空**目录 → 提示「目标目录非空，拒绝迁移」，数据未丢失。
- 跨盘迁移（选另一盘符目录）→ 成功，旧位置 `websites.json` 不再残留。

- [ ] **Step 4: 提交**

```bash
git add src/components/SettingsModal.vue
git commit -m "feat: 设置弹窗显示数据文件完整路径并改用文件夹选择迁移"
```

---

### Task 7: 导入导出弹窗重构（MD/JSON × 导入/导出 + 文件对话框 + 状态栏闪现）

**Files:**
- Modify: `src/components/ImportExportModal.vue`（整文件重写）
- Modify: `src/store/app.ts`（新增 `flashMsg` state + `flash` action）
- Modify: `src/components/StatusBar.vue`（显示 flashMsg）
- Test: `src/store/app.spec.ts`（flash 测试）

**Interfaces:**
- Consumes: `api.exportMdToFile`、`api.exportJsonToFile`、`api.importMdFromFile`、`api.importJsonFromFile`、`store.setData`、`store.flash`
- Produces:
  - store：`state.flashMsg: string`、`action flash(msg: string)`（2.5s 后自动清空）
  - `ImportExportModal.vue`：四个按钮 + 各自流程；emit `close`
- 后续任务依赖：无（独立交付）。Task 9 会把此弹窗的 mask 换为 ModalMask。

- [ ] **Step 1: store 增加 flash**

在 `src/store/app.ts` 的 `state` 中加入 `flashMsg: '' as string`，在 `actions` 中加入：

```ts
flash(msg: string) {
  this.flashMsg = msg
  setTimeout(() => { this.flashMsg = '' }, 2500)
}
```

在 `src/store/app.spec.ts` 中追加测试：

```ts
it('flash sets message and auto-clears', () => {
  vi.useFakeTimers()
  const s = useAppStore()
  s.flash('已导出 md')
  expect(s.flashMsg).toBe('已导出 md')
  vi.advanceTimersByTime(2600)
  expect(s.flashMsg).toBe('')
  vi.useRealTimers()
})
```

- [ ] **Step 2: `StatusBar.vue` 显示 flash**

在 `StatusBar.vue` 模板末尾（`</footer>` 前）加：

```html
<span v-if="store.flashMsg" class="pending-hint">{{ store.flashMsg }}</span>
```

- [ ] **Step 3: 重写 `ImportExportModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import * as api from '../api'
const store = useAppStore()
const emit = defineEmits(['close'])
const mode = ref<'overwrite' | 'merge'>('merge')
const jsonPath = ref<string | null>(null)
const msg = ref('')

function dateStr() { return new Date().toISOString().slice(0, 10) }

async function exportMd() {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: `网站收藏_${dateStr()}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
  if (!path) return
  try { await api.exportMdToFile(String(path)); store.flash('已导出 md'); emit('close') }
  catch (e) { msg.value = '导出失败：' + e }
}

async function exportJson() {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({ defaultPath: `网站收藏_${dateStr()}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (!path) return
  try { await api.exportJsonToFile(String(path)); store.flash('已导出 JSON 备份'); emit('close') }
  catch (e) { msg.value = '导出失败：' + e }
}

async function importMd() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'Markdown', extensions: ['md'] }] })
  if (!path) return
  try {
    const data = await api.importMdFromFile(String(path), mode.value)
    store.setData(data)
    store.flash(mode.value === 'overwrite' ? '已覆盖导入 md' : '已合并导入 md')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}

// JSON 导入两段式：先选文件，再应用内确认覆盖，确认后才执行导入
async function pickJson() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (!path) return
  jsonPath.value = String(path)
}
async function confirmJsonImport() {
  const p = jsonPath.value
  if (!p) return
  try {
    const data = await api.importJsonFromFile(p)
    store.setData(data)
    store.flash('已从 JSON 备份恢复')
    emit('close')
  } catch (e) { msg.value = '导入失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>导入 / 导出</h3>
      <template v-if="jsonPath">
        <p class="muted">将导入：{{ jsonPath }}</p>
        <p class="muted">JSON 导入会覆盖当前全部数据（自动备份 .bak），确定继续？</p>
        <div class="actions">
          <button class="btn" @click="jsonPath = null">取消</button>
          <button class="btn danger" @click="confirmJsonImport">确定覆盖导入</button>
        </div>
      </template>
      <template v-else>
        <div class="actions" style="justify-content:flex-start">
          <button class="btn primary" @click="exportMd">导出 MD</button>
          <button class="btn primary" @click="exportJson">导出 JSON</button>
          <button class="btn" @click="importMd">导入 MD</button>
          <button class="btn" @click="pickJson">导入 JSON</button>
        </div>
        <p class="muted">md 导入格式示例：<br /><code># 分类名<br />- [名称](https://链接)</code></p>
        <p class="muted">JSON 导入：读取「导出 JSON」的 .json 备份文件，覆盖当前全部数据（自动备份 .bak）。</p>
        <div class="mode-row">
          <label><input type="radio" v-model="mode" value="merge" /> 合并导入</label>
          <label><input type="radio" v-model="mode" value="overwrite" /> 覆盖导入（自动备份 .bak）</label>
        </div>
      </template>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </div>
</template>
```

JSON 导入两段式：`pickJson` 用系统打开对话框选文件 → 进入确认视图（展示路径 + 覆盖警告 + 确定覆盖导入按钮）→ `confirmJsonImport` 真正调用 `api.importJsonFromFile` 并落盘。

- [ ] **Step 4: 测试与构建**

Run: `npm run test` 然后 `npm run build`
Expected: store 15/15 PASS；vue-tsc 与 build 通过。

- [ ] **Step 5: 手动验收（真机 `npm run tauri dev`）**

- 导出 MD → 保存对话框预填 `网站收藏_<日期>.md`；成功后状态栏闪现「已导出 md」约 2-3 秒。
- 导出 JSON → 预填 `.json`；状态栏闪现。
- 导入 MD → 文件对话框选 `.md`；radio 预选合并；导入后数据正确。
- 导入 JSON → 选 `.json` 后先确认再覆盖，覆盖前自动 `.bak`。
- 弹窗内 md 格式示例与 JSON 说明文字可见。
- 移除旧的 textarea 粘贴交互。

- [ ] **Step 6: 提交**

```bash
git add src/components/ImportExportModal.vue src/store/app.ts src/store/app.spec.ts src/components/StatusBar.vue
git commit -m "feat: 导入导出四按钮重构与状态栏闪现提示"
```

---

### Task 8: 右键菜单修复（Teleport + 溢出翻转）

**Files:**
- Modify: `src/components/ContextMenu.vue`（整文件重写）
- Modify: `src/styles/main.css`（`.ctx` 保留，位置由 JS 计算）
- Test: 手动验收（vue-tsc + build + `npm run tauri dev`）

**Interfaces:**
- Consumes: 既有 props（`x`、`y`、`items?`）与 emit（`action`）
- Produces: 无新接口；位置计算内聚于组件
- 后续任务依赖：Task 10 的分类右键菜单复用同一组件。

- [ ] **Step 1: 重写 `ContextMenu.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['action'])
const props = defineProps<{ x: number; y: number; items?: { kind: string; label: string; danger?: boolean }[] }>()
const el = ref<HTMLDivElement | null>(null)
const pos = ref({ x: props.x, y: props.y })

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
})

function act(kind: string) { emit('action', kind); store.clearSelection() }
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="ctx" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
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

- [ ] **Step 2: 检查 CSS 兼容性**

确认 `src/styles/main.css` 中 `.ctx { position: fixed; z-index: 100; ... }` 保留。Teleport 到 body 后 `fixed` 相对视口定位，配合 `left/top` 内联样式即可。无需改 CSS。

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 手动验收（真机 `npm run tauri dev`）**

- 在网站行右键 → 菜单出现在鼠标位置，不再偏右（父级 `.content` 的 rowIn transform 不再影响）。
- 在窗口右下角右键 → 菜单水平/垂直分别翻转，紧贴边界不溢出窗口。
- 在左侧分类上右键 → 菜单正常显示。
- Esc 关闭菜单；点击遮罩关闭菜单。

- [ ] **Step 5: 提交**

```bash
git add src/components/ContextMenu.vue
git commit -m "fix: 右键菜单 Teleport 到 body 并独立翻转定位"
```

---

### Task 9: 弹窗拖拽误关闭修复（ModalMask 组件）+ 选中行 hover 移除

**Files:**
- Create: `src/components/ModalMask.vue`
- Modify: `src/components/AddEditModal.vue`、`src/components/AddTagsModal.vue`、`src/components/ImportExportModal.vue`、`src/components/PickCategoryModal.vue`、`src/components/SettingsModal.vue`、`src/components/FirstLaunchModal.vue`（把 `@click.self` 遮罩换成 `<ModalMask>`）
- Modify: `src/styles/main.css`（选中行 hover 保持紫色）
- Test: 手动验收（vue-tsc + build + `npm run tauri dev`）

**Interfaces:**
- Consumes: 无
- Produces: `ModalMask.vue`（slot + emit `close`；仅当鼠标按下起点在遮罩上时点击才关闭）
- 后续任务依赖：Task 10 新建弹窗组件也复用 `ModalMask`。

- [ ] **Step 1: 创建 `ModalMask.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits(['close'])
const downOnMask = ref(false)
function onMaskDown(e: MouseEvent) { downOnMask.value = (e.target as HTMLElement).classList.contains('modal-mask') }
function onMaskClick() { if (downOnMask.value) emit('close') }
</script>

<template>
  <div class="modal-mask" @mousedown="onMaskDown" @click="onMaskClick">
    <slot />
  </div>
</template>
```

- [ ] **Step 2: 替换各弹窗遮罩**

对 `AddEditModal.vue`、`AddTagsModal.vue`、`ImportExportModal.vue`、`PickCategoryModal.vue`、`SettingsModal.vue`、`FirstLaunchModal.vue`，把：

```html
<div class="modal-mask" @click.self="emit('close')">
```

替换为：

```html
<ModalMask @close="emit('close')">
```

并在每个文件的 `<script setup>` 中加入 `import ModalMask from './ModalMask.vue'`，同时在对应闭合处把 `</div>` 换成 `</ModalMask>`（保持内部 `.modal` 结构不变）。

- [ ] **Step 3: 选中行 hover 移除**

在 `src/styles/main.css` 中，把：

```css
.site-table tr:hover { background:#FFF2F7; }
.site-table .row-selected { background:#E6DBFF; }
```

替换为：

```css
.site-table tr:hover { background:#FFF2F7; }
.site-table tr.row-selected, .site-table tr.row-selected:hover { background:#E6DBFF; }
```

- [ ] **Step 4: 类型检查与构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 5: 手动验收（真机 `npm run tauri dev`）**

- 在弹窗内拖选文字并拖出遮罩松开 → 弹窗**不关闭**。
- 直接点击遮罩空白 → 弹窗关闭。
- 选中一行后悬停 → 该行保持紫色 `#E6DBFF`，不闪回粉色。

- [ ] **Step 6: 提交**

```bash
git add src/components/ModalMask.vue src/components/AddEditModal.vue src/components/AddTagsModal.vue src/components/ImportExportModal.vue src/components/PickCategoryModal.vue src/components/SettingsModal.vue src/components/FirstLaunchModal.vue src/styles/main.css
git commit -m "fix: 弹窗仅点击遮罩关闭；选中行 hover 保持稳定"
```

---

### Task 10: 分类创建入口 + 统一应用内弹窗（替换 prompt/confirm）

**Files:**
- Create: `src/components/PromptModal.vue`、`src/components/ConfirmModal.vue`、`src/components/AddCategoryModal.vue`
- Modify: `src/store/app.ts`（`addCategory` 返回新 id）
- Modify: `src/store/app.spec.ts`（addCategory 返回 id 测试）
- Modify: `src/components/AddEditModal.vue`（下拉加「＋ 新建分类」）
- Modify: `src/components/Sidebar.vue`（「全部」右键 → 添加顶层分类）
- Modify: `src/components/CategoryNode.vue`（右键加「添加子分类」；重命名/删除改用应用内弹窗；第 3 层不显示添加子分类）
- Test: `src/store/app.spec.ts` + 手动验收

**Interfaces:**
- Consumes: `store.addCategory`、`store.renameCategory`、`store.deleteCategory`、`store.flatCategories`
- Produces:
  - `PromptModal.vue`：props `{ title, initial }`；emit `confirm(name: string)`、`close`
  - `ConfirmModal.vue`：props `{ title, message, options: { value: string; label: string; danger?: boolean }[] }`；emit `choose(value: string)`、`close`
  - `AddCategoryModal.vue`：props `{ parentId: string | null }`；emit `created(id: string)`、`close`
  - store：`addCategory(name, parentId): string`（返回新分类 id）
- 后续任务依赖：无（最后交付）。整体验收后跑全量回归。

- [ ] **Step 1: store 的 `addCategory` 返回 id**

在 `src/store/app.ts` 中把 `addCategory` 改为返回新分类 id（完整函数）：

```ts
addCategory(name: string, parentId: string | null): string {
  const node = { id: this.id_gen(), name, children: [] as any[] }
  if (parentId == null) this.data.categories.push(node)
  else {
    const walk = (list: any[]): boolean => {
      for (const c of list) {
        if (c.id === parentId) { c.children.push(node); return true }
        if (walk(c.children)) return true
      }
      return false
    }
    walk(this.data.categories)
  }
  this.persist()
  return node.id
},
```

在 `src/store/app.spec.ts` 追加测试：

```ts
it('addCategory returns new id and appends under parent', () => {
  const s = useAppStore()
  s.data = baseData
  const id = s.addCategory('子分类', 'c1')
  expect(id).toMatch(/^id_/)
  expect(s.data.categories[0].children.some(c => c.id === id)).toBe(true)
})
```

- [ ] **Step 2: 创建 `PromptModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; initial?: string }>()
const emit = defineEmits(['confirm', 'close'])
const value = ref(props.initial ?? '')
function ok() { if (value.value.trim()) emit('confirm', value.value.trim()) }
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <input v-model="value" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="ok">确定</button></div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 3: 创建 `ConfirmModal.vue`**

```vue
<script setup lang="ts">
import ModalMask from './ModalMask.vue'
const props = defineProps<{ title: string; message?: string; options: { value: string; label: string; danger?: boolean }[] }>()
const emit = defineEmits(['choose', 'close'])
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>{{ props.title }}</h3>
      <p class="muted" v-if="props.message">{{ props.message }}</p>
      <div class="actions">
        <button v-for="opt in props.options" :key="opt.value" class="btn" :class="{ danger: opt.danger }" @click="emit('choose', opt.value)">{{ opt.label }}</button>
        <button class="btn" @click="emit('close')">取消</button>
      </div>
    </div>
  </ModalMask>
</template>
```

- [ ] **Step 4: 创建 `AddCategoryModal.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import ModalMask from './ModalMask.vue'
const store = useAppStore()
const props = defineProps<{ parentId: string | null }>()
const emit = defineEmits(['created', 'close'])
const name = ref('')
const parentId = ref(props.parentId)

function create() {
  if (!name.value.trim()) return
  const id = store.addCategory(name.value.trim(), parentId.value)
  emit('created', id)
}
</script>

<template>
  <ModalMask @close="emit('close')">
    <div class="modal">
      <h3>新建分类</h3>
      <label>父级分类</label>
      <select v-model="parentId">
        <option :value="null">顶层</option>
        <option v-for="c in store.flatCategories.filter(c => c.depth < 2)" :key="c.id" :value="c.id">{{ '　'.repeat(c.depth) }}{{ c.name }}</option>
      </select>
      <label>分类名称</label>
      <input v-model="name" placeholder="分类名" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="create">创建</button></div>
    </div>
  </ModalMask>
</template>
```

注意：`flatCategories.filter(c => c.depth < 2)` 保证新分类深度不超过第 3 层（父级 depth≤1 时子级 depth≤2）。

- [ ] **Step 5: 改造 `AddEditModal.vue`（下拉 + 新建分类）**

在 `<script setup>` 中加：

```ts
import AddCategoryModal from './AddCategoryModal.vue'
import ModalMask from './ModalMask.vue'
const showAddCat = ref(false)
const pendingCat = ref<string | null>(null)
const NEW_CAT = '__new_cat__'
function onCatChange(e: any) {
  if (e.target.value === NEW_CAT) {
    pendingCat.value = categoryId.value
    showAddCat.value = true
    categoryId.value = null // 先回退下拉显示
  }
}
function onCatCreated(id: string) {
  categoryId.value = id
  showAddCat.value = false
}
```

模板：把分类 `<select v-model="categoryId">` 的 `@change` 加 `onCatChange`，并在 `</select>` 后（或 option 列表）加：

```html
<option :value="'__new_cat__'">＋ 新建分类…</option>
```

把外层遮罩 `<div class="modal-mask" @click.self="emit('close')">` 换成 `<ModalMask @close="emit('close')">` 并闭合 `</ModalMask>`，然后在 `.actions` 后追加：

```html
<AddCategoryModal v-if="showAddCat" :parent-id="pendingCat" @created="onCatCreated" @close="showAddCat = false" />
```

- [ ] **Step 6: 改造 `Sidebar.vue`（「全部」右键添加顶层分类）**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import CategoryNode from './CategoryNode.vue'
import AddCategoryModal from './AddCategoryModal.vue'
const store = useAppStore()
const showAdd = ref(false)
function setView(kind: any, id?: string) { store.view = { kind, id } }
function onAllMenu(e: MouseEvent) { e.preventDefault(); showAdd.value = true }
</script>
```

模板：把「全部」行改为：

```html
<div class="row" :class="{ active: store.view.kind === 'all' }" @click="setView('all')" @contextmenu.prevent="onAllMenu">全部 <span class="cnt">{{ store.data.sites.length }}</span></div>
```

在 `<aside>` 内末尾追加：

```html
<AddCategoryModal v-if="showAdd" :parent-id="null" @created="store.view = { kind: 'category', id: $event }; showAdd = false" @close="showAdd = false" />
```

- [ ] **Step 7: 改造 `CategoryNode.vue`（添加子分类 + 应用内弹窗）**

整文件重写：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import ContextMenu from './ContextMenu.vue'
import PromptModal from './PromptModal.vue'
import ConfirmModal from './ConfirmModal.vue'
import AddCategoryModal from './AddCategoryModal.vue'
const store = useAppStore()
const props = defineProps<{ cat: any; depth: number }>()
const menu = ref<{ x: number; y: number } | null>(null)
const renameCat = ref<any | null>(null)
const delCat = ref<any | null>(null)
const addCat = ref(false)

function menuItems() {
  const items = [{ kind: 'rename', label: '重命名' }]
  if (props.depth < 2) items.push({ kind: 'add-sub', label: '添加子分类' })
  items.push({ kind: 'delete', label: '删除分类', danger: true })
  return items
}
function setView(kind: any, id?: string) { store.view = { kind, id } }
function onCatMenu(e: MouseEvent) { menu.value = { x: e.clientX, y: e.clientY } }
function onAction(kind: string, cat: any) {
  menu.value = null
  if (kind === 'rename') renameCat.value = cat
  else if (kind === 'add-sub') addCat.value = true
  else if (kind === 'delete') delCat.value = cat
}
function doRename(name: string) { store.renameCategory(renameCat.value.id, name); renameCat.value = null }
function doDelete(mode: string) {
  store.deleteCategory(delCat.value.id, mode === 'delete' ? 'delete-sites' : 'move-to-uncategorized')
  delCat.value = null
}
</script>

<template>
  <div>
    <div
      :class="[(depth > 0 ? 'row sub' : 'row'), { active: store.view.kind === 'category' && store.view.id === cat.id }]"
      :style="{ paddingLeft: (depth > 0 ? 12 : 0) + depth * 14 + 'px' }"
      @click="setView('category', cat.id)"
      @contextmenu.prevent="onCatMenu($event)"
    >
      {{ cat.name }}
    </div>
    <CategoryNode v-for="cc in cat.children" :key="cc.id" :cat="cc" :depth="depth + 1" />
    <div class="menu-mask" v-if="menu" @click="menu = null" @contextmenu.prevent="menu = null"></div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems()" @action="(kind: string) => onAction(kind, cat)" />
    <PromptModal v-if="renameCat" :title="'重命名分类'" :initial="renameCat.name" @confirm="doRename" @close="renameCat = null" />
    <ConfirmModal
      v-if="delCat"
      :title="'删除分类'"
      :message="`删除「${delCat.name}」及其子分类，其中网站如何处理？`"
      :options="[{ value: 'move', label: '网站移入未分类' }, { value: 'delete', label: '连同网站删除', danger: true }]"
      @choose="doDelete"
      @close="delCat = null"
    />
    <AddCategoryModal v-if="addCat" :parent-id="cat.id" @created="setView('category', $event); addCat = false" @close="addCat = false" />
  </div>
</template>
```

注意：删除原 `onKey`/`onMounted`/`onUnmounted` 中的 Esc 处理（`App.vue` 已有全局 Esc 关闭逻辑，且 ContextMenu 组件自带遮罩）。若希望保留分类菜单 Esc 关闭，保留原 onKey 监听亦无妨，二选一即可——本方案保留组件内 onKey 以防误关（删除 `onKey` 相关三行即可，App 全局 Esc 会清 selection 与 modal，但不含本菜单）。

- [ ] **Step 8: 全量回归**

Run: `npm run test` 然后 `npm run build` 然后 `cargo test`
Expected: 前端 store 16/16 PASS（含新增 addCategory/flash 测试）；vue-tsc/build 通过；cargo 测试全部 PASS。

- [ ] **Step 9: 手动验收（真机 `npm run tauri dev`）**

- 添加/编辑弹窗分类下拉 → 选「＋ 新建分类…」→ 弹出新建分类弹窗 → 创建后下拉自动选中新分类。
- 侧栏「全部」右键 → 添加顶层分类。
- 侧栏分类右键 → 菜单含「添加子分类」；在第 3 层分类上右键 → **无**「添加子分类」。
- 分类右键「重命名」→ 应用内输入弹窗（非浏览器 prompt）。
- 分类右键「删除分类」→ 应用内两按钮弹窗：移入未分类 / 连同删除。
- 全应用无浏览器原生 prompt/confirm。
- 右键菜单位置正常（Task 8 回归）。

- [ ] **Step 10: 提交**

```bash
git add src/store/app.ts src/store/app.spec.ts src/components/PromptModal.vue src/components/ConfirmModal.vue src/components/AddCategoryModal.vue src/components/AddEditModal.vue src/components/Sidebar.vue src/components/CategoryNode.vue
git commit -m "feat: 分类创建入口与统一应用内弹窗，替换 prompt/confirm"
```

---

## 完成后回归验收（全部任务完成后执行）

- [ ] `npm run test` → 全部 PASS
- [ ] `npm run build` → vue-tsc 无错误、vite 构建成功
- [ ] `cargo test` → 全部 PASS
- [ ] 真机 `npm run tauri build` → MSI 重新打包成功（新增 dialog 插件后必须重建）
- [ ] 手动跑 PRD v1.1 新增功能验收清单（§15.4）全部勾选