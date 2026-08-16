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
    b.to_string().trim_end_matches('/').to_string()
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
    fn falls_back_to_root_on_404() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            use std::io::{BufRead, Write};
            for _ in 0..2 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
                    let mut line = String::new();
                    let _ = reader.read_line(&mut line);
                    let not_found = line.contains("/sub");
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