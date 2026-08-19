# 可达性检测改进（v2：403 即 ok + 根域名降级）

- 日期：2026-08-19
- 状态：已确认
- 关联：`src-tauri/src/check.rs`

## 问题背景

当前检测逻辑（浏览器头伪装 + http/https 双协议 + 根域名降级）仍有两类真实站点被误判为 dead：

1. **aigei.com**（403 + banip 软验证表单）：首访返回 403 验证页，浏览器执行 JS 自动提交表单后放行。curl 不执行 JS → 停在 403。
2. **hippopx.com**（Cloudflare 托管质询）：返回 403 `Cf-Mitigated: challenge`，需真实浏览器执行 JS 质询（Managed Challenge 自动过，Interactive Challenge 需人机验证）。

两站实测均为 HTTP 403，浏览器均可正常打开，但当前逻辑判 dead。

## 设计决策

**检测目标定义为「用户能看到内容、能正常使用」。** 用户确认接受以下推断：

> **「能弹出人机验证/质询 = 站点可用」**——服务器部署反爬说明内容存在，浏览器可过验证，判定 ok 是合理的推断。

### 核心判定表

| HTTP 响应 | 判定 | 理由 |
|---|---|---|
| 2xx / 3xx | **ok** | 内容直接可访问 |
| **403** | **ok** | 服务器活着 + 内容存在 + 浏览器可过反爬（推断） |
| 404 / 500 等其余非 2xx | **降级根域名再试** | 子路径可能失效，根域名可能正常 |
| 连接失败（DNS/超时/TLS/拒连） | **dead** | 服务器无响应 |

### 检测流程（伪代码）

```
check_site(url):
  candidates1 = [原URL双协议（https 优先，失败换 http）]
  遍历 candidates1:
    probe(candidate):
      连接成功 → 2xx/3xx → ok
      连接成功 → 403 → ok
      连接成功 → 其他状态码 → 记录，继续
      连接失败 → 继续
  若 root != 原URL:
    candidates2 = [根域名双协议]
    遍历 candidates2:
      同上判定
  → dead
```

### 关键行为

- **403 即 ok**，不再需要 body 识别（不匹配 cf_chl / banip 等特征）。
- **404/500 走根域名降级**（保留现有 `falls_back_to_root_on_404` 逻辑）。
- **保留**：浏览器头伪装、http/https 双协议、根域名降级、超时 10s、重定向 10 次、gzip/brotli。
- **不引入** WebView2 / wry / 无头浏览器，零新依赖。

## 全局约束

- 判定标准：任意 2xx/3xx 状态码 → ok；**403 → ok**（推断）；404/5xx 等其余非 2xx → 根域名降级；连接失败 → dead。**403 不在 2xx-3xx 范围内，是独立判定的特例。**
- `CheckResult { status, used_url }` 结构不变（camelCase 序列化）。
- 不改前端、commands.rs、tauri.conf.json。
- reqwest 保持 `version = "0.12"`，仅追加 gzip/brotli，不引入新 crate。

## 测试

- `falls_back_to_root_on_404`：保留（子页面 404 → 根域名 200 → ok）。
- 新增：`403_implies_ok`（服务器返回 403 → ok）。
- 新增：`root_also_404_is_dead`（子页面与根域名均 404 → dead）。
- 新增：`root_also_500_is_dead`（子页面与根域名均 500 → dead）。
- 新增：`http_only_site_falls_back_from_https`（保留）。

## 非目标

- 不做内容级验证（不检查页面标题/正文）。
- 不引入第三种状态（如 "unknown"）。
- 不检测"IP 真被封禁但服务器正常"的误判场景（推断接受）。
