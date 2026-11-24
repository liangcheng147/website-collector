use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult { pub status: String, pub used_url: String }

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

pub fn normalize_url(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with("http://") || t.starts_with("https://") { t.to_string() } else { format!("https://{}", t) }
}

pub fn root_url(raw: &str) -> String {
    let u = normalize_url(raw);
    let parsed = url::Url::parse(&u).unwrap_or_else(|_| url::Url::parse("https://invalid").unwrap());
    let mut b = parsed.clone();
    b.set_path("");
    b.set_query(None);
    b.set_fragment(None);
    b.to_string().trim_end_matches('/').to_string()
}

fn classify(status: u16) -> &'static str {
    if (200..400).contains(&status) || status == 403 { "ok" } else { "dead" }
}

async fn probe(c: &reqwest::Client, url: &str) -> Option<CheckResult> {
    let resp = c.get(url).send().await.ok()?;
    Some(CheckResult { status: classify(resp.status().as_u16()).to_string(), used_url: url.to_string() })
}

pub async fn check_connectivity() -> bool {
    let c = reqwest::Client::builder().timeout(Duration::from_secs(5)).build().unwrap_or_default();
    c.get("https://example.com").send().await.is_ok()
}

pub(crate) fn variants(url: &str) -> Vec<String> {
    let full = normalize_url(url);
    let mut v = vec![full.clone()];
    if let Ok(u) = url::Url::parse(&full) {
        let alt = if u.scheme() == "http" {
            format!("https://{}", &u[url::Position::BeforeHost..])
        } else {
            format!("http://{}", &u[url::Position::BeforeHost..])
        };
        if !v.contains(&alt) { v.push(alt); }
    }
    v
}

const RETRY_DELAY: Duration = Duration::from_secs(1);

async fn check_site_attempt(url: &str) -> CheckResult {
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

pub async fn fetch_site_title(url: &str) -> Result<String, String> {
    let c = client();
    let full = normalize_url(url);
    let resp = c.get(&full).send().await.map_err(|e| e.to_string())?;
    let body = resp.text().await.map_err(|e| e.to_string())?;

    let lower = body.to_lowercase();
    let title_start = lower.find("<title>").ok_or("no title tag")? + 7;
    let title_end = lower.find("</title>").ok_or("no closing title")?;
    let raw = &body[title_start..title_end];

    let cleaned = raw.trim().replace('\n', " ").replace('\r', "");
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = html_decode_simple(&cleaned);

    if cleaned.is_empty() || cleaned.to_lowercase() == "loading..." {
        let domain = url::Url::parse(&full)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_string()))
            .unwrap_or_else(|| full.clone());
        return Ok(domain);
    }

    Ok(cleaned)
}

pub(crate) fn html_decode_simple(input: &str) -> String {
    input.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

/// 批量检测结果：在单站结果外带上请求 URL，便于调用方按 URL 回填站点。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SiteCheckResult { pub url: String, pub status: String, pub used_url: String }

/// 失败后在 `retry_count` 次额外重试；每次重试前短暂退避。
async fn check_site_with_retries(url: &str, retry_count: u32) -> CheckResult {
    let mut r = check_site_attempt(url).await;
    for _ in 0..retry_count {
        if r.status != "dead" { break; }
        tokio::time::sleep(RETRY_DELAY).await;
        r = check_site_attempt(url).await;
    }
    r
}

pub async fn check_site(url: &str) -> CheckResult {
    // 保持既有语义：失败后再试一次。
    check_site_with_retries(url, 1).await
}

/// 在 `concurrency` 上限内批量检测，失败项按 `retry_count` 额外重试。
/// 返回顺序与输入一致；调用方需先自行确认在线（见 check_connectivity）。
pub async fn check_sites(urls: &[String], retry_count: u32, concurrency: usize) -> Vec<SiteCheckResult> {
    let limit = concurrency.max(1);
    let mut results: Vec<Option<SiteCheckResult>> = urls.iter().map(|_| None).collect();
    let mut start = 0usize;
    while start < urls.len() {
        let end = (start + limit).min(urls.len());
        let mut handles = Vec::with_capacity(end - start);
        for i in start..end {
            let url = urls[i].clone();
            handles.push(tokio::spawn(async move {
                let r = check_site_with_retries(&url, retry_count).await;
                (i, r)
            }));
        }
        for h in handles {
            if let Ok((i, r)) = h.await {
                results[i] = Some(SiteCheckResult { url: urls[i].clone(), status: r.status, used_url: r.used_url });
            }
        }
        start = end;
    }
    results.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

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
    fn falls_back_to_root_on_404() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            // 双协议探测：可能先收到 https(TLS) 连接（用 read 而非 read_line 避免阻塞），
            // 依次可能为 http/sub、https/sub、http 根、https 根，最多 4 次连接
            for _ in 0..4 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]);
                    let not_found = text.contains("/sub");
                    let (status, body) = if not_found { ("404 Not Found", "not found") } else { ("200 OK", "ok") };
                    let resp = format!(
                        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status, body.len(), body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                }
            }
        });
        let url = format!("http://{}/sub", addr);
        let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
            check_site(&url).await
        });
        assert_eq!(res.status, "ok");
        assert_eq!(res.used_url, format!("http://{}", addr));
    }

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
                let mut ua = String::new();
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 { break; }
                    if line.trim().is_empty() { break; }
                    if line.to_ascii_lowercase().starts_with("user-agent:") {
                        ua = line.split_once(':').map(|(_, v)| v.trim().to_string()).unwrap_or_default();
                    }
                }
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

    #[test]
    fn http_only_site_falls_back_from_https() {
        // 服务器只监听 http（无 TLS），https 探测必然失败 → 应回退 http 成功并判定 ok
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            // 第一次连接是 https(TLS) 探测，读到 ClientHello 后回 HTTP 响应即可让其失败；
            // 第二次是 http 探测，返回 200 OK
            for _ in 0..2 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let _ = stream.read(&mut buf);
                    let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
                }
            }
        });
        // 用 https 形式请求 127.0.0.1（服务器不监听 TLS，https 必然失败），应回退 http 成功
        let https_url = format!("https://{}/", addr);
        let res = tokio::runtime::Runtime::new().unwrap().block_on(async { check_site(&https_url).await });
        assert_eq!(res.status, "ok");
        assert_eq!(res.used_url, format!("http://{}/", addr));
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

    #[test]
    fn fetch_title_extracts_title_tag() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                let body = "<html><head><title>My Site &amp; Co</title></head><body></body></html>";
                let resp = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                let _ = stream.write_all(resp.as_bytes());
            }
        });
        let url = format!("http://{}/", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let title = rt.block_on(super::fetch_site_title(&url)).unwrap();
        assert_eq!(title, "My Site & Co");
    }

    /// 本地测试服务器：第 n 次连接返回 responses[n]（超出后重复最后一项），可配置每连接延迟。
    fn spawn_test_server(
        responses: Vec<&'static str>,
        delay: Duration,
        max_conn: usize,
    ) -> (String, Arc<AtomicUsize>, Arc<AtomicUsize>, Arc<AtomicUsize>) {
        let responses = Arc::new(Mutex::new(responses));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        let idx = Arc::new(AtomicUsize::new(0));
        let active = Arc::new(AtomicUsize::new(0));
        let max_active = Arc::new(AtomicUsize::new(0));
        let idx2 = idx.clone();
        let active2 = active.clone();
        let max2 = max_active.clone();
        let responses2 = responses.clone();
        std::thread::spawn(move || {
            for _ in 0..max_conn {
                let Ok((stream, _)) = listener.accept() else { break };
                let idx = idx2.clone();
                let active = active2.clone();
                let max = max2.clone();
                let responses = responses2.clone();
                std::thread::spawn(move || {
                    use std::io::{Read, Write};
                    let mut stream = stream;
                    let mut buf = [0u8; 4096];
                    let _ = stream.read(&mut buf);
                    let n = idx.fetch_add(1, Ordering::SeqCst);
                    let list = responses.lock().unwrap();
                    let status = list[n.min(list.len() - 1)];
                    let cur = active.fetch_add(1, Ordering::SeqCst) + 1;
                    max.fetch_max(cur, Ordering::SeqCst);
                    drop(list);
                    std::thread::sleep(delay);
                    active.fetch_sub(1, Ordering::SeqCst);
                    let resp = format!(
                        "HTTP/1.1 {}\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                        status
                    );
                    let _ = stream.write_all(resp.as_bytes());
                });
            }
        });
        (addr, idx, active, max_active)
    }

    #[test]
    fn check_sites_without_retry_stays_dead() {
        let (addr, _idx, _active, _max) =
            spawn_test_server(vec!["404 Not Found"], Duration::from_millis(1), 8);
        let url = format!("http://{}/", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let results = rt.block_on(async { check_sites(&[url.clone()], 0, 1).await });
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].url, url);
        assert_eq!(results[0].status, "dead");
    }

    #[test]
    fn check_sites_retries_until_success() {
        // 首次完整尝试会产生 4 个连接（http/https × 原路径/根），第 5 个连接成功 → retry_count=1 应恢复
        let (addr, _idx, _active, _max) = spawn_test_server(
            vec!["404 Not Found", "404 Not Found", "404 Not Found", "404 Not Found", "200 OK"],
            Duration::from_millis(1),
            8,
        );
        let url = format!("http://{}/", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let results = rt.block_on(async { check_sites(&[url.clone()], 1, 1).await });
        assert_eq!(results[0].status, "ok");
        // 重试轮首次探测原 URL（带尾斜杠）即成功，used_url 保留实际生效地址
        assert_eq!(results[0].used_url, url);
    }

    #[test]
    fn check_sites_caps_concurrency() {
        let (addr, _idx, _active, max_active) =
            spawn_test_server(vec!["200 OK"], Duration::from_millis(120), 8);
        let url_a = format!("http://{}/a", addr);
        let url_b = format!("http://{}/b", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();

        let results = rt.block_on(check_sites(&[url_a.clone(), url_b.clone()], 0, 1));
        assert_eq!(results.len(), 2);
        assert_eq!(max_active.load(Ordering::SeqCst), 1, "concurrency=1 必须串行");

        max_active.store(0, Ordering::SeqCst);
        let results = rt.block_on(check_sites(&[url_a.clone(), url_b.clone()], 0, 2));
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].url, url_a);
        assert_eq!(results[1].url, url_b);
        assert_eq!(
            max_active.load(Ordering::SeqCst),
            2,
            "concurrency=2 应允许两个站点同时探测"
        );
    }

    #[test]
    fn retries_after_transient_failure() {
        // 第一次探测全部失败（临时故障），1 秒后自动重试成功 → 应判 ok
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            // 第 1 次连接（首次尝试 http）→ 404；第 2 次（首次尝试 https）→ 404（TLS 读到明文 → 失败）；
            // 第 3 次（重试 http）→ 200。
            let mut n = 0;
            for _ in 0..3 {
                if let Ok((mut stream, _)) = listener.accept() {
                    n += 1;
                    let mut buf = [0u8; 4096];
                    let _ = stream.read(&mut buf);
                    let (status, body) = if n >= 3 { ("200 OK", "ok") } else { ("404 Not Found", "nf") };
                    let resp = format!(
                        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status, body.len(), body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                }
            }
        });
        let url = format!("http://{}", addr);
        let res = tokio::runtime::Runtime::new().unwrap().block_on(async {
            check_site(&url).await
        });
        assert_eq!(res.status, "ok");
    }
}