use std::fs;
use std::path::{Path, PathBuf};

pub fn config_path(app_data_dir: &Path) -> PathBuf { app_data_dir.join("config.json") }

/// 读取 config.json 中的 dataDir。缺失/损坏返回 None；
/// 损坏时先备份为 config.json.bak 再返回 None（首次启动引导页会重新出现）。
pub fn read_data_dir(app_data_dir: &Path) -> Option<String> {
    let p = config_path(app_data_dir);
    if !p.exists() { return None; }
    match fs::read_to_string(&p) {
        Ok(s) => match serde_json::from_str::<serde_json::Value>(&s) {
            Ok(v) => v.get("dataDir").and_then(|d| d.as_str()).map(|s| s.to_string()),
            Err(_) => { let _ = fs::copy(&p, p.with_extension("bak")); None }
        },
        Err(_) => None,
    }
}

/// 原子写入：先写 config.json.tmp，再 rename 覆盖，避免写一半损坏。
pub fn write_data_dir(app_data_dir: &Path, dir: &str) -> Result<(), String> {
    let p = config_path(app_data_dir);
    if let Some(parent) = p.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(&serde_json::json!({ "dataDir": dir })).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// config.json 是否存在且可解析。
pub fn exists(app_data_dir: &Path) -> bool {
    let p = config_path(app_data_dir);
    if !p.exists() { return false; }
    match fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str::<serde_json::Value>(&s).is_ok(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cfg_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn read_missing_returns_none() {
        let d = tmp_dir("missing");
        assert_eq!(read_data_dir(&d), None);
        assert!(!exists(&d));
    }

    #[test]
    fn write_then_read_roundtrip() {
        let d = tmp_dir("roundtrip");
        write_data_dir(&d, "D:\\bookmarks").unwrap();
        assert_eq!(read_data_dir(&d).as_deref(), Some("D:\\bookmarks"));
        assert!(exists(&d));
        assert!(!config_path(&d).with_extension("json.tmp").exists(), "tmp 文件应被 rename 清理");
    }

    #[test]
    fn corrupt_config_backs_up_and_returns_none() {
        let d = tmp_dir("corrupt");
        fs::write(config_path(&d), "{ not valid json").unwrap();
        assert_eq!(read_data_dir(&d), None);
        assert!(!exists(&d));
        assert!(config_path(&d).with_extension("bak").exists(), "损坏 config 应备份 .bak");
    }
}