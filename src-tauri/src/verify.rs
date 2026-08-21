use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use crate::check;

const VERIFY_TIMEOUT: Duration = Duration::from_secs(8);
static WINDOW_SEQ: AtomicU64 = AtomicU64::new(0);

fn js_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

async fn probe_webview(app: &tauri::AppHandle, url: &str) -> bool {
    let label = format!("verify_{}", WINDOW_SEQ.fetch_add(1, Ordering::Relaxed));
    let blank = match url::Url::parse("about:blank") {
        Ok(u) => u,
        Err(_) => return false,
    };
    let (tx, rx) = oneshot::channel::<bool>();
    let cell: Arc<Mutex<Option<oneshot::Sender<bool>>>> = Arc::new(Mutex::new(Some(tx)));
    let resolved = Arc::new(AtomicBool::new(false));

    let js_fire = format!(
        "fetch({},{{mode:'no-cors',cache:'no-store'}}).then(function(){{window.__vrfy='VRFY_OK'}},function(){{window.__vrfy='VRFY_FAIL'}})",
        js_str(url)
    );

    let window = match WebviewWindowBuilder::new(app, label, WebviewUrl::External(blank))
        .visible(false)
        .build()
    {
        Ok(w) => w,
        Err(_) => return false,
    };

    let mut fired = false;
    for _ in 0..40 {
        if window.eval(js_fire.clone()).is_ok() {
            fired = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if !fired {
        let _ = window.close();
        return false;
    }

    let deadline = Instant::now() + VERIFY_TIMEOUT;
    while !resolved.load(Ordering::Relaxed) && Instant::now() < deadline {
        let cell_cb = Arc::clone(&cell);
        let resolved_cb = Arc::clone(&resolved);
        let _ = window.eval_with_callback("String(window.__vrfy||'')", move |res| {
            if res.contains("VRFY_") && !resolved_cb.swap(true, Ordering::Relaxed) {
                if let Some(tx) = cell_cb.lock().unwrap().take() {
                    let _ = tx.send(res.contains("VRFY_OK"));
                }
            }
        });
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    let ok = match tokio::time::timeout(Duration::from_secs(1), rx).await {
        Ok(Ok(v)) => v,
        _ => false,
    };
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
