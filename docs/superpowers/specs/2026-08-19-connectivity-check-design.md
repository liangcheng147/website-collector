# 可达性检测改进设计（浏览器头伪装 + 协议双试）

- 日期：2026-08-19
- 状态：已确认
- 关联：`src-tauri/src/check.rs`

## 背景与问题

「归集」的网站失效检测用 `reqwest` 对站点发 GET 请求，收到 200-399 判定 ok，否则判定 dead。实测发现大量**国内网站**存在误判：浏览器能正常打开，检测却标为失效。

**根因实证**（以 `http://www.51pptmoban.com` 为例）：

| 探测方式 | 结果 |
|---|---|
| reqwest 默认 UA（当前行为） | 403 → dead ❌ |
| Chrome UA + http | 301 重定向 |
| Chrome UA + https | 200 → ok ✅ |

结论：站点 WAF 对非浏览器请求头返回 403，导致误判。

## 需求

- 判定标准：**可达性验证**——网站能正常访问即 ok，不做内容级验证，不引入第三种状态
- 目标：解决国内站反爬 403 误判，同时覆盖仅支持 http 的旧站

## 设计（方案 A）

改动范围：仅 `src-tauri/src/check.rs`（及 `Cargo.toml` 加 brotli 特性）。

### 1. 浏览器头伪装

`client()` 构建 reqwest client 时设置：
- `User-Agent`: Chrome/126 完整 UA（`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36`）
- `Accept`
- `Accept-Language`: `zh-CN,zh;q=0.9,en;q=0.8`
- `Accept-Encoding`: `gzip, deflate, br`
- 启用 gzip/brotli 自动解压（`Cargo.toml` 的 `reqwest` 依赖补 `brotli` 特性）

超时 10s、重定向 10 次的策略保持不变。

### 2. 协议双试（http/https）

`check_site` 探测顺序：
1. 原 URL（`normalize_url` 默认补 `https://`）
2. 失败后补试另一协议（http → 补试 https；https → 补试 http）
3. 仍失败则降级测根域名（保留现有逻辑），同样双协议试
4. 全部失败 → dead

`normalize_url` / `root_url` 行为不变。

### 3. 判定标准不变

- 200-399 → `ok`
- 其余（404/403/5xx/网络错误/超时）→ `dead`

## 测试

- 保留现有 5 个单测（`normalize_adds_https`、`root_strips_path`、`root_on_bare_domain`、`falls_back_to_root_on_404`、`connectivity_false_on_bad_host`）
- 新增测试：本地 HTTP 服务器对非浏览器 UA 返回 403、对浏览器 UA 返回 200，验证伪装头生效、结果判定 ok
- 新增测试：仅 http 可达的站点（https 失败 → http 成功）判定 ok

## 风险与不变量

- brotli 特性增加少量编译体积，可接受
- 不改动状态分类、不引入 UI 改动、不改前端
- 该站 301 重定向到自身（http）再需 https 才 200 的情况，由"协议双试"覆盖