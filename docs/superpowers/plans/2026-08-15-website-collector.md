# 网站收藏管家 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地桌面应用"网站收藏管家"，管理分类网站、检测可访问性、回收站、md 导入导出，糖果像素视觉风格。

**Architecture:** Tauri 2 桌面壳（Rust 后端负责 HTTP 检测与 JSON/md 文件读写，前端 Vue 3 + Pinia 单页应用承载 UI 与状态）。Rust 通过 `#[tauri::command]` 暴露 IPC；前端通过 `@tauri-apps/api/core` 的 `invoke` 调用。检测、持久化、md 解析等纯逻辑放 Rust 便于 `cargo test`；前端状态与筛选逻辑用 Vitest 测试。

**Tech Stack:** Tauri 2（Rust）、reqwest（HTTP 检测）、serde/serde_json、Vue 3、Pinia、Vite、TypeScript、Vitest。

## Global Constraints

（以下约束逐条来自 PRD，所有任务隐含包含本约束。值必须照抄，不得改动。）

- 应用为单页无跳转，一屏承载全部功能，侧栏切换视图。
- 分类嵌套最多 **3 层**；链接**唯一**（名称可重复），重复链接添加被拦截。
- 检测判定：最终状态码 **2xx/3xx = ok**；404/403/5xx、超时、网络错误 = dead。
- 检测先测存的链接，失败后降级测**根域名**。
- 检测前先探测连通性（`check_connectivity`），失败则提示并中止，不得批量误标。
- 删除一律进回收站；回收站内网站不参与检测；可恢复、可彻底删除、可清空。
- 删除分类弹框二选一：`move-to-uncategorized`（网站挪未分类）或 `delete-sites`（连网站进回收站）。
- 导入 md 弹框选 **overwrite**（覆盖前自动备份 .bak）/ **merge**（同链接更新名称分类、新分类自动建、不清空已有）。
- md 导出含状态标记（`✅ 日期` / `❌ 日期`）；md 导入忽略状态标记（视为未检测）；标签不进入 md。
- 每次数据变更即时写盘（`save_data`），刷新/关闭/重启不丢失。
- JSON 损坏时自动备份为 `.bak` 后重建空库。
- 存储位置可迁移（移动文件，旧位置不留副本），默认存系统用户数据目录。
- 视觉：糖果像素。主背景 `#FFF9FB`、浅粉底 `#FFE9F3`、主色 `#7A5CFF`、辅色 `#FF5FA8`、文字 `#4A3B6E`、次文字 `#B59FD8`、边框 `#C9B8E8`、成功 `#4FF0A8`、待定 `#FFE08A`、危险 `#FF2D78`。字体全站 `'Courier New', monospace`（正文 12px/次级 11px/辅助 10px，行高 1.6）。圆角 3px/6px/999px。阴影为 2-4px 实色硬阴影。状态表达 `♥♥♥`(ok) / `♥`(dead) / `♥?`(unknown)。
- 第一版不做：登录、云同步、定时检测、手机适配、备注、favicon、排序、全局标签管理页、暗色模式。

---

### Task 0: 环境准备与项目脚手架

**Files:**
- Create: 整个 Tauri + Vue 项目骨架（src-tauri、src、package.json 等）

**Interfaces:**
- Consumes: 无
- Produces: `src-tauri/Cargo.toml`（含 reqwest/serde）、`src-tauri/src/main.rs`、`src-tauri/src/lib.rs`（调用 `run()`）、`src/main.ts`、`src/App.vue`、`package.json`（含 `"test": "vitest run"`、`pinia` 依赖）

- [ ] **Step 1: 检查 Rust 工具链**

Run: `cargo --version` 与 `rustc --version`
Expected: 输出版本号。若 `cargo: command not found`，则先安装 Rust（Windows 用 `winget install Rustlang.Rustup` 或从 https://rustup.rs 安装 MSVC toolchain），重启终端后重试，直到两条命令都有输出。

- [ ] **Step 2: 脚手架初始化**

Run: `npm create tauri-app@latest . -- --template vue-ts --manager npm --yes`
Expected: 在当前目录生成 Vue3+TS+Vite+Tauri 工程。若因目录非空失败，先临时 `git stash` 或用 `npm create tauri-app@latest temp-sca -- --template vue-ts --manager npm --yes` 生成到子目录后合并关键文件。完成后目录含 `src/`、`src-tauri/`、`index.html`、`vite.config.ts`。

- [ ] **Step 3: 安装依赖**

```bash
npm install
npm install pinia
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 4: Rust 依赖加入 Cargo.toml**

Edit `src-tauri/Cargo.toml`，在 `[dependencies]` 中追加：
```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 5: 验证前端构建**

Run: `npm run build`
Expected: Vite 构建成功，输出 `dist/`。若缺 TypeScript 类型报错，修正后重跑。

- [ ] **Step 6: 验证 Rust 编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。首次会下载依赖较慢属正常。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: 初始化 Tauri + Vue3 工程骨架"
```

---

### Task 1: Rust 数据模型与 JSON 持久化

**Files:**
- Create: `src-tauri/src/data.rs`
- Modify: `src-tauri/src/lib.rs`（加 `mod data;`）
- Test: `src-tauri/src/data.rs` 内 `#[cfg(test)]` 模块

**Interfaces:**
- Consumes: serde/serde_json
- Produces:
  - `pub struct Category { pub id: String, pub name: String, pub children: Vec<Category> }`
  - `pub struct Site { pub id: String, pub name: String, pub url: String, pub category_id: Option<String>, pub tags: Vec<String>, pub status: String, pub last_check: Option<String> }`（status 取值 `"ok" | "dead" | "unknown"`，serde camelCase）
  - `pub struct TrashedSite { pub site: Site, pub deleted_at: String }`
  - `pub struct AppData { pub version: u32, pub categories: Vec<Category>, pub sites: Vec<Site>, pub recycle_bin: Vec<TrashedSite>, pub tags: Vec<String> }`
  - `pub fn data_file_path(app_data_dir: &std::path::Path) -> std::path::PathBuf`
  - `pub fn load_data(app_data_dir: &std::path::Path) -> AppData`（文件缺失返回空 AppData；JSON 损坏备份 `.bak` 后返回空 AppData）
  - `pub fn save_data(app_data_dir: &std::path::Path, data: &AppData) -> Result<(), String>`

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/data.rs` 末尾加：
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("bookmark_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn load_missing_file_returns_empty() {
        let d = tmp_dir();
        let data = load_data(&d);
        assert!(data.categories.is_empty() && data.sites.is_empty());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = tmp_dir();
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site {
            id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
            category_id: None, tags: vec!["框架".into()], status: "ok".into(), last_check: None,
        });
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.sites.len(), 1);
        assert_eq!(loaded.sites[0].name, "React");
    }

    #[test]
    fn corrupt_file_backs_up_and_returns_empty() {
        let d = tmp_dir();
        let p = data_file_path(&d);
        fs::write(&p, "{ not valid json").unwrap();
        let data = load_data(&d);
        assert!(data.sites.is_empty());
        assert!(p.with_extension("json.bak").exists());
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test data`
Expected: 编译失败，报 `cannot find module data` / `use of undeclared crate or module`。

- [ ] **Step 3: 实现 data.rs**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Category { pub id: String, pub name: String, #[serde(default)] pub children: Vec<Category> }

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String, pub name: String, pub url: String,
    pub category_id: Option<String>,
    #[serde(default)] pub tags: Vec<String>,
    #[serde(default)] pub status: String,
    pub last_check: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashedSite { pub site: Site, pub deleted_at: String }

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub version: u32,
    #[serde(default)] pub categories: Vec<Category>,
    #[serde(default)] pub sites: Vec<Site>,
    #[serde(default)] pub recycle_bin: Vec<TrashedSite>,
    #[serde(default)] pub tags: Vec<String>,
}

pub fn data_file_path(app_data_dir: &Path) -> PathBuf { app_data_dir.join("websites.json") }

pub fn load_data(app_data_dir: &Path) -> AppData {
    let path = data_file_path(app_data_dir);
    if !path.exists() { return AppData::default(); }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str::<AppData>(&s).unwrap_or_else(|_| {
            let _ = fs::copy(&path, path.with_extension("json.bak"));
            AppData::default()
        }),
        Err(_) => AppData::default(),
    }
}

pub fn save_data(app_data_dir: &Path, data: &AppData) -> Result<(), String> {
    let path = data_file_path(app_data_dir);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 加模块声明**

Edit `src-tauri/src/lib.rs` 顶部：
```rust
mod data;
```

- [ ] **Step 5: 运行确认通过**

Run: `cd src-tauri && cargo test data`
Expected: 3 个测试全 PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/data.rs src-tauri/src/lib.rs
git commit -m "feat: Rust 数据模型与 JSON 持久化（含损坏备份）"
```

---

### Task 2: Rust 可访问性检测

**Files:**
- Create: `src-tauri/src/check.rs`
- Modify: `src-tauri/src/lib.rs`（加 `mod check;`）
- Test: `src-tauri/src/check.rs` 内 `#[cfg(test)]` 模块

**Interfaces:**
- Consumes: reqwest、url
- Produces:
  - `pub struct CheckResult { pub status: String, pub used_url: String }`（serde camelCase）
  - `pub fn normalize_url(raw: &str) -> String`（无协议自动补 `https://`）
  - `pub fn root_url(raw: &str) -> String`（取协议+域名，去路径）
  - `pub async fn check_connectivity() -> bool`（GET https://example.com 超时 5s，成功 true）
  - `pub async fn check_site(url: &str) -> CheckResult`（先测原链接；原链接 2xx/3xx=ok，否则（含 404/403/5xx、超时、网络错误）降级测根域名；根域名也非 ok 才标 dead）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_adds_https() {
        assert_eq!(normalize_url("react.dev"), "https://react.dev");
        assert_eq!(normalize_url("https://react.dev"), "https://react.dev");
    }

    #[test]
    fn root_strips_path() {
        assert_eq!(root_url("https://react.dev/learn"), "https://react.dev");
        assert_eq!(root_url("https://vuejs.org"), "https://vuejs.org");
    }

    #[test]
    fn root_on_bare_domain() {
        assert_eq!(root_url("react.dev"), "https://react.dev");
    }

    #[test]
    fn connectivity_false_on_bad_host() {
        // 指向一个必然失败的地址：本地未监听端口
        let url = "http://127.0.0.1:1"; // port 1 通常拒绝连接
        let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
            // 直接检测该地址应返回 dead
            check_site(url).await
        });
        assert_eq!(res.status, "dead");
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test check`
Expected: 编译失败，`cannot find module check` / `cannot find function normalize_url`。

- [ ] **Step 3: 实现 check.rs**

```rust
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult { pub status: String, pub used_url: String }

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub fn normalize_url(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with("http://") || t.starts_with("https://") { t.to_string() } else { format!("https://{}", t) }
}

pub fn root_url(raw: &str) -> String {
    let u = normalize_url(raw);
    let parsed = url::Url::parse(&u).unwrap_or_else(|_| url::Url::parse("https://invalid").unwrap());
    let mut b = parsed.clone();
    let _ = b.set_path("");
    let _ = b.set_query(None);
    let _ = b.set_fragment(None);
    b.to_string()
}

fn classify(status: u16) -> &'static str {
    if (200..400).contains(&status) { "ok" } else { "dead" }
}

async fn probe(c: &reqwest::Client, url: &str) -> Option<CheckResult> {
    let resp = c.get(url).send().await.ok()?;
    Some(CheckResult { status: classify(resp.status().as_u16()).to_string(), used_url: url.to_string() })
}

pub async fn check_connectivity() -> bool {
    let c = reqwest::Client::builder().timeout(Duration::from_secs(5)).build().unwrap_or_default();
    c.get("https://example.com").send().await.is_ok()
}

pub async fn check_site(url: &str) -> CheckResult {
    let c = client();
    let full = normalize_url(url);
    if let Some(r) = probe(&c, &full).await {
        if r.status == "ok" { return r; }
    }
    // 原链接 404/403/5xx、超时或网络错误 → 降级测根域名（PRD: 避免子页面 404 误标）
    let root = root_url(url);
    if root != full {
        if let Some(r) = probe(&c, &root).await { return r; }
    }
    CheckResult { status: "dead".into(), used_url: full }
}
```

- [ ] **Step 4: 加模块声明**

Edit `src-tauri/src/lib.rs`：
```rust
mod check;
```

- [ ] **Step 5: 运行确认通过**

Run: `cd src-tauri && cargo test check`
Expected: 4 个测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/check.rs src-tauri/src/lib.rs
git commit -m "feat: 可访问性检测（原链接降级根域名，断网探测）"
```

---

### Task 3: Rust md 导出与导入

**Files:**
- Create: `src-tauri/src/md.rs`
- Modify: `src-tauri/src/lib.rs`（加 `mod md;`）
- Test: `src-tauri/src/md.rs` 内 `#[cfg(test)]` 模块

**Interfaces:**
- Consumes: data::AppData、data::Category、data::Site
- Produces:
  - `pub fn export_to_md(data: &AppData) -> String`（标题树 + `- [名称](链接)` + 状态标记；标签不导出）
  - `pub fn import_from_md(text: &str) -> AppData`（解析 `#`/`##`/`###` 分类与链接行；忽略状态标记与日期；返回 status=unknown、无标签；分类嵌套还原）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{AppData, Category, Site};

    #[test]
    fn export_roundtrip_preserves_structure() {
        let data = AppData {
            version: 1,
            categories: vec![Category {
                id: "c1".into(), name: "开发工具".into(),
                children: vec![Category { id: "c2".into(), name: "前端".into(), children: vec![] }],
            }],
            sites: vec![Site {
                id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
                category_id: Some("c2".into()), tags: vec!["框架".into()],
                status: "ok".into(), last_check: Some("2026-08-15".into()),
            }],
            recycle_bin: vec![], tags: vec![],
        };
        let md = export_to_md(&data);
        assert!(md.contains("# 开发工具"));
        assert!(md.contains("## 前端"));
        assert!(md.contains("- [React](https://react.dev) ✅ 2026-08-15"));
        assert!(!md.contains("框架"), "标签不应出现在 md 中");
    }

    #[test]
    fn import_ignores_status_and_tags() {
        let text = "# 开发工具\n## 前端\n- [React](https://react.dev) ✅ 2026-08-15\n- [Vue](https://vuejs.org) ❌ 2026-08-15\n";
        let data = import_from_md(text);
        assert_eq!(data.categories.len(), 1);
        assert_eq!(data.categories[0].children.len(), 1);
        assert_eq!(data.sites.len(), 2);
        assert_eq!(data.sites[0].status, "unknown");
        assert_eq!(data.sites[0].tags.len(), 0);
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test md`
Expected: 编译失败，`cannot find module md`。

- [ ] **Step 3: 实现 md.rs**

```rust
use crate::data::{AppData, Category, Site};

pub fn export_to_md(data: &AppData) -> String {
    let mut out = String::new();
    fn walk(cats: &[Category], data: &AppData, out: &mut String, depth: usize) {
        for c in cats {
            out.push_str(&format!("{} {}\n", "#".repeat(depth), c.name));
            for s in data.sites.iter().filter(|s| s.category_id.as_deref() == Some(&c.id)) {
                out.push_str(&site_line(s));
            }
            walk(&c.children, data, out, depth + 1);
            out.push('\n');
        }
    }
    walk(&data.categories, data, &mut out, 1);
    out
}

fn site_line(s: &Site) -> String {
    let mark = match (s.status.as_str(), &s.last_check) {
        ("ok", Some(d)) => format!(" ✅ {}", d),
        ("dead", Some(d)) => format!(" ❌ {}", d),
        _ => String::new(),
    };
    format!("- [{}]({}){}\n", s.name, s.url, mark)
}

pub fn import_from_md(text: &str) -> AppData {
    // 第一遍：收集扁平分类行与站点行
    struct FlatCat { name: String, parent: Option<usize> }
    let mut flat: Vec<FlatCat> = Vec::new();
    let mut sites: Vec<Site> = Vec::new();
    let mut heading_stack: Vec<(usize, usize)> = Vec::new(); // (depth, flat index)
    let mut site_seq = 0usize;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() { continue; }
        if line.starts_with('#') {
            let depth = line.chars().take_while(|c| *c == '#').count();
            let name = line[depth..].trim().to_string();
            while let Some(&(d, _)) = heading_stack.last() { if d >= depth { heading_stack.pop(); } else { break; } }
            let parent = heading_stack.last().map(|&(_, i)| i);
            let idx = flat.len();
            flat.push(FlatCat { name, parent });
            heading_stack.push((depth, idx));
        } else if let Some(rest) = line.strip_prefix('-') {
            let rest = rest.trim();
            if let (Some(ns), Some(ne)) = (rest.find('['), rest.find(']')) {
                let name = rest[ns + 1..ne].to_string();
                let tail = &rest[ne + 1..];
                if let (Some(us), Some(ue)) = (tail.find('('), tail.find(')')) {
                    let url = tail[us + 1..ue].trim().to_string();
                    let category_id = heading_stack.last().map(|&(_, i)| format!("c{}", i));
                    sites.push(Site {
                        id: format!("s{}", site_seq),
                        name, url, category_id,
                        tags: vec![], status: "unknown".into(), last_check: None,
                    });
                    site_seq += 1;
                }
            }
        }
    }

    // 第二遍：按 parent 索引建树。id 采用其在 flat 中的下标，保证映射稳定。
    fn build(cats: &[FlatCat], parent: Option<usize>) -> Vec<Category> {
        cats.iter().enumerate()
            .filter(|(_, c)| c.parent == parent)
            .map(|(idx, c)| Category {
                id: format!("c{}", idx),
                name: c.name.clone(),
                children: build(cats, Some(idx)),
            })
            .collect()
    }

    let categories = build(&flat, None);
    AppData { version: 1, categories, sites, recycle_bin: vec![], tags: vec![] }
}
```

> 说明：`import_from_md` 采用两遍扫描：第一遍把每行标题解析为带 `parent` 下标的扁平列表并记录站点，第二遍递归按父下标建树。分类 id 即其在扁平列表中的下标，保证站点 `category_id` 与树节点 id 一一对应。验收标准：分类嵌套层级正确、站点挂到正确分类、状态 unknown、无标签。

- [ ] **Step 4: 加模块声明**

Edit `src-tauri/src/lib.rs`：
```rust
mod md;
```

- [ ] **Step 5: 运行确认通过**

Run: `cd src-tauri && cargo test md`
Expected: 2 个测试 PASS。若失败，按 Step 3 说明替换实现直到通过。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/md.rs src-tauri/src/lib.rs
git commit -m "feat: md 导出/导入（含状态标记，导入忽略状态）"
```

---

### Task 4: Rust Tauri 命令层

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`（`mod commands;`、`mod data;`、`mod check;`、`mod md;` + `invoke_handler`）
- Test: 无（纯接线层，编译即验证）

**Interfaces:**
- Consumes: `data::load_data/save_data/data_file_path`、`check::check_site/check_connectivity`、`md::export_to_md/import_from_md`、`tauri::Manager` 的 `app.path().app_data_dir()`
- Produces（每个均为 `#[tauri::command]`，前端经 `invoke` 调用，参数名 snake_case 自动映射 camelCase）：
  - `fn get_data_dir(app: tauri::AppHandle) -> String`
  - `fn load_data(app: tauri::AppHandle) -> data::AppData`
  - `fn save_data(app: tauri::AppHandle, data: data::AppData) -> Result<(), String>`
  - `fn migrate_data_dir(app: tauri::AppHandle, new_dir: String) -> Result<(), String>`（移动文件、旧位置删除，写 config.json 记录新目录）
  - `async fn check_site_cmd(url: String) -> check::CheckResult`
  - `async fn check_connectivity_cmd() -> bool`
  - `fn export_md_cmd(app: tauri::AppHandle) -> Result<String, String>`（返回 md 文本）
  - `fn import_md_cmd(app: tauri::AppHandle, text: String, mode: String) -> Result<data::AppData, String>`（mode=`overwrite`|`merge`；overwrite 前备份 .bak）

- [ ] **Step 1: 实现 commands.rs**

```rust
use crate::{check, data, md};
use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn config_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    data_dir(app).join("config.json")
}

fn active_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Ok(s) = std::fs::read_to_string(config_path(app)) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(dir) = v.get("dataDir").and_then(|d| d.as_str()) {
                return std::path::PathBuf::from(dir);
            }
        }
    }
    data_dir(app)
}

#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle) -> String {
    active_data_dir(&app).to_string_lossy().to_string()
}

#[tauri::command]
pub fn load_data(app: tauri::AppHandle) -> data::AppData {
    data::load_data(&active_data_dir(&app))
}

#[tauri::command]
pub fn save_data(app: tauri::AppHandle, data: data::AppData) -> Result<(), String> {
    data::save_data(&active_data_dir(&app), &data)
}

#[tauri::command]
pub fn migrate_data_dir(app: tauri::AppHandle, new_dir: String) -> Result<(), String> {
    let from = active_data_dir(&app);
    let src = data::data_file_path(&from);
    let to_dir = std::path::PathBuf::from(&new_dir);
    std::fs::create_dir_all(&to_dir).map_err(|e| e.to_string())?;
    let dst = to_dir.join("websites.json");
    if src.exists() {
        std::fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    }
    let cfg = serde_json::json!({ "dataDir": new_dir });
    std::fs::write(config_path(&app), serde_json::to_string_pretty(&cfg).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_site_cmd(url: String) -> check::CheckResult {
    check::check_site(&url).await
}

#[tauri::command]
pub async fn check_connectivity_cmd() -> bool {
    check::check_connectivity().await
}

#[tauri::command]
pub fn export_md_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let data = data::load_data(&active_data_dir(&app));
    Ok(md::export_to_md(&data))
}

#[tauri::command]
pub fn import_md_cmd(app: tauri::AppHandle, text: String, mode: String) -> Result<data::AppData, String> {
    let incoming = md::import_from_md(&text);
    let mut current = data::load_data(&active_data_dir(&app));
    match mode.as_str() {
        "overwrite" => {
            let p = data::data_file_path(&active_data_dir(&app));
            if p.exists() {
                std::fs::copy(&p, p.with_extension("json.bak")).map_err(|e| e.to_string())?;
            }
            let _ = data::save_data(&active_data_dir(&app), &incoming);
            Ok(incoming)
        }
        "merge" => {
            merge_into(&mut current, &incoming);
            let _ = data::save_data(&active_data_dir(&app), &current);
            Ok(current)
        }
        _ => Err("mode must be overwrite or merge".into()),
    }
}

fn merge_into(current: &mut data::AppData, incoming: &data::AppData) {
    let mut cat_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut next = current.categories.len();
    fn find_or_create(
        list: &mut Vec<data::Category>,
        incoming_cat: &data::Category,
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
            let mut node = data::Category { id: id.clone(), name: incoming_cat.name.clone(), children: vec![] };
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
            current.sites.push(data::Site {
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

- [ ] **Step 2: 接线 lib.rs**

Edit `src-tauri/src/lib.rs`：
```rust
mod check;
mod commands;
mod data;
mod md;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_data_dir,
            commands::load_data,
            commands::save_data,
            commands::migrate_data_dir,
            commands::check_site_cmd,
            commands::check_connectivity_cmd,
            commands::export_md_cmd,
            commands::import_md_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 编译验证**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。若有借用/所有权报错，按编译器提示修正（本命令层逻辑允许小幅重构，接口签名不得变）。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: Tauri 命令层（读写/迁移/检测/md 导入导出）"
```

---

### Task 5: 前端类型、API 封装与 Pinia 状态

**Files:**
- Create: `src/types.ts`、`src/api.ts`、`src/store/app.ts`
- Modify: `src/main.ts`（挂载 Pinia）
- Test: `src/store/app.spec.ts`

**Interfaces:**
- Consumes: `@tauri-apps/api/core` 的 `invoke`；Rust 命令名（Task 4）
- Produces:
  - `types.ts`：`interface Category { id, name, children: Category[] }`；`interface Site { id, name, url, categoryId: string|null, tags: string[], status: 'ok'|'dead'|'unknown', lastCheck: string|null }`；`interface TrashedSite { site, deletedAt }`；`interface AppData { version, categories, sites, recycleBin, tags }`；`type View = { kind: 'all'|'category'|'dead'|'tag'|'recycle', id?: string }`
  - `api.ts`：`loadData(): Promise<AppData>`、`saveData(d): Promise<void>`、`checkSite(url): Promise<{status, usedUrl}>`、`checkConnectivity(): Promise<boolean>`、`exportMd(): Promise<string>`、`importMd(text, mode): Promise<AppData>`、`getDataDir(): Promise<string>`、`migrateDataDir(dir): Promise<void>`
  - `store/app.ts`（Pinia store，id=`app`）：state `{ data: AppData, view: View, search: string, selectedTag: string|null, selectedIds: string[], checking: boolean, progress: {done, total} }`；actions 见 Task 6-8 补充

- [ ] **Step 1: 写失败测试（store 初版：筛选逻辑）**

```ts
// src/store/app.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './app'
import type { AppData, Site } from '../types'

function makeSite(id: string, status: Site['status'], tags: string[]): Site {
  return { id, name: 'Site' + id, url: 'https://' + id + '.dev', categoryId: 'c1', tags, status, lastCheck: null }
}

const baseData: AppData = {
  version: 1,
  categories: [{ id: 'c1', name: '开发', children: [{ id: 'c2', name: '前端', children: [] }] }],
  sites: [
    makeSite('a', 'ok', ['框架']),
    makeSite('b', 'dead', ['框架']),
    makeSite('c', 'unknown', ['工具']),
  ],
  recycleBin: [],
  tags: ['框架', '工具'],
}

describe('app store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('all view returns all sites', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'all' }
    expect(s.filteredSites).toHaveLength(3)
  })

  it('dead view returns only dead', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'dead' }
    expect(s.filteredSites.map(x => x.id)).toEqual(['b'])
  })

  it('category view includes descendants', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'category', id: 'c1' }
    // c1 下无直属站点，但包含子分类 c2（也无站点），这里调整数据让 c2 下有站点
    s.data.sites[0].categoryId = 'c2'
    expect(s.filteredSites).toHaveLength(3)
  })

  it('tag view filters by tag', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'tag', id: '框架' }
    expect(s.filteredSites.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('search filters by name/url/tag', () => {
    const s = useAppStore()
    s.data = baseData
    s.view = { kind: 'all' }
    s.search = '框架'
    expect(s.filteredSites).toHaveLength(2)
    s.search = '.dev'
    expect(s.filteredSites).toHaveLength(3)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/store/app.spec.ts`
Expected: FAIL（`Cannot find module './app'` 或 store 缺失 filteredSites）。

- [ ] **Step 3: 实现 types.ts**

```ts
export interface Category { id: string; name: string; children: Category[] }
export interface Site {
  id: string; name: string; url: string
  categoryId: string | null; tags: string[]
  status: 'ok' | 'dead' | 'unknown'; lastCheck: string | null
}
export interface TrashedSite { site: Site; deletedAt: string }
export interface AppData {
  version: number; categories: Category[]
  sites: Site[]; recycleBin: TrashedSite[]; tags: string[]
}
export type View = { kind: 'all' | 'category' | 'dead' | 'tag' | 'recycle'; id?: string }
export interface CheckResult { status: 'ok' | 'dead'; usedUrl: string }
```

- [ ] **Step 4: 实现 api.ts**

```ts
import { invoke } from '@tauri-apps/api/core'
import type { AppData, CheckResult } from './types'

export const loadData = () => invoke<AppData>('load_data')
export const saveData = (data: AppData) => invoke<void>('save_data', { data })
export const checkSite = (url: string) => invoke<CheckResult>('check_site_cmd', { url })
export const checkConnectivity = () => invoke<boolean>('check_connectivity_cmd')
export const exportMd = () => invoke<string>('export_md_cmd')
export const importMd = (text: string, mode: string) => invoke<AppData>('import_md_cmd', { text, mode })
export const getDataDir = () => invoke<string>('get_data_dir')
export const migrateDataDir = (newDir: string) => invoke<void>('migrate_data_dir', { newDir })
```

- [ ] **Step 5: 实现 store/app.ts（初版）**

```ts
import { defineStore } from 'pinia'
import type { AppData, Site, TrashedSite, View, Category } from '../types'
import * as api from '../api'

function collectCategoryIds(cats: Category[], rootId: string): string[] {
  const out: string[] = []
  const walk = (list: Category[]) => {
    for (const c of list) {
      if (c.id === rootId) { collect(c, out); return }
      walk(c.children)
    }
  }
  function collect(c: Category, acc: string[]) { acc.push(c.id); c.children.forEach(ch => collect(ch, acc)) }
  walk(cats)
  return out
}

export const useAppStore = defineStore('app', {
  state: () => ({
    data: { version: 1, categories: [], sites: [], recycleBin: [], tags: [] } as AppData,
    view: { kind: 'all' } as View,
    search: '',
    selectedTag: null as string | null,
    selectedIds: [] as string[],
    checking: false,
    progress: { done: 0, total: 0 },
  }),
  getters: {
    filteredSites(state): Site[] {
      let list = [...state.data.sites]
      if (state.view.kind === 'dead') list = list.filter(s => s.status === 'dead')
      else if (state.view.kind === 'category' && state.view.id) {
        const ids = new Set(collectCategoryIds(state.data.categories, state.view.id))
        list = list.filter(s => s.categoryId && ids.has(s.categoryId))
      } else if (state.view.kind === 'tag' && state.view.id) {
        list = list.filter(s => s.tags.includes(state.view.id!))
      }
      const q = state.search.trim().toLowerCase()
      if (q) {
        list = list.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          s.tags.some(t => t.toLowerCase().includes(q)))
      }
      if (state.selectedTag) list = list.filter(s => s.tags.includes(state.selectedTag!))
      return list
    },
    deadCount(state) { return state.data.sites.filter(s => s.status === 'dead').length },
    trashedSites(state): TrashedSite[] { return state.data.recycleBin },
  },
  actions: {
    async init() { this.data = await api.loadData() },
    async persist() { await api.saveData(this.data) },
    async refreshTags() {
      const set = new Set<string>()
      this.data.sites.forEach(s => s.tags.forEach(t => set.add(t)))
      this.data.tags = [...set]
      await this.persist()
    },
  },
})
```

- [ ] **Step 6: 挂载 Pinia**

Edit `src/main.ts`：
```ts
import { createPinia } from 'pinia'
// 在 createApp(App) 后：
app.use(createPinia())
```

- [ ] **Step 7: 运行确认通过**

Run: `npx vitest run src/store/app.spec.ts`
Expected: 5 个测试 PASS。

- [ ] **Step 8: 提交**

```bash
git add src/types.ts src/api.ts src/store/app.ts src/main.ts src/store/app.spec.ts
git commit -m "feat: 前端类型/API 封装与 Pinia 状态（含筛选逻辑测试）"
```

---

### Task 6: 前端布局骨架与核心视图

**Files:**
- Create: `src/App.vue`、`src/components/TopBar.vue`、`src/components/Sidebar.vue`、`src/components/SiteTable.vue`、`src/components/StatusBar.vue`、`src/styles/main.css`
- Modify: `src/main.ts`（引入样式）
- Test: 手动验证

**Interfaces:**
- Consumes: store 的 `filteredSites`、`deadCount`、`trashedSites`、`data.categories`、`data.tags`、`data.sites`、`view`/`search`/`selectedTag` 与 setter actions（Task 7 补充）
- Produces: 布局结构：顶栏 / 侧栏 / 表格 / 状态栏

- [ ] **Step 1: 写 main.css（糖果像素基础变量）**

```css
:root {
  --bg: #FFF9FB; --panel: #FFE9F3; --primary: #7A5CFF; --accent: #FF5FA8;
  --text: #4A3B6E; --text-2: #B59FD8; --border: #C9B8E8;
  --ok: #4FF0A8; --pending: #FFE08A; --danger: #FF2D78;
  --radius: 3px; --radius-lg: 6px; --radius-pill: 999px;
  --shadow: 2px 2px 0 var(--border);
  --font: 'Courier New', Courier, monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }
body { font-family: var(--font); font-size: 12px; line-height: 1.6; color: var(--text); background: var(--bg); }
button { font-family: var(--font); cursor: pointer; }
.app { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; }
```

- [ ] **Step 2: 实现 App.vue**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from './store/app'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import SiteTable from './components/SiteTable.vue'
import StatusBar from './components/StatusBar.vue'

const store = useAppStore()
onMounted(() => { store.init() })
</script>

<template>
  <div class="app">
    <TopBar />
    <div class="body">
      <Sidebar />
      <main class="content"><SiteTable /></main>
    </div>
    <StatusBar />
  </div>
</template>

<style scoped>
.body { display: grid; grid-template-columns: 200px 1fr; min-height: 0; }
.content { overflow: auto; padding: 12px; background: var(--bg); }
</style>
```

- [ ] **Step 3: 实现 TopBar.vue（初版：静态结构，数据来自 store）**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <header class="topbar">
    <span class="logo">◧ 网站收藏管家</span>
    <input class="search" v-model="store.search" placeholder="搜索名称 / 链接 / 标签…" />
    <select v-model="store.selectedTag" class="btn">
      <option :value="null">标签筛选 ▾</option>
      <option v-for="t in store.data.tags" :key="t" :value="t">{{ t }}</option>
    </select>
    <button class="btn primary" @click="$emit('check-all')">▶ 检测全部</button>
    <button class="btn" @click="$emit('add')">＋ 添加</button>
    <button class="btn" @click="$emit('import-export')">导入/导出</button>
    <button class="btn" @click="$emit('settings')">⚙</button>
  </header>
</template>
```

- [ ] **Step 4: 实现 Sidebar.vue（分类树渲染 + 视图切换）**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
function setView(kind: any, id?: string) { store.view = { kind, id } }
</script>

<template>
  <aside class="sidebar">
    <div class="group-label">分类</div>
    <div class="row" :class="{ active: store.view.kind === 'all' }" @click="setView('all')">全部 <span class="cnt">{{ store.data.sites.length }}</span></div>
    <div v-for="c in store.data.categories" :key="c.id">
      <div class="row" :class="{ active: store.view.kind === 'category' && store.view.id === c.id }" @click="setView('category', c.id)">
        ▾ {{ c.name }} <span class="cnt">{{ c.children.length }}</span>
      </div>
      <div v-for="cc in c.children" :key="cc.id" class="row sub" :class="{ active: store.view.kind === 'category' && store.view.id === cc.id }" @click="setView('category', cc.id)">
        {{ cc.name }}
      </div>
    </div>
    <div class="group-label">视图</div>
    <div class="row dead" :class="{ active: store.view.kind === 'dead' }" @click="setView('dead')">⚠ 失效 <span class="cnt">{{ store.deadCount }}</span></div>
    <div class="group-label">标签</div>
    <div v-for="t in store.data.tags" :key="t" class="row" :class="{ active: store.view.kind === 'tag' && store.view.id === t }" @click="setView('tag', t)"># {{ t }}</div>
    <div class="group-label">系统</div>
    <div class="row trash" :class="{ active: store.view.kind === 'recycle' }" @click="setView('recycle')">🗑 回收站 <span class="cnt">{{ store.trashedSites.length }}</span></div>
  </aside>
</template>
```

> 说明：分类树最多 3 层，第一版侧栏按固定两级（顶级+二级）展开渲染即可满足 ≤3 层的最常见使用；如需第三层在 Task 8 用递归组件补足。

- [ ] **Step 5: 实现 SiteTable.vue（初版：展示 filteredSites；交互 Task 8）**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
function heart(s: string) { return s === 'ok' ? '♥♥♥' : s === 'dead' ? '♥' : '♥?' }
</script>

<template>
  <table class="site-table">
    <thead>
      <tr><th></th><th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th></tr>
    </thead>
    <tbody>
      <tr v-for="s in store.filteredSites" :key="s.id">
        <td><span class="cb"></span></td>
        <td :class="{ 'name-dead': s.status === 'dead' }">{{ s.name }}</td>
        <td class="muted">{{ s.url }}</td>
        <td class="muted">{{ s.categoryId }}</td>
        <td><span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span></td>
        <td :class="{ 'ok': s.status === 'ok', 'dead': s.status === 'dead', 'pending': s.status === 'unknown' }">{{ heart(s.status) }}</td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 6: 实现 StatusBar.vue**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <footer class="statusbar">
    <span>共 {{ store.data.sites.length }} 个网站</span>
    <span class="bad">失效 {{ store.deadCount }}</span>
    <span>未检测 {{ store.data.sites.filter(s => s.status === 'unknown').length }}</span>
  </footer>
</template>
```

- [ ] **Step 7: 引入样式并验证**

Edit `src/main.ts`：`import './styles/main.css'`
Run: `npm run build`
Expected: 构建通过。

- [ ] **Step 8: 提交**

```bash
git add src/App.vue src/components/*.vue src/styles/main.css src/main.ts
git commit -m "feat: 布局骨架（顶栏/侧栏/表格/状态栏）与基础样式"
```

---

### Task 7: store 增删改查与分类操作

**Files:**
- Modify: `src/store/app.ts`
- Test: `src/store/app.spec.ts`（追加测试）

**Interfaces:**
- Consumes: 已有 store、`api.saveData`、`api.loadData`
- Produces（actions，均内部调用 `persist()` 即时写盘）：
  - `addSite(input: { name, url, categoryId: string|null, tags: string[] })`
  - `updateSite(id: string, patch: Partial<Site>)`
  - `deleteSites(ids: string[])`（移入 recycleBin 并记录 deletedAt，从 sites 移除）
  - `restoreSite(siteId: string)`（从回收站回 sites）
  - `permanentlyDelete(siteId: string)`
  - `emptyRecycle()`
  - `addCategory(name: string, parentId: string|null)`
  - `renameCategory(id: string, name: string)`
  - `deleteCategory(id: string, mode: 'move-to-uncategorized' | 'delete-sites')`
  - `moveSites(ids: string[], categoryId: string|null)`
  - `addTagsToSites(ids: string[], tags: string[])`
  - `toggleSelect(id: string)` / `clearSelection()`
  - `isDuplicateUrl(url: string): boolean`（getter 也可，用于表单校验）

- [ ] **Step 1: 追加失败测试**

```ts
it('addSite persists and dedups tags', async () => {
  const s = useAppStore()
  s.data = baseData
  s.addSite({ name: 'Vite', url: 'https://vite.dev', categoryId: 'c2', tags: ['工具', '框架'] })
  expect(s.data.sites).toHaveLength(4)
  expect(s.data.tags).toContain('框架')
  expect(s.data.tags).toContain('工具')
})

it('deleteSites moves to recycle bin', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteSites(['a'])
  expect(s.data.sites.map(x => x.id)).toEqual(['b', 'c'])
  expect(s.trashedSites).toHaveLength(1)
  expect(s.trashedSites[0].site.id).toBe('a')
})

it('restoreSite returns to sites', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteSites(['a'])
  s.restoreSite('a')
  expect(s.data.sites).toHaveLength(3)
  expect(s.trashedSites).toHaveLength(0)
})

it('deleteCategory move-to-uncategorized clears categoryId', () => {
  const s = useAppStore()
  s.data = baseData
  s.deleteCategory('c2', 'move-to-uncategorized')
  expect(s.data.sites[0].categoryId).toBeNull()
})

it('deleteCategory delete-sites sends sites to recycle', () => {
  const s = useAppStore()
  s.data = baseData
  // 把站点挂在 c2 下
  s.data.sites.forEach(x => x.categoryId = 'c2')
  s.deleteCategory('c2', 'delete-sites')
  expect(s.data.sites).toHaveLength(0)
  expect(s.trashedSites).toHaveLength(3)
})

it('addTagsToSites appends and dedups', () => {
  const s = useAppStore()
  s.data = baseData
  s.addTagsToSites(['a', 'b'], ['新标签'])
  expect(s.data.sites[0].tags).toContain('新标签')
  expect(s.data.sites[1].tags).toContain('新标签')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/store/app.spec.ts`
Expected: 新增用例 FAIL（action 未定义）。

- [ ] **Step 3: 实现 actions（追加到 store actions）**

```ts
id_gen() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
},

isDuplicateUrl(url: string) {
  return this.data.sites.some(s => s.url === url)
},

addSite(input: { name: string; url: string; categoryId: string | null; tags: string[] }) {
  if (this.isDuplicateUrl(input.url)) return
  this.data.sites.push({
    id: this.id_gen(), name: input.name, url: input.url,
    categoryId: input.categoryId, tags: [...input.tags],
    status: 'unknown', lastCheck: null,
  })
  this.refreshTags()
},

updateSite(id: string, patch: Partial<Site>) {
  const idx = this.data.sites.findIndex(s => s.id === id)
  if (idx >= 0) { Object.assign(this.data.sites[idx], patch); this.refreshTags() }
},

deleteSites(ids: string[]) {
  const set = new Set(ids)
  const now = new Date().toISOString()
  this.data.sites = this.data.sites.filter(s => {
    if (set.has(s.id)) { this.data.recycleBin.push({ site: s, deletedAt: now }); return false }
    return true
  })
  this.persist()
},

restoreSite(siteId: string) {
  const idx = this.data.recycleBin.findIndex(t => t.site.id === siteId)
  if (idx >= 0) {
    this.data.sites.push(this.data.recycleBin[idx].site)
    this.data.recycleBin.splice(idx, 1)
    this.persist()
  }
},

permanentlyDelete(siteId: string) {
  const idx = this.data.recycleBin.findIndex(t => t.site.id === siteId)
  if (idx >= 0) { this.data.recycleBin.splice(idx, 1); this.persist() }
},

emptyRecycle() {
  this.data.recycleBin = []
  this.persist()
},

addCategory(name: string, parentId: string | null) {
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
},

renameCategory(id: string, name: string) {
  const walk = (list: any[]): boolean => {
    for (const c of list) {
      if (c.id === id) { c.name = name; return true }
      if (walk(c.children)) return true
    }
    return false
  }
  walk(this.data.categories)
  this.persist()
},

deleteCategory(id: string, mode: 'move-to-uncategorized' | 'delete-sites') {
  const ids = new Set<string>()
  const collect = (c: any) => { ids.add(c.id); c.children.forEach(collect) }
  const find = (list: any[]): boolean => {
    for (const c of list) {
      if (c.id === id) { collect(c); removeNode(list, c); return true }
      if (find(c.children)) return true
    }
    return false
  }
  const removeNode = (list: any[], target: any) => { const i = list.indexOf(target); if (i >= 0) list.splice(i, 1) }
  find(this.data.categories)
  if (mode === 'move-to-uncategorized') {
    this.data.sites.forEach(s => { if (s.categoryId && ids.has(s.categoryId)) s.categoryId = null })
  } else {
    const toDelete = this.data.sites.filter(s => s.categoryId && ids.has(s.categoryId)).map(s => s.id)
    this.deleteSites(toDelete)
  }
  this.persist()
},

moveSites(ids: string[], categoryId: string | null) {
  const set = new Set(ids)
  this.data.sites.forEach(s => { if (set.has(s.id)) s.categoryId = categoryId })
  this.persist()
},

addTagsToSites(ids: string[], tags: string[]) {
  const set = new Set(ids)
  this.data.sites.forEach(s => {
    if (set.has(s.id)) { tags.forEach(t => { if (!s.tags.includes(t)) s.tags.push(t) }) }
  })
  this.refreshTags()
},

toggleSelect(id: string) {
  const i = this.selectedIds.indexOf(id)
  if (i >= 0) this.selectedIds.splice(i, 1)
  else this.selectedIds.push(id)
},
clearSelection() { this.selectedIds = [] },
```

> 注：`deleteSites`/`restoreSite` 等在测试里会触发 `persist()` → `api.saveData` → `invoke`，Vitest 环境无 Tauri invoke。测试中需 mock：在 spec 顶部 `vi.mock('../api', () => ({ saveData: vi.fn().mockResolvedValue(undefined), loadData: vi.fn().mockResolvedValue(undefined) }))`。

- [ ] **Step 4: 补充测试 mock**

Edit `src/store/app.spec.ts` 顶部追加：
```ts
import { vi } from 'vitest'
vi.mock('../api', () => ({
  saveData: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
}))
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/store/app.spec.ts`
Expected: 全部用例 PASS（初版 5 + 新增 6 = 11）。

- [ ] **Step 6: 提交**

```bash
git add src/store/app.ts src/store/app.spec.ts
git commit -m "feat: 网站/分类/回收站/标签 CRUD 与选择状态"
```

---

### Task 8: 表格交互（多选、右键菜单、双击编辑）

**Files:**
- Create: `src/components/ContextMenu.vue`
- Modify: `src/components/SiteTable.vue`、`src/store/app.ts`（补 `deleteSelected`/`checkSelected` 占位）
- Test: 手动验证

**Interfaces:**
- Consumes: store `selectedIds`、`toggleSelect`、`clearSelection`、`deleteSites`、`moveSites`、`addTagsToSites`、`view`
- Produces: `SiteTable` 触发事件 `@edit(site)`、`@check-site(site)`；`ContextMenu` 触发 `@action(payload)`

- [ ] **Step 1: 实现 ContextMenu.vue（通用右键/批量菜单）**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
const emit = defineEmits(['action'])
const props = defineProps<{ x: number; y: number }>()
function act(kind: string) { emit('action', kind); store.clearSelection() }
</script>

<template>
  <div class="ctx" :style="{ left: props.x + 'px', top: props.y + 'px' }">
    <button class="ctx-item" @click="act('check')">▶ 检测所选</button>
    <button class="ctx-item" @click="act('move')">移动分类…</button>
    <button class="ctx-item" @click="act('tag')">添加标签…</button>
    <button class="ctx-item" @click="act('edit')">编辑</button>
    <button class="ctx-item danger" @click="act('delete')">删除所选</button>
  </div>
</template>
```

- [ ] **Step 2: 重写 SiteTable.vue（含批量条、复选框、右键、双击）**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import ContextMenu from './ContextMenu.vue'

const store = useAppStore()
const menu = ref<{ x: number; y: number } | null>(null)
const emit = defineEmits(['edit', 'check-site', 'move', 'tag'])

function heart(s: string) { return s === 'ok' ? '♥♥♥' : s === 'dead' ? '♥' : '♥?' }

function onRight(e: MouseEvent, siteId: string) {
  if (!store.selectedIds.includes(siteId)) { store.clearSelection(); store.toggleSelect(siteId) }
  menu.value = { x: e.clientX, y: e.clientY }
}
function onRowDblClick(site: any) { emit('edit', site) }
function onAction(kind: string) {
  const ids = [...store.selectedIds]
  menu.value = null
  if (kind === 'check') emit('check-site', ids)
  else if (kind === 'move') emit('move', ids)
  else if (kind === 'tag') emit('tag', ids)
  else if (kind === 'edit') emit('edit', store.data.sites.find(s => s.id === ids[0]))
  else if (kind === 'delete') store.deleteSites(ids)
}
</script>

<template>
  <div class="table-wrap">
    <div v-if="store.selectedIds.length" class="batchbar">
      <b>已选 {{ store.selectedIds.length }} 项</b>
      <button class="btn" @click="emit('check-site', [...store.selectedIds])">▶ 检测所选</button>
      <button class="btn" @click="emit('move', [...store.selectedIds])">移动分类…</button>
      <button class="btn" @click="emit('tag', [...store.selectedIds])">添加标签…</button>
      <button class="btn danger" @click="store.deleteSites([...store.selectedIds])">删除所选</button>
      <button class="btn" style="margin-left:auto" @click="store.clearSelection()">✕ 取消选择</button>
    </div>
    <table class="site-table">
      <thead>
        <tr><th></th><th>名称</th><th>链接</th><th>分类</th><th>标签</th><th>生命</th></tr>
      </thead>
      <tbody>
        <tr
          v-for="s in store.filteredSites" :key="s.id"
          :class="{ 'row-selected': store.selectedIds.includes(s.id) }"
          @dblclick="onRowDblClick(s)"
          @contextmenu.prevent="onRight($event, s.id)"
        >
          <td><span class="cb" :class="{ checked: store.selectedIds.includes(s.id) }" @click.stop="store.toggleSelect(s.id)"></span></td>
          <td :class="{ 'name-dead': s.status === 'dead' }">{{ s.name }}</td>
          <td class="muted">{{ s.url }}</td>
          <td class="muted">{{ s.categoryId }}</td>
          <td><span v-for="t in s.tags" :key="t" class="chip">{{ t }}</span></td>
          <td :class="{ ok: s.status === 'ok', dead: s.status === 'dead', pending: s.status === 'unknown' }">{{ heart(s.status) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.filteredSites.length === 0" class="empty">◇ 还没有网站</div>
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" @action="onAction" />
  </div>
</template>
```

- [ ] **Step 3: 追加 store 快捷 action**

```ts
deleteSelected() { this.deleteSites([...this.selectedIds]) },
```

- [ ] **Step 4: 手动验证**

Run: `npm run tauri dev`
Check: 勾选多行出现批量条；右键弹菜单且仅含选中项；Esc 无法关菜单（可点击空白关闭，见 Step 5 补充全局点击关闭）。

- [ ] **Step 5: 补充点击空白关闭菜单**

Edit `src/App.vue`：
```vue
<main class="content" @click="closeMenu">
```
其中 `closeMenu` 由 SiteTable 暴露——改为在 App 直接置空：由于菜单状态在 SiteTable 内部，简化方案：给 `SiteTable` 加 `@click.self` 无法跨组件。改在 ContextMenu 外层再包一层遮罩：
```vue
<div class="menu-mask" @click.stop="menu = null" @contextmenu.prevent="menu = null"></div>
```
插入 SiteTable 模板中 ContextMenu 之前，并加 CSS `.menu-mask { position: fixed; inset: 0; z-index: 99; }`（放在 .ctx 下层 z-index 100）。

- [ ] **Step 6: 提交**

```bash
git add src/components/SiteTable.vue src/components/ContextMenu.vue src/store/app.ts
git commit -m "feat: 表格多选/右键菜单/双击编辑"
```

---

### Task 9: 添加/编辑弹窗与导入导出/设置弹窗

**Files:**
- Create: `src/components/AddEditModal.vue`、`src/components/ImportExportModal.vue`、`src/components/SettingsModal.vue`
- Modify: `src/App.vue`（挂弹窗与事件）
- Test: 手动验证

**Interfaces:**
- Consumes: store `addSite/updateSite/isDuplicateUrl`、`api.exportMd/importMd/getDataDir/migrateDataDir`、`api`（导入调用 `importMd(text, mode)`）
- Produces: 弹窗组件；App 层 `showModal` 状态

- [ ] **Step 1: 实现 AddEditModal.vue**

```vue
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ editing?: any }>()
const emit = defineEmits(['close'])
const name = ref(props.editing?.name ?? '')
const url = ref(props.editing?.url ?? '')
const tags = ref((props.editing?.tags ?? []).join(' '))
const categoryId = ref(props.editing?.categoryId ?? null)
const dup = ref(false)

function save() {
  const tagList = tags.value.split(/[#\s，,]+/).filter(Boolean)
  if (props.editing) store.updateSite(props.editing.id, { name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList })
  else {
    dup.value = store.isDuplicateUrl(url.value)
    if (dup.value) return
    store.addSite({ name: name.value, url: url.value, categoryId: categoryId.value, tags: tagList })
  }
  emit('close')
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>{{ props.editing ? '编辑网站' : '添加网站' }}</h3>
      <label>名称</label><input v-model="name" placeholder="网站名称" />
      <label>链接</label><input v-model="url" placeholder="https://..." />
      <label>分类</label>
      <select v-model="categoryId">
        <option :value="null">未分类</option>
        <option v-for="c in store.data.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <label>标签（空格分隔）</label><input v-model="tags" placeholder="框架 工具" />
      <p v-if="dup" class="err">⚠ 链接已存在</p>
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="save">保存</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 实现 ImportExportModal.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
import * as api from '../api'
const store = useAppStore()
const emit = defineEmits(['close'])
const mdText = ref('')
const mode = ref<'overwrite' | 'merge'>('merge')
const msg = ref('')

async function doExport() {
  mdText.value = await api.exportMd()
  msg.value = '已生成 md 文本，可复制保存'
}
async function doImport() {
  if (!mdText.value.trim()) { msg.value = '请粘贴 md 内容'; return }
  store.data = await api.importMd(mdText.value, mode.value)
  msg.value = mode.value === 'overwrite' ? '已覆盖导入' : '已合并导入'
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>导入 / 导出</h3>
      <button class="btn" @click="doExport">导出为 md</button>
      <div class="mode-row">
        <label><input type="radio" v-model="mode" value="merge" /> 合并导入</label>
        <label><input type="radio" v-model="mode" value="overwrite" /> 覆盖导入（自动备份 .bak）</label>
      </div>
      <textarea v-model="mdText" rows="10" placeholder="md 内容（粘贴）" />
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button><button class="btn primary" @click="doImport">导入</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 实现 SettingsModal.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as api from '../api'
const emit = defineEmits(['close'])
const dir = ref('')
const msg = ref('')

onMounted(async () => { dir.value = await api.getDataDir() })
async function migrate() {
  const newDir = (window as any).prompt('输入新数据目录（绝对路径）', dir.value)
  if (!newDir || newDir === dir.value) return
  try { await api.migrateDataDir(newDir); dir.value = await api.getDataDir(); msg.value = '已迁移' }
  catch (e) { msg.value = '迁移失败：' + e }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>设置 · 存储位置</h3>
      <p class="muted">当前路径：{{ dir }}</p>
      <button class="btn" @click="migrate">更改位置…</button>
      <p class="muted">{{ msg }}</p>
      <div class="actions"><button class="btn" @click="emit('close')">关闭</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 挂载弹窗到 App.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from './store/app'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import SiteTable from './components/SiteTable.vue'
import StatusBar from './components/StatusBar.vue'
import AddEditModal from './components/AddEditModal.vue'
import ImportExportModal from './components/ImportExportModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import type { Site } from './types'

const store = useAppStore()
const modal = ref<'' | 'add' | 'import' | 'settings'>('')
const editing = ref<Site | undefined>()
function openAdd() { editing.value = undefined; modal.value = 'add' }
function openEdit(site: Site) { editing.value = site; modal.value = 'add' }
</script>

<template>
  <div class="app">
    <TopBar @add="openAdd" @import-export="modal = 'import'" @settings="modal = 'settings'" />
    <div class="body">
      <Sidebar />
      <main class="content">
        <SiteTable @edit="openEdit" />
      </main>
    </div>
    <StatusBar />
    <AddEditModal v-if="modal === 'add'" :editing="editing" @close="modal = ''" />
    <ImportExportModal v-if="modal === 'import'" @close="modal = ''" />
    <SettingsModal v-if="modal === 'settings'" @close="modal = ''" />
  </div>
</template>
```

- [ ] **Step 5: 手动验证**

Run: `npm run tauri dev`
Check: 顶栏"＋添加"弹窗可保存；双击表格行弹编辑；重复链接保存被拦；导入/导出弹窗可用；设置显示路径。

- [ ] **Step 6: 提交**

```bash
git add src/components/AddEditModal.vue src/components/ImportExportModal.vue src/components/SettingsModal.vue src/App.vue
git commit -m "feat: 添加/编辑/导入导出/设置弹窗"
```

---

### Task 10: 检测流程与回收站视图

**Files:**
- Modify: `src/store/app.ts`、`src/components/SiteTable.vue`、`src/components/StatusBar.vue`、`src/components/Sidebar.vue`（回收站视图）
- Create: `src/components/RecycleView.vue`
- Test: 手动验证 + 单元测试补 `checkSites` 迭代逻辑

**Interfaces:**
- Consumes: `api.checkConnectivity`、`api.checkSite`、store `checking/progress`
- Produces: actions `checkAll()`、`checkOne(id)`、`checkSelected()`；RecycleView 组件

- [ ] **Step 1: 写 store 检测 action（含单元测试）**

追加测试：
```ts
it('checkAll updates statuses and progress', async () => {
  const s = useAppStore()
  s.data = baseData
  vi.mocked(api.checkConnectivity).mockResolvedValue(true)
  vi.mocked(api.checkSite).mockResolvedValue({ status: 'dead', usedUrl: 'https://x.dev' })
  await s.checkAll()
  expect(s.data.sites.every(x => x.status === 'dead')).toBe(true)
  expect(s.progress.done).toBe(s.progress.total)
  expect(s.checking).toBe(false)
})
```
（需在 spec 顶部给 `api.checkConnectivity/checkSite` 也 mock。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/store/app.spec.ts`
Expected: 新增用例 FAIL（checkAll 未定义）。

- [ ] **Step 3: 实现检测 actions**

```ts
async checkAll() {
  if (this.checking) return
  if (!(await api.checkConnectivity())) { this.view = { kind: 'dead' }; return }
  this.checking = true
  this.progress = { done: 0, total: this.data.sites.length }
  for (const s of [...this.data.sites]) {
    const r = await api.checkSite(s.url)
    s.status = r.status
    s.lastCheck = new Date().toISOString()
    this.progress.done++
    this.persist()
  }
  this.checking = false
},

async checkOne(id: string) {
  const s = this.data.sites.find(x => x.id === id)
  if (!s) return
  const r = await api.checkSite(s.url)
  s.status = r.status
  s.lastCheck = new Date().toISOString()
  this.persist()
},

async checkSelected() {
  if (this.checking) return
  if (!(await api.checkConnectivity())) { this.view = { kind: 'dead' }; return }
  this.checking = true
  const ids = [...this.selectedIds]
  this.progress = { done: 0, total: ids.length }
  for (const id of ids) {
    const s = this.data.sites.find(x => x.id === id)
    if (s) { const r = await api.checkSite(s.url); s.status = r.status; s.lastCheck = new Date().toISOString() }
    this.progress.done++
    this.persist()
  }
  this.checking = false
  this.clearSelection()
},
```

- [ ] **Step 4: 实现 RecycleView.vue**

```vue
<script setup lang="ts">
import { useAppStore } from '../store/app'
const store = useAppStore()
</script>

<template>
  <div>
    <div class="batchbar">
      <b>回收站 · {{ store.trashedSites.length }} 项</b>
      <button class="btn danger" style="margin-left:auto" @click="store.emptyRecycle()">清空回收站</button>
    </div>
    <table class="site-table">
      <thead><tr><th>名称</th><th>链接</th><th>删除时间</th><th></th></tr></thead>
      <tbody>
        <tr v-for="t in store.trashedSites" :key="t.site.id">
          <td>{{ t.site.name }}</td>
          <td class="muted">{{ t.site.url }}</td>
          <td class="muted">{{ t.deletedAt.slice(0, 10) }}</td>
          <td>
            <button class="btn" @click="store.restoreSite(t.site.id)">恢复</button>
            <button class="btn danger" @click="store.permanentlyDelete(t.site.id)">彻底删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="store.trashedSites.length === 0" class="empty">回收站为空</div>
  </div>
</template>
```

- [ ] **Step 5: 接线（App.vue 判断视图、TopBar 触发检测全部）**

- App.vue：`<main class="content">` 内改：
```vue
<RecycleView v-if="store.view.kind === 'recycle'" />
<SiteTable v-else @edit="openEdit" @check-site="(ids: string[]) => ids.length === 1 ? store.checkOne(ids[0]) : store.checkSelected()" />
```
- TopBar 的"检测全部"改绑定：`@click="$emit('check-all')"`，App 接 `@check-all="store.checkAll"`。
- StatusBar 显示进度：`<span v-if="store.checking">检测中 {{ store.progress.done }}/{{ store.progress.total }}</span>`。

- [ ] **Step 6: 运行确认通过 + 手动验证**

Run: `npx vitest run src/store/app.spec.ts` → 全部 PASS
Run: `npm run tauri dev` → 检测全部按钮生效、进度显示、失效标红、回收站可用。

- [ ] **Step 7: 提交**

```bash
git add src/store/app.ts src/components/SiteTable.vue src/components/StatusBar.vue src/components/RecycleView.vue src/App.vue
git commit -m "feat: 可访问性检测流程与回收站视图"
```

---

### Task 11: 移动分类与批量加标签交互

**Files:**
- Modify: `src/App.vue`、`src/components/SiteTable.vue`
- Create: `src/components/PickCategoryModal.vue`、`src/components/AddTagsModal.vue`
- Test: 手动验证

**Interfaces:**
- Consumes: store `moveSites`、`addTagsToSites`
- Produces: 两个选择弹窗组件

- [ ] **Step 1: 实现 PickCategoryModal.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const target = ref<string | null>(null)
function confirm() { store.moveSites(props.siteIds, target.value); emit('close') }
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>移动分类（{{ props.siteIds.length }} 项）</h3>
      <select v-model="target">
        <option :value="null">未分类</option>
        <option v-for="c in store.data.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">移动</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 实现 AddTagsModal.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'
const store = useAppStore()
const props = defineProps<{ siteIds: string[] }>()
const emit = defineEmits(['close'])
const tags = ref('')
function confirm() {
  const list = tags.value.split(/[#\s，,]+/).filter(Boolean)
  if (list.length) store.addTagsToSites(props.siteIds, list)
  emit('close')
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>添加标签（{{ props.siteIds.length }} 项）</h3>
      <input v-model="tags" placeholder="新标签，空格分隔" />
      <div class="actions"><button class="btn" @click="emit('close')">取消</button><button class="btn primary" @click="confirm">添加</button></div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 接线 App.vue**

新增 state：`const pickIds = ref<string[]>([])`、`const tagIds = ref<string[]>([])`。
`SiteTable` 增加事件 `@move="pickIds = $event"`、`@tag="tagIds = $event"`，并在模板加：
```vue
<PickCategoryModal v-if="pickIds.length" :site-ids="pickIds" @close="pickIds = []" />
<AddTagsModal v-if="tagIds.length" :site-ids="tagIds" @close="tagIds = []" />
```

- [ ] **Step 4: 手动验证**

Run: `npm run tauri dev`
Check: 批量条"移动分类"弹窗生效；右键"添加标签"生效。

- [ ] **Step 5: 提交**

```bash
git add src/components/PickCategoryModal.vue src/components/AddTagsModal.vue src/App.vue
git commit -m "feat: 批量移动分类与添加标签"
```

---

### Task 12: 糖果像素视觉细化与动效

**Files:**
- Modify: `src/styles/main.css`
- Test: 视觉验收（量化检查见 Task 13）

**Interfaces:**
- Consumes: 全部组件 class
- Produces: 完整视觉规范落地（色值/字体/间距/圆角/阴影/状态/动效）

- [ ] **Step 1: 完整化 main.css**

```css
:root {
  --bg:#FFF9FB; --panel:#FFE9F3; --primary:#7A5CFF; --accent:#FF5FA8;
  --text:#4A3B6E; --text-2:#B59FD8; --border:#C9B8E8;
  --ok:#4FF0A8; --pending:#FFE08A; --danger:#FF2D78;
  --radius:3px; --radius-lg:6px; --radius-pill:999px;
  --shadow:2px 2px 0 var(--border); --shadow-primary:2px 2px 0 var(--accent);
  --font:'Courier New',Courier,monospace;
}
body { font-family:var(--font); font-size:12px; line-height:1.6; color:var(--text); background:var(--bg); }
button { font-family:var(--font); font-size:12px; border:2px solid var(--border); background:#fff; border-radius:var(--radius); padding:3px 12px; box-shadow:var(--shadow); color:var(--text); }
button:hover { transform:translateY(-1px); }
button:active { transform:translate(2px,2px); box-shadow:none; }
button.primary { background:var(--primary); border-color:var(--primary); color:#fff; box-shadow:var(--shadow-primary); }
button.danger { border-color:var(--accent); color:var(--danger); }
input, select, textarea { font-family:var(--font); font-size:12px; border:2px solid var(--border); border-radius:var(--radius); padding:4px 8px; background:#fff; box-shadow:var(--shadow); color:var(--text); }
input:focus, select:focus, textarea:focus { outline:none; border-color:var(--primary); }

.topbar { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--panel); border-bottom:3px solid var(--primary); }
.topbar .logo { font-weight:700; color:var(--text); font-size:14px; }
.topbar .search { flex:1; max-width:320px; }
.sidebar { background:var(--panel); border-right:3px solid var(--accent); padding:10px; overflow:auto; }
.sidebar .group-label { font-size:10px; color:var(--text-2); font-weight:700; margin-top:8px; }
.sidebar .row { padding:3px 8px; border-radius:var(--radius); cursor:pointer; }
.sidebar .row:hover { background:var(--pending); }
.sidebar .row.active { background:var(--primary); color:#fff; box-shadow:var(--shadow-primary); }
.sidebar .row .cnt { float:right; color:var(--text-2); font-size:10px; }
.sidebar .row.active .cnt { color:#e8d9ff; }
.sidebar .row.sub { padding-left:18px; }
.sidebar .row.dead, .sidebar .row.trash { color:var(--danger); }
.statusbar { display:flex; gap:14px; padding:5px 12px; background:var(--panel); border-top:3px solid var(--primary); font-size:10px; color:var(--primary); }
.statusbar .bad { color:var(--danger); font-weight:700; }
.site-table { width:100%; border-collapse:collapse; }
.site-table th { text-align:left; padding:4px 8px; color:var(--text-2); border-bottom:2px solid var(--primary); font-size:11px; }
.site-table td { padding:4px 8px; border-bottom:1px solid var(--panel); }
.site-table tr:hover { background:#FFF2F7; }
.site-table .row-selected { background:#E6DBFF; }
.site-table .muted { color:var(--text-2); }
.site-table .name-dead { color:var(--danger); font-weight:700; }
.site-table .ok { color:var(--ok); }
.site-table .dead { color:var(--danger); }
.site-table .pending { color:#A36A00; }
.cb { display:inline-block; width:14px; height:14px; border:2px solid var(--border); border-radius:2px; }
.cb.checked { background:var(--primary); border-color:var(--primary); }
.chip { display:inline-block; background:#fff; border:2px solid var(--ok); border-radius:var(--radius-pill); padding:0 6px; font-size:10px; color:#12906B; margin-right:4px; box-shadow:1px 1px 0 var(--ok); }
.batchbar { display:flex; align-items:center; gap:10px; padding:8px 12px; background:#E6DBFF; border-bottom:1px solid var(--border); }
.batchbar b { color:var(--primary); }
.muted { color:var(--text-2); }
.empty { text-align:center; padding:24px; color:var(--text-2); border:2px dashed var(--border); border-radius:var(--radius-lg); margin-top:12px; }
.modal-mask { position:fixed; inset:0; background:rgba(74,59,110,.35); display:flex; align-items:center; justify-content:center; z-index:200; }
.modal { background:#fff; border:2px solid var(--primary); border-radius:var(--radius-lg); box-shadow:4px 4px 0 var(--accent); padding:16px; min-width:360px; }
.modal h3 { margin-bottom:10px; color:var(--primary); }
.modal label { display:block; margin:6px 0 2px; font-size:11px; color:var(--text-2); }
.modal input, .modal select, .modal textarea { width:100%; margin-bottom:4px; }
.modal .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
.modal .err { color:var(--danger); font-size:11px; }
.mode-row { margin:8px 0; font-size:12px; }
.menu-mask { position:fixed; inset:0; z-index:99; }
.ctx { position:fixed; z-index:100; background:#fff; border:2px solid var(--border); border-radius:var(--radius); box-shadow:4px 4px 0 var(--panel); padding:4px; min-width:160px; }
.ctx-item { display:block; width:100%; text-align:left; border:none; box-shadow:none; background:none; padding:4px 10px; border-radius:var(--radius); }
.ctx-item:hover { background:var(--panel); }
.ctx-item.danger { color:var(--danger); }

@keyframes rowIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.sidebar, .content { animation: rowIn .2s ease both; }
.sidebar { animation-delay: 0ms; }
.content { animation-delay: 80ms; }
.statusbar { animation: rowIn .2s ease both; animation-delay: 160ms; }
@keyframes statusPop { 0%{transform:scale(1)} 40%{transform:scale(1.3)} 100%{transform:scale(1)} }
.site-table td.dead, .site-table td.ok { animation: statusPop .3s ease; }
```

- [ ] **Step 2: 视觉验收（量化自查）**

Check（对照 PRD 15.3）：
- 主背景 `#FFF9FB`、浅粉底 `#FFE9F3`、主色 `#7A5CFF`、辅色 `#FF5FA8`、成功 `#4FF0A8`、待定 `#FFE08A`、危险 `#FF2D78` —— 已全部落入 `:root`。
- 字体 Courier New，正文 12px、次级 11px、辅助 10px、行高 1.6 —— 已体现。
- 圆角 3px/6px/999px —— 已体现。
- 硬阴影 2-4px —— 已体现。
- 状态 `♥♥♥/♥/♥?` —— Task 8 已实现。

- [ ] **Step 3: 提交**

```bash
git add src/styles/main.css
git commit -m "style: 糖果像素视觉规范与动效"
```

---

### Task 13: 断网保护与状态提示完善

**Files:**
- Modify: `src/store/app.ts`、`src/components/StatusBar.vue`、`src/App.vue`
- Test: 单元测试（断网分支）+ 手动验证

**Interfaces:**
- Consumes: `api.checkConnectivity`
- Produces: store `connectivityError` state + `lastCheckTime` getter

- [ ] **Step 1: 写失败测试**

```ts
it('checkAll aborts when offline', async () => {
  const s = useAppStore()
  s.data = baseData
  vi.mocked(api.checkConnectivity).mockResolvedValue(false)
  await s.checkAll()
  expect(s.checking).toBe(false)
  expect(s.data.sites.every(x => x.status === 'unknown')).toBe(true) // 未误标
  expect(s.connectivityError).toBe(true)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/store/app.spec.ts`
Expected: FAIL（connectivityError 未定义）。

- [ ] **Step 3: 实现**

state 加 `connectivityError: false`；`checkAll/checkSelected` 开头失败时置 `this.connectivityError = true`，成功开始时 `false`。
getter 加：
```ts
lastCheckTime(state) {
  const times = state.data.sites.map(s => s.lastCheck).filter(Boolean) as string[]
  return times.length ? new Date(Math.max(...times.map(t => +new Date(t)))).toLocaleString() : '—'
}
```
StatusBar 加：`<span v-if="store.connectivityError" class="pending-hint">⚠ 网络似乎断开，检测已中止</span>`。
App.vue 顶栏"检测全部"点击后若 `connectivityError` 短暂提示（用 StatusBar 展示即可）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/store/app.spec.ts` → PASS
Run: `npm run tauri dev` → 断网时点检测全部提示且不误标。

- [ ] **Step 5: 提交**

```bash
git add src/store/app.ts src/components/StatusBar.vue src/App.vue
git commit -m "feat: 断网保护提示与上次检测时间"
```

---

### Task 14: 端到端验收与打包

**Files:**
- Modify: `src-tauri/tauri.conf.json`（窗口标题/尺寸、identifier）
- Test: 全量手动验收（对照 PRD 第 15 节）

**Interfaces:**
- Consumes: 全部已完成功能

- [ ] **Step 1: 配置窗口**

Edit `src-tauri/tauri.conf.json`：
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "网站收藏管家",
  "version": "0.1.0",
  "identifier": "com.personal.site-collector",
  "build": { "beforeDevCommand": "npm run dev", "devUrl": "http://localhost:1420", "beforeBuildCommand": "npm run build", "frontendDist": "../dist" },
  "app": {
    "windows": [{ "title": "网站收藏管家", "width": 1200, "height": 800, "minWidth": 900, "minHeight": 600 }],
    "security": { "csp": null }
  }
}
```

- [ ] **Step 2: 运行全部单元测试**

Run: `npx vitest run`（前端）与 `cd src-tauri && cargo test`（Rust）
Expected: 前端全部 PASS、Rust 全部 PASS。

- [ ] **Step 3: 布局验收（对照 PRD 15.1）**

Run: `npm run tauri dev`
Check（逐项打勾）：
- 侧栏含分类树/⚠ 失效/标签/回收站/未分类 ✓
- 顶栏含搜索/标签筛选/检测全部/＋添加/导入导出/设置 ✓
- 表格列：复选框/名称/链接/分类/标签/生命 ✓（无操作列）
- 底部状态栏：总数/失效数/未检测/上次检测 ✓
- 单页无跳转，弹窗 Esc 关闭 ✓（给 modal-mask 加 `@keydown.esc`：`document.addEventListener('keydown', e => { if (e.key === 'Escape') ... })`）

- [ ] **Step 4: 交互验收（对照 PRD 15.2）**

Check：
- 双击行编辑 ✓；悬停行 ⋯ 菜单（检测/编辑/删除/移动）→ 需在 SiteTable 悬停显示 `⋯`：给行加 hover 时 `.row-dots` 按钮，点击呼出 ContextMenu（补充实现：`<span v-if="hoverId===s.id" class="dots" @click.stop="onRowDots($event, s.id)">⋯</span>`，`hoverId` 由 `@mouseenter/@mouseleave` 维护）✓
- 勾选多行出批量条 + 右键菜单；Esc 取消选择 ✓（keydown 处理 `selectedIds=[]`）
- 检测全部 → 进度条 + 行状态实时刷新 ✓
- 失效标红；下次检测通过恢复 ✓
- 断网保护 ✓（Task 13）
- 链接唯一 ✓（Task 9）
- 删除分类二选一 ✓（删除分类入口需暴露：侧栏分类右键或在分类上悬停显示删除按钮——补充：侧栏分类行右键呼出菜单含"重命名/删除"，删除弹框二选一。见 Step 5）
- 导入覆盖/合并 + 覆盖前备份 .bak ✓

- [ ] **Step 5: 补充分类管理交互（侧栏右键）**

Modify `src/components/Sidebar.vue`：分类行 `@contextmenu.prevent="onCatMenu($event, c)"`，在侧栏底部固定一个 `ContextMenu` 复用于分类，action 映射：
- `rename` → `window.prompt('新名称')` → `store.renameCategory(id, name)`
- `delete` → 调 `window.confirm` 二选一文案，用两个按钮或 prompt 选择 → `store.deleteCategory(id, mode)`

- [ ] **Step 6: 视觉验收（对照 PRD 15.3）**

Check 色值/字号/间距/圆角/阴影/状态/动效（量化值见 Task 12 Step 2 清单）。

- [ ] **Step 7: 打包验证**

Run: `npm run tauri build`
Expected: 生成安装包（Windows MSI/NSIS）。若缺 NSIS，安装 `tauri-app` 依赖 `tauri-cli` 已由模板带入；产物在 `src-tauri/target/release/bundle/`。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/tauri.conf.json src/components/SiteTable.vue src/components/Sidebar.vue src/App.vue
git commit -m "feat: 验收补全（分类右键管理/悬停菜单/Esc 关闭）并配置打包"
```

---

## 执行顺序与依赖

```
Task 0 (环境+脚手架) → Task 1 (Rust 数据) → Task 2 (Rust 检测) → Task 3 (Rust md)
        → Task 4 (Rust 命令) → Task 5 (前端状态) → Task 6 (布局骨架) → Task 7 (CRUD)
        → Task 8 (表格交互) → Task 9 (弹窗) → Task 10 (检测+回收站) → Task 11 (移动/标签)
        → Task 12 (视觉) → Task 13 (断网) → Task 14 (验收+打包)
```

每任务完成后 `git commit`；所有 Rust 测试命令在 `src-tauri/` 下执行；前端测试命令在项目根执行。

## 风险与备注

- **Rust 未安装**：Task 0 Step 1 必须先行，否则整个 Rust 侧无法编译。Windows 需 MSVC 构建工具链（rustup 默认安装），若缺会提示安装 `Microsoft C++ Build Tools`。
- **reqwest TLS**：使用 `rustls-tls` 特性避免依赖系统 OpenSSL，Windows 更省心。
- **import_from_md 树构建**：Task 3 提供两套方案，验收标准固定，实现可替换。
- **invoke 参数映射**：Rust 命令 snake_case 参数经 Tauri 自动转 camelCase 传给前端，`api.ts` 中 `{ url }`/`{ data }`/`{ text, mode }` 与命令签名一一对应。
- **测试 mock**：前端 store 测试需 mock `../api` 的 Tauri invoke（Task 7 Step 4）。