use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)] pub theme: String,
    #[serde(default)] pub zoom: u32,
}

impl Settings {
    pub fn defaults() -> Self {
        Settings { theme: "system".into(), zoom: 100 }
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
        let s = Settings { theme: "dark".into(), zoom: 130 };
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
}