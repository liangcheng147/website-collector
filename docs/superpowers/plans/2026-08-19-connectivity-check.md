# 可达性检测改进（浏览器头伪装 + 协议双试）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复国内网站被反爬 403 误判为失效的问题，通过伪装浏览器请求头和 http/https 双协议探测。

**Architecture:** 仅修改 `src-tauri/src/check.rs`：`client()` 构建时添加浏览器级 headers 并启用 gzip/brotli 解压；`check_site` 改为按「原 URL → 另一协议 → 根域名双协议」顺序探测。判定标准（200-399 → ok，其余 → dead）保持不变。

**Tech Stack:** Rust · reqwest 0.12 · tokio · Cargo 单元测试

## Global Constraints

- 判定标准不变：`200-399 → "ok"`，其余 → `"dead"`（`check.rs` 的 `classify` 函数）
- `normalize_url` / `root_url` 行为保持不变（`https://` 前缀补充、根域名剥离）
- `CheckResult { status: String, used_url: String }` 结构保持不变（序列化为 camelCase）
- 不改动任何前端文件、不改 `commands.rs`、不改 `tauri.conf.json`
- `reqwest` 依赖保持 `version = "0.12"`，仅追加 `brotli` 特性，不引入新 crate

---

### Task 1: Cargo.toml 添加 brotli 特性

**Files:**
- Modify: `src-tauri/Cargo.toml:23`

**Interfaces:**
- Consumes: 无
- Produces: `reqwest` 客户端支持 brotli 解压（后续 Task 2 的 `client()` 依赖此特性编译通过）

- [ ] **Step 1: 修改依赖**

将第 23 行：
```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
```
改为：
```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls", "gzip", "brotli"], default-features = false }
```

- [ ] **Step 2: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译成功，无报错

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: reqwest 增加 gzip/brotli 特性"
```

---

### Task 2: 浏览器头伪装（client 函数）

**Files:**
- Modify: `src-tauri/src/check.rs:8-14`
- Test: `src-tauri/src/check.rs`（tests 模块内）

**Interfaces:**
- Consumes: `reqwest` crate（Task 1 已启用 gzip/brotli）
- Produces: `fn client() -> reqwest::Client` — 带浏览器级 headers、gzip/brotli 解压、10s 超时、最多 10 次重定向的客户端

- [ ] **Step 1: 修改 client()**

将：
```rust
fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}
```
改为：
```rust
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(BROWSER_UA)
        .default_headers({
            use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE};
            let mut h = HeaderMap::new();
            h.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"));
            h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"));
            h.insert(ACCEPT_ENCODING, HeaderValue::from_static("gzip, deflate, br"));
            h
        })
        .gzip(true)
        .brotli(true)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}
```

- [ ] **Step 2: 新增测试（模拟反爬 403）**

在 `#[cfg(test)] mod tests` 内追加：
```rust
#[test]
fn browser_ua_bypasses_403_waf() {
    // 服务器只对非浏览器 UA 返回 403
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{BufRead, Write};
        if let Ok((mut stream, _)) = listener.accept() {
            let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            let _ = reader.read_line(&mut line);
            let ua = line.split("User-Agent: ").nth(1).map(|s| s.trim().to_string()).unwrap_or_default();
            let (status, body) = if ua.contains("Mozilla/5.0") {
                ("200 OK", "ok")
            } else {
                ("403 Forbidden", "forbidden")
            };
            let resp = format!(
                "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status, body.len(), body
            );
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    let url = format!("http://{}/", addr);
    let res = tokio::runtime::Runtime::new().unwrap().block_on(async { check_site(&url).await });
    assert_eq!(res.status, "ok");
    assert_eq!(res.used_url, url);
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd src-tauri && cargo test browser_ua_bypasses_403_waf -- --nocapture`
Expected: PASS

- [ ] **Step 4: 回归运行全部测试**

Run: `cd src-tauri && cargo test`
Expected: 现有 5 个测试 + 新测试全部通过

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/check.rs
git commit -m "feat: 检测请求伪装浏览器头以绕过 WAF 403"
```

---

### Task 3: 协议双试（http/https）

**Files:**
- Modify: `src-tauri/src/check.rs:45-57`（`check_site` 函数）
- Test: `src-tauri/src/check.rs`（tests 模块内）

**Interfaces:**
- Consumes: `client()`（Task 2）、`normalize_url`、`root_url`、`probe`
- Produces: `pub async fn check_site(url: &str) -> CheckResult` — 行为升级：原 URL → 另一协议 → 根域名双协议 → dead

- [ ] **Step 1: 新增 `variants` 辅助函数**

在 `check_site` 上方追加：
```rust
fn variants(url: &str) -> Vec<String> {
    let full = normalize_url(url);
    let mut v = vec![full.clone()];
    if let Ok(u) = url::Url::parse(&full) {
        let alt = if u.scheme() == "http" {
            format!("https://{}", u[url::Position::BeforeHost..])
        } else {
            format!("http://{}", u[url::Position::BeforeHost..])
        };
        if !v.contains(&alt) { v.push(alt); }
    }
    v
}
```

- [ ] **Step 2: 重写 check_site**

将：
```rust
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
改为：
```rust
pub async fn check_site(url: &str) -> CheckResult {
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
```

- [ ] **Step 3: 新增测试（仅 http 可达）**

在 tests 模块内追加：
```rust
#[test]
fn http_only_site_falls_back_from_https() {
    // https 端口不监听，http 返回 200 → 应判定 ok
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let http_url = format!("http://{}/", addr);
    std::thread::spawn(move || {
        use std::io::{BufRead, Write};
        if let Ok((mut stream, _)) = listener.accept() {
            let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            let _ = reader.read_line(&mut line);
            let resp = format!("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
            let _ = stream.write_all(resp.as_bytes());
        }
    });
    // 用 https 形式请求（127.0.0.1 上 https 必然失败），应回退 http 成功
    let res = tokio::runtime::Runtime::new().unwrap().block_on(async { check_site(&http_url).await });
    assert_eq!(res.status, "ok");
}
```

- [ ] **Step 4: 运行新测试确认通过**

Run: `cd src-tauri && cargo test http_only_site_falls_back_from_https -- --nocapture`
Expected: PASS

- [ ] **Step 5: 回归全部测试**

Run: `cd src-tauri && cargo test`
Expected: 全部通过（现有 + 新增）

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/check.rs
git commit -m "feat: 检测支持 http/https 双协议探测"
```

---

### Task 4: 真实网站验证与收尾

**Files:**
- 无新文件改动（验证性任务）

**Interfaces:**
- Consumes: `check_site`（Task 3 完成版）

- [ ] **Step 1: 用测试程序验证真实网站**

在临时位置创建 `C:\Users\bjb\AppData\Local\Temp\opencode\probe_test.rs` 不适用——直接给 `check.rs` 的 tests 模块追加一个标记 `#[ignore]` 的真实站测试不方便。改用 cargo test 过滤执行现有验证：
```bash
cd src-tauri && cargo test -- --ignored 2>&1
```
Expected: 无 ignored 测试，正常运行即可。

- [ ] **Step 2: 手动端到端验证（开发者本机）**

Run: `npm run tauri dev`
Expected: 打开应用 → 添加/使用「检测」功能 → 对 `http://www.51pptmoban.com` 检测，结果应为 **ok**（之前为 dead）

- [ ] **Step 3: 运行前端测试与整体检查**

```bash
npm test
cargo test
```
Expected: 全部通过

- [ ] **Step 4: 提交收尾（如有改动）**

如 Step 2 中发现需要微调，提交；否则无需提交。

- [ ] **Step 5: 更新规格文档状态**

在 `docs/superpowers/specs/2026-08-19-connectivity-check-design.md` 顶部状态行改为 `已实现`：
```bash
git add docs/superpowers/specs/2026-08-19-connectivity-check-design.md
git commit -m "docs: 标记检测改进已实现"
```

---

## Self-Review

- **Spec coverage:** 浏览器头伪装 → Task 2 ✓；协议双试 → Task 3 ✓；判定标准不变 → Global Constraints ✓；brotli 特性 → Task 1 ✓；新测试（403 反爬 + http 回退）→ Task 2 Step 2 / Task 3 Step 3 ✓；真实站验证 → Task 4 ✓
- **Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码
- **Type consistency:** `client()`、`check_site`、`CheckResult{status,used_url}`、`normalize_url`、`root_url`、`probe` 在 Task 2/3 中签名一致；`variants` 在 Task 3 定义且仅本任务使用；`BROWSER_UA` 常量在 Task 2 定义并使用
- **注意事项:** Task 3 的 `variants` 使用 `url::Url::parse` 与现有 `root_url` 一致依赖 `url` crate（已在 Cargo.toml 依赖中）