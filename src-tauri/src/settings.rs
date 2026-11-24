use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)] pub theme: String,
    #[serde(default = "default_palette")] pub palette: String,
    #[serde(default)] pub zoom: u32,
    #[serde(default)] pub sidebar_collapsed: Vec<String>,
    #[serde(default)] pub collapsed_categories: Vec<String>,
    #[serde(default = "default_true")] pub auto_check_update: bool,
    #[serde(default = "default_true")] pub auto_fetch_favicon: bool,
    /// 自动检查偏好。当前版本只持久化，定时调度尚未接入（见 Task 12 报告）。
    #[serde(default)] pub auto_check: bool,
    /// 自动检查间隔（分钟）；0 表示不调度。
    #[serde(default)] pub check_interval: u32,
    /// 默认检查范围：all / category / tag / selected。
    #[serde(default = "default_check_scope")] pub check_scope: String,
    /// 失败后的额外重试次数。
    #[serde(default = "default_retry_count")] pub retry_count: u32,
    /// 并发检测上限。
    #[serde(default = "default_concurrency")] pub concurrency: u32,
}

fn default_palette() -> String { "teal".into() }

fn default_true() -> bool { true }
fn default_check_scope() -> String { "all".into() }
fn default_retry_count() -> u32 { 1 }
fn default_concurrency() -> u32 { 3 }

impl Settings {
    pub fn defaults() -> Self {
        Settings {
            theme: "system".into(),
            palette: "teal".into(),
            zoom: 100,
            sidebar_collapsed: vec![],
            collapsed_categories: vec![],
            auto_check_update: true,
            auto_fetch_favicon: true,
            auto_check: false,
            check_interval: 0,
            check_scope: default_check_scope(),
            retry_count: default_retry_count(),
            concurrency: default_concurrency(),
        }
    }
}

pub fn settings_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

pub fn load_settings(data_dir: &Path) -> Settings {
    let path = settings_file_path(data_dir);
    if !path.exists() { return Settings::defaults(); }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str::<Settings>(&s).unwrap_or_else(|_| {
            let _ = fs::copy(&path, path.with_extension("json.bak"));
            Settings::defaults()
        }),
        Err(_) => Settings::defaults(),
    }
}

pub fn save_settings(data_dir: &Path, s: &Settings) -> Result<(), String> {
    let path = settings_file_path(data_dir);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("settings_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn missing_returns_defaults() {
        let s = load_settings(&tmp_dir("missing"));
        assert_eq!(s.theme, "system");
        assert_eq!(s.zoom, 100);
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = tmp_dir("roundtrip");
        let s = Settings { theme: "dark".into(), zoom: 130, ..Settings::defaults() };
        save_settings(&d, &s).unwrap();
        assert_eq!(load_settings(&d).theme, "dark");
        assert_eq!(load_settings(&d).zoom, 130);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn corrupt_returns_defaults_and_backs_up() {
        let d = tmp_dir("corrupt");
        fs::write(settings_file_path(&d), "{ bad").unwrap();
        assert_eq!(load_settings(&d).zoom, 100);
        assert!(settings_file_path(&d).with_extension("json.bak").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn sidebar_collapsed_roundtrip() {
        let d = tmp_dir("collapsed");
        let mut s = Settings::defaults();
        s.sidebar_collapsed = vec!["分类".into(), "系统".into()];
        save_settings(&d, &s).unwrap();
        let loaded = load_settings(&d);
        assert_eq!(loaded.sidebar_collapsed, vec!["分类".to_string(), "系统".to_string()]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_sidebar_collapsed_defaults_empty() {
        let d = tmp_dir("collapsed_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
        let s = load_settings(&d);
        assert!(s.sidebar_collapsed.is_empty());
        assert_eq!(s.theme, "dark");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_collapsed_categories_defaults_empty() {
        let d = tmp_dir("collapsed_cats_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"system","zoom":100}"#).unwrap();
        let s = load_settings(&d);
        assert!(s.collapsed_categories.is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn collapsed_categories_roundtrip() {
        let d = tmp_dir("collapsed_cats_roundtrip");
        let mut s = Settings::defaults();
        s.collapsed_categories = vec!["c1".into(), "c2".into()];
        save_settings(&d, &s).unwrap();
        let loaded = load_settings(&d);
        assert_eq!(loaded.collapsed_categories, vec!["c1".to_string(), "c2".to_string()]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn palette_roundtrip() {
        let d = tmp_dir("palette_roundtrip");
        let mut s = Settings::defaults();
        s.palette = "ocean".into();
        save_settings(&d, &s).unwrap();
        assert_eq!(load_settings(&d).palette, "ocean");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_palette_defaults_teal() {
        let d = tmp_dir("palette_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
        assert_eq!(load_settings(&d).palette, "teal");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_auto_check_update_defaults_true() {
        let d = tmp_dir("auto_check_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
        let s = load_settings(&d);
        assert!(s.auto_check_update);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn auto_check_update_roundtrip() {
        let d = tmp_dir("auto_check_roundtrip");
        let mut s = Settings::defaults();
        s.auto_check_update = false;
        save_settings(&d, &s).unwrap();
        assert!(!load_settings(&d).auto_check_update);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_auto_fetch_favicon_defaults_true() {
        let d = tmp_dir("auto_favicon_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
        assert!(load_settings(&d).auto_fetch_favicon);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn auto_fetch_favicon_roundtrip() {
        let d = tmp_dir("auto_favicon_roundtrip");
        let mut s = Settings::defaults();
        s.auto_fetch_favicon = false;
        save_settings(&d, &s).unwrap();
        assert!(!load_settings(&d).auto_fetch_favicon);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_check_fields_use_conservative_defaults() {
        let d = tmp_dir("check_fields_missing");
        fs::write(settings_file_path(&d), r#"{"theme":"dark","zoom":110}"#).unwrap();
        let s = load_settings(&d);
        assert!(!s.auto_check);
        assert_eq!(s.check_interval, 0);
        assert_eq!(s.check_scope, "all");
        assert_eq!(s.retry_count, 1);
        assert_eq!(s.concurrency, 3);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn check_policy_roundtrip() {
        let d = tmp_dir("check_policy_roundtrip");
        let mut s = Settings::defaults();
        s.auto_check = true;
        s.check_interval = 30;
        s.check_scope = "category".into();
        s.retry_count = 3;
        s.concurrency = 8;
        save_settings(&d, &s).unwrap();
        let loaded = load_settings(&d);
        assert!(loaded.auto_check);
        assert_eq!(loaded.check_interval, 30);
        assert_eq!(loaded.check_scope, "category");
        assert_eq!(loaded.retry_count, 3);
        assert_eq!(loaded.concurrency, 8);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn serialized_keys_are_camel_case() {
        let d = tmp_dir("camel_case_keys");
        save_settings(&d, &Settings::defaults()).unwrap();
        let raw = fs::read_to_string(settings_file_path(&d)).unwrap();
        assert!(raw.contains("\"autoCheckUpdate\""), "settings.json should use camelCase keys, got: {}", raw);
        assert!(raw.contains("\"autoFetchFavicon\""), "settings.json should persist autoFetchFavicon, got: {}", raw);
        for key in ["autoCheck", "checkInterval", "checkScope", "retryCount", "concurrency"] {
            assert!(raw.contains(&format!("\"{}\"", key)), "settings.json should persist {}, got: {}", key, raw);
        }
        let _ = fs::remove_dir_all(&d);
    }
}