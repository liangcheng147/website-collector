//! favicon 抓取、缓存与读取。
//!
//! 抓取页面 HTML，解析 `<link rel="icon">`（缺失时回退 `/favicon.ico`），
//! 下载到数据目录的 `favicons/` 下并按内容识别图片类型。所有失败均静默返回
//! `None`，不阻塞调用方。前端通过 `read_favicon_data_url` 把缓存文件读成
//! base64 data URL，避免依赖 Tauri asset 协议。

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FaviconResult {
    pub favicon_path: String,
}

const MAX_FAVICON_BYTES: usize = 2 * 1024 * 1024;
const MAX_PAGE_BYTES: usize = 1024 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

pub fn favicon_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("favicons")
}

/// Windows 文件系统路径大小写不敏感；其他平台保持精确语义。
#[cfg(windows)]
fn os_eq(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
}

#[cfg(not(windows))]
fn os_eq(a: &std::ffi::OsStr, b: &std::ffi::OsStr) -> bool {
    a == b
}

/// 逐组件判断 `candidate` 是否位于 `base` 之内（含相等）。
/// 不用字符串前缀，避免 `/data/favicons-evil` 被误判为在 `/data/favicons` 内。
pub(crate) fn path_is_within(base: &Path, candidate: &Path) -> bool {
    let mut base_components = base.components();
    for component in candidate.components() {
        match base_components.next() {
            Some(expected) => {
                if !os_eq(expected.as_os_str(), component.as_os_str()) {
                    return false;
                }
            }
            None => return true,
        }
    }
    base_components.next().is_none()
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(BROWSER_UA)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// FNV-1a 64 位哈希，稳定且无需额外依赖；用于把图标 URL 映射为缓存文件名。
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// 在 ASCII 小写副本中定位标签，从原文切片以保留 href 的大小写。
fn find_tags(html: &str, lower: &str, tag: &str) -> Vec<String> {
    let needle = format!("<{}", tag);
    let mut out = Vec::new();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find(&needle) {
        let start = from + rel;
        let after = start + needle.len();
        let boundary_ok = lower.as_bytes().get(after).map(|c| *c == b'>' || *c == b'/' || c.is_ascii_whitespace()).unwrap_or(true);
        if !boundary_ok {
            from = after;
            continue;
        }
        let end = lower[after..].find('>').map(|i| after + i).unwrap_or(lower.len());
        if end <= html.len() {
            out.push(html[start..end].to_string());
        }
        from = end + 1;
    }
    out
}

/// 从单个标签字符串中提取属性值，支持双引号/单引号/无引号。
fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut from = 0usize;
    while let Some(pos) = lower[from..].find(name) {
        let start = from + pos;
        let before_ok = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        let after = start + name.len();
        if before_ok && after < bytes.len() && bytes[after] == b'=' {
            let mut i = after + 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
                let quote = bytes[i];
                let value_start = i + 1;
                if let Some(quote_pos) = lower[value_start..].find(quote as char) {
                    let value_end = value_start + quote_pos;
                    return Some(tag[value_start..value_end].to_string());
                }
            } else {
                let value_start = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                    i += 1;
                }
                if i > value_start {
                    return Some(tag[value_start..i].to_string());
                }
            }
        }
        from = start + name.len();
    }
    None
}

/// 解析页面 HTML，优先 `rel="icon"`，其次 apple-touch-icon，忽略非图标 link。
pub(crate) fn extract_favicon_href(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut best: Option<(u8, String)> = None;
    for tag in find_tags(html, &lower, "link") {
        let rel = attr_value(&tag, "rel").unwrap_or_default().to_ascii_lowercase();
        let href = match attr_value(&tag, "href") {
            Some(h) => h,
            None => continue,
        };
        let href = href.trim();
        if href.is_empty() {
            continue;
        }
        let tokens: Vec<&str> = rel.split_whitespace().collect();
        let score = if tokens.len() == 1 && tokens[0] == "icon" {
            0
        } else if tokens.iter().any(|t| *t == "apple-touch-icon" || *t == "apple-touch-icon-precomposed") {
            1
        } else if tokens.iter().any(|t| t.contains("icon")) {
            2
        } else {
            continue;
        };
        if best.as_ref().map(|(s, _)| score < *s).unwrap_or(true) {
            best = Some((score, crate::check::html_decode_simple(href)));
            if score == 0 {
                break;
            }
        }
    }
    best.map(|(_, href)| href)
}

/// 把页面内解析出的 href 解析为绝对 http(s) URL。
pub(crate) fn resolve_favicon_url(page_url: &str, href: &str) -> Option<String> {
    let base = url::Url::parse(page_url).ok()?;
    let joined = base.join(href.trim()).ok()?;
    if joined.scheme() != "http" && joined.scheme() != "https" {
        return None;
    }
    Some(joined.to_string())
}

/// 依据 magic bytes 判定图片类型，拒绝非图片内容，避免把 HTML 错误页当图标缓存。
pub(crate) fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        Some("ico")
    } else {
        let head = &bytes[..bytes.len().min(512)];
        if String::from_utf8_lossy(head).to_ascii_lowercase().contains("<svg") {
            Some("svg")
        } else {
            None
        }
    }
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(n >> 6) as usize & 63] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[n as usize & 63] as char);
        } else {
            out.push('=');
        }
    }
    out
}

async fn fetch_page(c: &reqwest::Client, url: &str) -> Option<String> {
    let mut resp = c.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.ok()? {
        if buf.len() + chunk.len() > MAX_PAGE_BYTES {
            return None;
        }
        buf.extend_from_slice(&chunk);
    }
    Some(String::from_utf8_lossy(&buf).to_string())
}

async fn download(c: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let mut resp = c.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.ok()? {
        if buf.len() + chunk.len() > MAX_FAVICON_BYTES {
            return None;
        }
        buf.extend_from_slice(&chunk);
    }
    if buf.is_empty() {
        return None;
    }
    Some(buf)
}

/// 抓取并缓存 favicon，返回本地绝对路径。任何失败返回 `None`，不抛错。
pub async fn fetch_favicon(data_dir: &Path, page_url: &str) -> Option<FaviconResult> {
    let normalized = crate::check::normalize_url(page_url);
    if url::Url::parse(&normalized).is_err() {
        return None;
    }
    let c = client();
    let html = fetch_page(&c, &normalized).await?;
    let href = extract_favicon_href(&html).unwrap_or_else(|| "/favicon.ico".to_string());
    let icon_url = resolve_favicon_url(&normalized, &href)?;
    let dir = favicon_dir(data_dir);
    let prefix = format!("{:016x}.", fnv1a64(icon_url.as_bytes()));

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                return Some(FaviconResult { favicon_path: entry.path().to_string_lossy().to_string() });
            }
        }
    }

    let bytes = download(&c, &icon_url).await?;
    let ext = image_extension(&bytes)?;
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(format!("{}{}", prefix, ext));
    let tmp = dir.join(format!("{}{}.tmp", prefix, ext));
    std::fs::write(&tmp, &bytes).ok()?;
    std::fs::rename(&tmp, &path).ok()?;
    Some(FaviconResult { favicon_path: path.to_string_lossy().to_string() })
}

/// 把缓存的图标文件读成 base64 data URL，供 `<img>` 直接加载（免 asset 协议）。
pub fn read_favicon_data_url(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() || bytes.len() > MAX_FAVICON_BYTES * 4 {
        return None;
    }
    let ext = image_extension(&bytes)?;
    let mime = match ext {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    Some(format!("data:{};base64,{}", mime, base64_encode(&bytes)))
}

/// 带目录约束的缓存读取入口：目标文件必须真实位于 `<data_dir>/favicons/` 内，
/// 拒绝 `../` 穿越、符号链接指向外部以及任意绝对路径。校验失败返回 `None`。
pub fn read_cached_favicon(data_dir: &Path, path: &str) -> Option<String> {
    let dir = std::fs::canonicalize(favicon_dir(data_dir)).ok()?;
    let target = std::fs::canonicalize(path).ok()?;
    if !path_is_within(&dir, &target) {
        return None;
    }
    read_favicon_data_url(&target.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    fn tmp_dir(label: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("favicon_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn http_response(status: &str, content_type: &str, body: &[u8]) -> Vec<u8> {
        let head = format!(
            "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            status,
            content_type,
            body.len()
        );
        let mut out = head.into_bytes();
        out.extend_from_slice(body);
        out
    }

    #[test]
    fn extract_prefers_rel_icon() {
        let html = r#"<html><head><link rel="shortcut icon" href="/fav.ico"><link rel="icon" href="https://x.dev/i.png"></head></html>"#;
        assert_eq!(extract_favicon_href(html).as_deref(), Some("https://x.dev/i.png"));
    }

    #[test]
    fn extract_handles_uppercase_single_quotes() {
        let html = r#"<LINK REL='apple-touch-icon' HREF='/apple.png'>"#;
        assert_eq!(extract_favicon_href(html).as_deref(), Some("/apple.png"));
    }

    #[test]
    fn extract_decodes_html_entities_in_href() {
        let html = r#"<link rel="icon" href="/a.png?x=1&amp;y=2">"#;
        assert_eq!(extract_favicon_href(html).as_deref(), Some("/a.png?x=1&y=2"));
    }

    #[test]
    fn extract_ignores_non_icon_links() {
        let html = r#"<link rel="stylesheet" href="/a.css">"#;
        assert!(extract_favicon_href(html).is_none());
    }

    #[test]
    fn resolve_relative_protocol_relative_and_rejects_other_schemes() {
        assert_eq!(
            resolve_favicon_url("https://example.com/dir/page", "i.png").as_deref(),
            Some("https://example.com/dir/i.png")
        );
        assert_eq!(
            resolve_favicon_url("https://example.com", "//cdn.dev/i.png").as_deref(),
            Some("https://cdn.dev/i.png")
        );
        assert_eq!(resolve_favicon_url("https://example.com", "javascript:void(0)").as_deref(), None);
    }

    #[test]
    fn detects_image_kinds() {
        assert_eq!(image_extension(b"\x89PNG\r\n\x1a\nrest"), Some("png"));
        assert_eq!(image_extension(&[0xFF, 0xD8, 0xFF, 0x00]), Some("jpg"));
        assert_eq!(image_extension(b"GIF89axxx"), Some("gif"));
        assert_eq!(image_extension(b"RIFF0000WEBPxxx"), Some("webp"));
        assert_eq!(image_extension(&[0x00, 0x00, 0x01, 0x00, 0x00]), Some("ico"));
        assert_eq!(image_extension(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"), Some("svg"));
        assert_eq!(image_extension(b"just text"), None);
    }

    #[test]
    fn base64_vectors() {
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"M"), "TQ==");
    }

    #[test]
    fn downloads_parses_and_caches_favicon() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let png = b"\x89PNG\r\n\x1a\nfakeimagedata".to_vec();
        let icon_requests = Arc::new(AtomicUsize::new(0));
        let counter = icon_requests.clone();
        std::thread::spawn(move || {
            for _ in 0..6 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let resp = if text.contains("GET /page") {
                        http_response("200 OK", "text/html", br#"<html><head><link rel="icon" href="/fav.png"></head></html>"#)
                    } else if text.contains("GET /fav.png") {
                        if counter.fetch_add(1, Ordering::SeqCst) == 0 {
                            http_response("200 OK", "image/png", &png)
                        } else {
                            http_response("404 Not Found", "text/plain", b"gone")
                        }
                    } else {
                        http_response("404 Not Found", "text/plain", b"nf")
                    };
                    let _ = stream.write_all(&resp);
                }
            }
        });

        let d = tmp_dir("download");
        let url = format!("http://{}/page", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let first = rt.block_on(fetch_favicon(&d, &url)).expect("首次抓取应成功");
        assert!(first.favicon_path.ends_with(".png"));
        assert!(Path::new(&first.favicon_path).exists());

        let second = rt.block_on(fetch_favicon(&d, &url)).expect("命中缓存应成功");
        assert_eq!(first.favicon_path, second.favicon_path);
        assert_eq!(icon_requests.load(Ordering::SeqCst), 1, "第二次不应重复下载图标");
    }

    #[test]
    fn missing_icon_returns_none() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in 0..4 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let resp = if text.contains("GET /page") {
                        http_response("200 OK", "text/html", br#"<html><head><link rel="icon" href="/missing.ico"></head></html>"#)
                    } else {
                        http_response("404 Not Found", "text/plain", b"nf")
                    };
                    let _ = stream.write_all(&resp);
                }
            }
        });

        let d = tmp_dir("missing");
        let url = format!("http://{}/page", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert!(rt.block_on(fetch_favicon(&d, &url)).is_none());
    }

    #[test]
    fn falls_back_to_root_favicon_and_rejects_non_images() {
        // 页面没有 link 图标 → 回退 /favicon.ico，但服务器返回非图片内容 → None
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in 0..4 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let resp = if text.contains("GET /page") {
                        http_response("200 OK", "text/html", b"<html><body>no icon</body></html>")
                    } else {
                        http_response("200 OK", "text/html", b"<html>error page</html>")
                    };
                    let _ = stream.write_all(&resp);
                }
            }
        });

        let d = tmp_dir("fallback");
        let url = format!("http://{}/page", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert!(rt.block_on(fetch_favicon(&d, &url)).is_none());
    }

    #[test]
    fn read_data_url_only_for_cached_images() {
        let d = tmp_dir("read");
        let png = d.join("a.png");
        fs::write(&png, b"\x89PNG\r\n\x1a\nxx").unwrap();
        let url = read_favicon_data_url(png.to_str().unwrap()).expect("png 应可读");
        assert!(url.starts_with("data:image/png;base64,"));

        assert!(read_favicon_data_url(d.join("nope.png").to_str().unwrap()).is_none());
        let txt = d.join("a.txt");
        fs::write(&txt, b"plain text").unwrap();
        assert!(read_favicon_data_url(txt.to_str().unwrap()).is_none());
    }

    #[test]
    fn cached_reader_confines_to_favicon_dir() {
        let d = tmp_dir("confine");
        let fav = favicon_dir(&d);
        fs::create_dir_all(&fav).unwrap();
        let png = fav.join("a.png");
        fs::write(&png, b"\x89PNG\r\n\x1a\nxx").unwrap();

        let url = read_cached_favicon(&d, png.to_str().unwrap()).expect("目录内文件应可读");
        assert!(url.starts_with("data:image/png;base64,"));

        // 缓存目录不存在：拒绝
        let empty = tmp_dir("confine_empty");
        assert!(read_cached_favicon(&empty, png.to_str().unwrap()).is_none());

        // ../ 穿越到数据目录外：拒绝
        let outside = d.join("outside.png");
        fs::write(&outside, b"\x89PNG\r\n\x1a\nxx").unwrap();
        let traversal = fav.join("../outside.png");
        assert!(read_cached_favicon(&d, traversal.to_str().unwrap()).is_none());

        // 目录外的绝对路径：拒绝
        assert!(read_cached_favicon(&d, outside.to_str().unwrap()).is_none());

        // 不存在的路径：None
        assert!(read_cached_favicon(&d, fav.join("nope.png").to_str().unwrap()).is_none());
    }

    #[test]
    fn rejects_oversized_icon_download_without_reading_it_all() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (written_tx, written_rx) = std::sync::mpsc::channel::<usize>();
        std::thread::spawn(move || {
            let mut body = b"\x89PNG\r\n\x1a\n".to_vec();
            body.resize(8 * 1024 * 1024, 0x41);
            for _ in 0..2 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    if text.contains("GET /page") {
                        let resp = http_response("200 OK", "text/html", br#"<html><head><link rel="icon" href="/big.png"></head></html>"#);
                        let _ = stream.write_all(&resp);
                    } else {
                        let head = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        if stream.write_all(head.as_bytes()).is_err() {
                            break;
                        }
                        let mut written = 0usize;
                        for chunk in body.chunks(16 * 1024) {
                            if stream.write_all(chunk).is_err() {
                                break;
                            }
                            written += chunk.len();
                        }
                        let _ = written_tx.send(written);
                    }
                }
            }
        });

        let d = tmp_dir("oversize_icon");
        let url = format!("http://{}/page", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert!(rt.block_on(fetch_favicon(&d, &url)).is_none());
        let written = written_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("服务器应报告成功写入的字节数");
        assert!(written < 8 * 1024 * 1024, "客户端应在读满响应前中止，实际写入 {written} 字节");
        assert!(!favicon_dir(&d).exists(), "超限响应不应落盘");
    }

    #[test]
    fn rejects_oversized_page_html() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let png = b"\x89PNG\r\n\x1a\nfakeimagedata".to_vec();
        std::thread::spawn(move || {
            let body = format!("<html><body>{}</body></html>", "x".repeat(MAX_PAGE_BYTES));
            for _ in 0..2 {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    // 回退路径返回合法图标：旧实现（无页面大小上限）会走这条并成功
                    let resp = if text.contains("GET /page") {
                        http_response("200 OK", "text/html", body.as_bytes())
                    } else {
                        http_response("200 OK", "image/png", &png)
                    };
                    let _ = stream.write_all(&resp);
                }
            }
        });

        let d = tmp_dir("oversize_page");
        let url = format!("http://{}/page", addr);
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert!(rt.block_on(fetch_favicon(&d, &url)).is_none());
        assert!(!favicon_dir(&d).exists());
    }
}
