# 可达性检测改进 v2 实现计划（403 即 ok + 根域名降级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让检测逻辑把 403 反爬响应判定为 ok（推断可用），并验证 404/500 走根域名降级后 dead 的回归测试。

**Architecture:** 只改 `src-tauri/src/check.rs` 的 `classify` 一行——加入 `|| status == 403`。现有 `check_site` 遍历候选直到 `status == "ok"` 的结构已经实现"404/500 → 继续探测根域名"的降级，无需改动。新增 3 个测试覆盖 403→ok、根域名也 404→dead、根域名也 500→dead。

**Tech Stack:** Rust, reqwest 0.12（gzip/brotli）, tokio（测试运行时）, 原生 `std::net::TcpListener` 本地 mock 服务器。

## Global Constraints

- 判定标准：任意 2xx/3xx 状态码 → ok；**403 → ok**（推断）；404/5xx 等其余非 2xx → 根域名降级；连接失败 → dead。**403 不在 2xx-3xx 范围内，是独立判定的特例。**
- `CheckResult { status: String, used_url: String }` 结构不变（`#[serde(rename_all = "camelCase")]`）。
- 不改前端、`commands.rs`、`tauri.conf.json`。
- reqwest 保持 `version = "0.12"`（features 含 `json`, `rustls-tls`, `gzip`, `brotli`），不引入新 crate。
- 不引入 WebView2 / wry / 无头浏览器，零新依赖。
- 保留：浏览器头伪装（BROWSER_UA + Accept/Accept-Language/Accept-Encoding）、http/https 双协议、根域名降级、超时 10s、重定向 10 次、gzip/brotli。
- 现有 5 个测试必须全部继续通过（`falls_back_to_root_on_404`, `browser_ua_bypasses_403_waf`, `http_only_site_falls_back_from_https`, `connectivity_false_on_bad_host`, `normalize_adds_https`, `root_strips_path`, `root_on_bare_domain`）。

---

### Task 1: classify 支持 403 → ok

**Files:**
- Modify: `src-tauri/src/check.rs:44-46`（`classify` 函数体）
- Test: `src-tauri/src/check.rs`（tests 模块内新增 `forbidden_challenge_implies_ok`）

**Interfaces:**
- Consumes: `client()`（已有，返回 `reqwest::Client`，带浏览器头 + gzip/brotli + 10s 超时 + 10 重定向）；`variants(url)`（已有，返回 `Vec<String>` 双协议候选）；`normalize_url(raw)`（已有，无协议时补 `https://`）
- Produces: `classify(status: u16) -> &'static str`——现在 `403` 也返回 `"ok"`，供 `check_site` 使用

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/check.rs` 的 tests 模块内（`browser_ua_bypasses_403_waf` 之后）新增：

```rust
#[test]
fn forbidden_challenge_implies_ok() {
    // 服务器对所有请求返回 403（反爬质询页），浏览器可过 → 应判 ok（推断）
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        for _ in 0..4 {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                let resp = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(resp.as_bytes());
            }
        }
    });
    let url = format!("http://{}/", addr);
    let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
        check_site(&url).await
    });
    assert_eq!(res.status, "ok");
    assert_eq!(res.used_url, format!("http://{}/", addr));
}
```

注意：`used_url` 断言依赖 `variants` 生成的第一个候选是原 URL 本身（`http://{addr}/`），探测 403 → ok 后 `check_site` 立即返回该候选。

- [ ] **Step 2: 运行测试验证它失败**

Run: `cd src-tauri && cargo test forbidden_challenge_implies_ok`
Expected: FAIL——断言 `res.status == "ok"` 失败（当前 `classify(403)` 返回 `"dead"`）

- [ ] **Step 3: 修改 classify**

`src-tauri/src/check.rs` 第 44-46 行：

```rust
fn classify(status: u16) -> &'static str {
    if (200..400).contains(&status) || status == 403 { "ok" } else { "dead" }
}
```

唯一改动：`|| status == 403`。

- [ ] **Step 4: 运行测试验证通过**

Run: `cd src-tauri && cargo test`
Expected: PASS——新增 `forbidden_challenge_implies_ok` 通过；现有测试全部通过。特别确认 `browser_ua_bypasses_403_waf`（服务器对非浏览器 UA 返回 403、浏览器 UA 返回 200）仍通过——其服务器逻辑对浏览器 UA 返回 200，走的是 200→ok 路径，不受影响。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/check.rs
git commit -m "feat: 403 反爬响应判定为 ok（推断站点可用）"
```

---

### Task 2: 根域名也 404/500 → dead 回归测试

**Files:**
- Test: `src-tauri/src/check.rs`（tests 模块内新增 `root_also_404_is_dead` 与 `root_also_500_is_dead`）

**Interfaces:**
- Consumes: `check_site(url)`（Task 1 完成版，403→ok；非 ok 结果被忽略并继续探测，根域名降级由 `root != full` 分支实现）
- Produces: 两个回归测试，锁定"子页面与根域名都返回错误 → dead"的语义

- [ ] **Step 1: 写测试**

在 tests 模块内新增两个测试：

```rust
#[test]
fn root_also_404_is_dead() {
    // 子页面和根域名都返回 404 → 应判 dead
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        for _ in 0..4 {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(resp.as_bytes());
            }
        }
    });
    let url = format!("http://{}/sub", addr);
    let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
        check_site(&url).await
    });
    assert_eq!(res.status, "dead");
}

#[test]
fn root_also_500_is_dead() {
    // 子页面和根域名都返回 500 → 应判 dead
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        for _ in 0..4 {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                let resp = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                let _ = stream.write_all(resp.as_bytes());
            }
        }
    });
    let url = format!("http://{}/sub", addr);
    let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
        check_site(&url).await
    });
    assert_eq!(res.status, "dead");
}
```

测试原理：`check_site("http://{addr}/sub")` 会依次探测 `http://{addr}/sub`（→404）、`https://{addr}/sub`（TLS 握手收到明文 HTTP 响应 → 连接失败，`probe` 返回 `None`）、根域名 `http://{addr}`（→404）、`https://{addr}`（同上失败），全部非 ok → 返回 dead。4 次 accept 覆盖全部探测连接。

- [ ] **Step 2: 运行测试验证通过**

Run: `cd src-tauri && cargo test`
Expected: PASS——这两个测试在现有逻辑下应直接通过（降级结构已存在），它们是语义锁定回归测试。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/check.rs
git commit -m "test: 锁定子页面与根域名均 404/500 → dead 的降级语义"
```

---

### Task 3: 真实站点验证与收尾

**Files:**
- 无代码改动（验证性任务）
- Modify: `docs/superpowers/specs/2026-08-19-connectivity-check-design.md`（状态行）

**Interfaces:**
- Consumes: `check_site`（Task 1+2 完成版）

- [ ] **Step 1: 运行全量测试**

```bash
cd src-tauri && cargo test
npm test
```

Expected: cargo 全部通过（含 8 个检测测试 + 既有工具函数测试）；npm 前端测试 47 个全部通过。

- [ ] **Step 2: 真实网站验证（开发者手动，GUI）**

Run: `npm run tauri dev`，对 `https://www.aigei.com` 和 `https://www.hippopx.com` 检测。
Expected: 两者均显示 **ok**（之前为 dead）。

- [ ] **Step 3: 更新规格文档状态**

在 `docs/superpowers/specs/2026-08-19-connectivity-check-design.md` 顶部把 `- 状态：已确认` 改为 `- 状态：已实现`：

```bash
git add docs/superpowers/specs/2026-08-19-connectivity-check-design.md
git commit -m "docs: 标记检测改进已实现"
```

---

## Self-Review

- **Spec coverage:** 核心判定表（2xx/3xx→ok、403→ok、404/500→降级、连接失败→dead）→ Task 1 classify 改动 + Task 2 两个降级回归测试覆盖；保留项（浏览器头/双协议/降级/超时/重定向/gzip/brotli）→ 未触碰，Global Constraints 逐条列出；测试清单（`403_implies_ok`、`root_also_404_is_dead`、`root_also_500_is_dead`、保留 `falls_back_to_root_on_404`/`http_only_site_falls_back_from_https`）→ Task 1 Step 1 与 Task 2 Step 1 全覆盖；非目标（不引入 WebView2/新 crate）→ Global Constraints 约束。
- **Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整代码与预期输出。
- **Type consistency:** `classify(u16) -> &'static str`、`check_site(&str) -> CheckResult`、`variants(&str) -> Vec<String>`、`normalize_url(&str) -> String` 各任务引用签名一致；`CheckResult { status, used_url }` camelCase 不变。Task 2 测试的 `check_site` 使用 Task 1 后的行为（403→ok），两者兼容——Task 2 的 404/500 场景不受 403 改动影响。
- **职责边界:** 单文件 `check.rs` 改动保持一处聚焦（`classify`），测试内联在既有 tests 模块，符合现有模式。
