use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{WebviewUrl, WebviewWindowBuilder};

use crate::check;

const VERIFY_TIMEOUT: Duration = Duration::from_secs(8);
static WINDOW_SEQ: AtomicU64 = AtomicU64::new(0);

async fn probe_webview(app: &tauri::AppHandle, url: &str) -> bool {
    let label = format!("verify_{}", WINDOW_SEQ.fetch_add(1, Ordering::Relaxed));
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    let tx = std::sync::Mutex::new(Some(tx));
    let window = match WebviewWindowBuilder::new(app, label, WebviewUrl::External(parsed))
        .visible(false)
        .on_page_load(move |_win, ev| {
            if ev.event() == tauri::webview::PageLoadEvent::Finished {
                let scheme = ev.url().scheme();
                if let Some(sender) = tx.lock().unwrap().take() {
                    let _ = sender.send(scheme == "http" || scheme == "https");
                }
            }
        })
        .build()
    {
        Ok(w) => w,
        Err(_) => return false,
    };
    let ok = tokio::time::timeout(VERIFY_TIMEOUT, rx)
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or(false);
    let _ = window.close();
    ok
}

pub async fn verify_site(app: &tauri::AppHandle, url: &str) -> check::CheckResult {
    let mut last = check::normalize_url(url);
    for cand in check::variants(url) {
        last = cand.clone();
        if probe_webview(app, &cand).await {
            return check::CheckResult { status: "ok".into(), used_url: cand };
        }
    }
    check::CheckResult { status: "dead".into(), used_url: last }
}