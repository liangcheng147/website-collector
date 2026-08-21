# Markdown 导出改无序列表项格式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src-tauri/src/md.rs` 的 Markdown 导出格式从 Tab 单行改为无序列表项 `- [名称](网址) 状态`，并同步把导入解析改成只识别新格式（方案 B）。

**Architecture:** 仅改动 `md.rs` 内的三个函数——`site_line`（站点行格式）、`walk`（备注缩进）、`import_from_md`（列表项解析，新增 `parse_list_item` 辅助函数）。导出与导入各成一个任务，均按 TDD 红-绿-提交推进，现有测试更新到新格式。

**Tech Stack:** Rust（Tauri 2 后端），`cargo test` 单元测试。

## Global Constraints

- 仅修改 `src-tauri/src/md.rs`，不改动数据模型 / UI / 其它模块
- 采用方案 B：导入只识别新列表项格式，**不再兼容旧的 Tab 分隔格式**（旧 .md 文件需重新导出）
- 导出每个站点格式：`- [名称](网址) ✅ 2026-08-19T09:28:38.559Z`（无检测记录时只 `- [名称](网址)`）
- 备注放在条目下一行，缩进两格：`  > 备注`
- 分类标题 `#` / `##` 层级保持不变
- 验收：`cargo test` 全绿；导出 .md 在查看器中每站点独占一行、名称为可点击链接；导出的 .md 可重新导入且结构完整（状态重置 unknown）

---

## File Structure

- Modify: `src-tauri/src/md.rs`
  - `site_line` (md.rs:21)：站点行改为 `- [name](url)<mark>\n`
  - `walk` (md.rs:5)：备注行从 `> note` 改为 `  > note`
  - `import_from_md` (md.rs:34)：列表项解析替换原 Tab 解析分支
  - 新增模块级辅助函数 `parse_list_item(body: &str) -> Option<(String, String)>`
  - 测试模块 (md.rs:106+)：更新 4 条用例到新格式

---

### Task 1: 导出改为无序列表项格式

**Files:**
- Modify: `src-tauri/src/md.rs:21` (`site_line`)、`md.rs:10-11` (`walk` 备注行)
- Test: `src-tauri/src/md.rs:111` (`export_roundtrip_preserves_structure`)、`md.rs:148` (`export_sanitizes_note_tabs_and_newlines`)

**Interfaces:**
- 消费：无（仅改 `site_line` 返回格式与 `walk` 备注缩进）
- 产出：`export_to_md` 输出新格式字符串，供 Task 2 导入解析与现有测试断言

- [ ] **Step 1: 把导出相关测试改成新格式断言（先红）**

将 `export_roundtrip_preserves_structure` 中两行断言改为：

```rust
        assert!(md.contains("- [React](https://react.dev) ✅ 2026-08-15"));
        assert!(md.contains("  > React 官方文档与教程站"));
```

将 `export_sanitizes_note_tabs_and_newlines` 中备注断言改为：

```rust
        assert!(md.contains("  > 多 列 换行 备注"));
```

（保留 `assert!(!md.contains("> 多\t列"), "备注中的 tab 已被替换为空格");`）

- [ ] **Step 2: 运行测试确认变红**

Run: `cd E:\桌面\tem\demo-url\src-tauri; cargo test export_roundtrip_preserves_structure export_sanitizes_note_tabs_and_newlines`
Expected: FAIL（`md.contains("React\thttps://react.dev\t✅ 2026-08-15")` 等旧断言不再成立 / 新断言不满足）

- [ ] **Step 3: 实现最小改动（转绿）**

修改 `site_line` (md.rs:21) 为：

```rust
fn site_line(s: &Site) -> String {
    let mark = match (s.status.as_str(), &s.last_check) {
        ("ok", Some(d)) => format!(" ✅ {}", d),
        ("dead", Some(d)) => format!(" ❌ {}", d),
        _ => String::new(),
    };
    format!("- [{}]({}){}\n", s.name, s.url, mark)
}
```

修改 `walk` 中备注行 (md.rs:10-11) 为：

```rust
                if !note.is_empty() { out.push_str(&format!("  > {}\n", note)); }
```

- [ ] **Step 4: 运行测试确认转绿**

Run: `cd E:\桌面\tem\demo-url\src-tauri; cargo test export`
Expected: PASS（md 模块全部 export 用例通过）

- [ ] **Step 5: 提交**

```bash
cd E:\桌面\tem\demo-url
git add src-tauri/src/md.rs
git commit -m "feat: Markdown 导出改为无序列表项格式 - [名称](网址) 状态"
```

---

### Task 2: 导入解析改为只识别新列表项格式（方案 B）

**Files:**
- Modify: `src-tauri/src/md.rs:34` (`import_from_md` 站点行解析分支)、新增 `parse_list_item` 辅助函数
- Test: `src-tauri/src/md.rs:135` (`import_ignores_status_and_tags`)、`md.rs:165` (`import_note_binding_stops_at_heading`)

**Interfaces:**
- 消费：Task 1 已落地的 `export_to_md` 新格式（本任务让导入能解析它）
- 产出：`import_from_md` 返回 `AppData`，结构/备注绑定与现有一致（status 重置 unknown）

- [ ] **Step 1: 把导入相关测试改成新格式文本（先红）**

将 `import_ignores_status_and_tags` 的 `text` 改为：

```rust
        let text = "# 开发工具\n## 前端\n- [React](https://react.dev) ✅ 2026-08-15\n> React 官方文档与教程站\n- [Vue](https://vuejs.org) ❌ 2026-08-15\n";
```

将 `import_note_binding_stops_at_heading` 的 `text` 改为：

```rust
        let text = "# 开发\n- [A](https://a.dev)\n> A 的备注\n# 资讯\n> 游离备注不应被读入\n- [B](https://b.dev)\n";
```

- [ ] **Step 2: 运行测试确认变红**

Run: `cd E:\桌面\tem\demo-url\src-tauri; cargo test import_ignores_status_and_tags import_note_binding_stops_at_heading`
Expected: FAIL（旧 Tab 文本不再被解析为站点 → sites 数量/备注不满足断言）

- [ ] **Step 3: 实现最小改动（转绿）**

在 `md.rs` 模块级（`site_line` 之后）新增辅助函数：

```rust
fn parse_list_item(body: &str) -> Option<(String, String)> {
    if let Some(open) = body.find('[') {
        if let Some(rel) = body[open..].find("](") {
            let close = open + rel;
            let name = body[open + 1..close].trim().to_string();
            let rest = &body[close + 2..];
            if let Some(end) = rest.find(')') {
                let url = rest[..end].trim().to_string();
                return Some((name, url));
            }
        }
    }
    Some((body.to_string(), String::new()))
}
```

将 `import_from_md` 中原来的 Tab 解析分支 (md.rs:55 起)：

```rust
        } else if let Some((name, rest)) = line.split_once('\t') {
            let name = name.trim().to_string();
            let url = rest.split('\t').next().unwrap_or("").trim().to_string();
            if !url.is_empty() {
```

替换为列表项解析分支：

```rust
        } else if let Some(body) = line.strip_prefix(['-', '*', '+']).map(|b| b.trim()) {
            if let Some((name, url)) = parse_list_item(body) {
                if !url.is_empty() {
```

（`name` / `url` / `category_id` / `sites.push(...)` 等后续代码保持不变。）

- [ ] **Step 4: 运行测试确认转绿**

Run: `cd E:\桌面\tem\demo-url\src-tauri; cargo test`
Expected: PASS（md 模块全部用例通过，含往返）

- [ ] **Step 5: 提交**

```bash
cd E:\桌面\tem\demo-url
git add src-tauri/src/md.rs
git commit -m "feat: Markdown 导入只识别新的无序列表项格式（方案 B）"
```

---

## 自审对照（已通过）

- Spec 覆盖：导出格式 ✅ Task1；导入方案 B ✅ Task2；备注缩进两格 ✅ Task1；测试更新 ✅ 两任务；验收 cargo test ✅ Task2 Step4
- 无占位符：所有步骤含实际代码/命令
- 类型一致：`parse_list_item` 签名 `(body: &str) -> Option<(String, String)>` 在 Task2 Step3 定义、Step3 使用一致；`site_line` / `walk` 改动与 Task1 测试断言一致
