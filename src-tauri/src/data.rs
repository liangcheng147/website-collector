use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Category { pub id: String, pub name: String, #[serde(default)] pub children: Vec<Category> }

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String, pub name: String, pub url: String,
    pub category_id: Option<String>,
    #[serde(default)] pub tags: Vec<String>,
    #[serde(default)] pub status: String,
    pub last_check: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashedSite { pub site: Site, pub deleted_at: String }

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub version: u32,
    #[serde(default)] pub categories: Vec<Category>,
    #[serde(default)] pub sites: Vec<Site>,
    #[serde(default)] pub recycle_bin: Vec<TrashedSite>,
    #[serde(default)] pub tags: Vec<String>,
}

pub fn data_file_path(app_data_dir: &Path) -> PathBuf { app_data_dir.join("websites.json") }

pub fn load_data(app_data_dir: &Path) -> AppData {
    let path = data_file_path(app_data_dir);
    if !path.exists() { return AppData::default(); }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str::<AppData>(&s).unwrap_or_else(|_| {
            let _ = fs::copy(&path, path.with_extension("json.bak"));
            AppData::default()
        }),
        Err(_) => AppData::default(),
    }
}

pub fn save_data(app_data_dir: &Path, data: &AppData) -> Result<(), String> {
    let path = data_file_path(app_data_dir);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("bookmark_test_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn load_missing_file_returns_empty() {
        let d = tmp_dir("missing");
        let data = load_data(&d);
        assert!(data.categories.is_empty() && data.sites.is_empty());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = tmp_dir("roundtrip");
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site {
            id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
            category_id: None, tags: vec!["框架".into()], status: "ok".into(), last_check: None,
        });
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.sites.len(), 1);
assert_eq!(loaded.sites[0].name, "React");
    }

    #[test]
    fn corrupt_file_backs_up_and_returns_empty() {
        let d = tmp_dir("corrupt");
        let p = data_file_path(&d);
        fs::write(&p, "{ not valid json").unwrap();
        let data = load_data(&d);
        assert!(data.sites.is_empty());
        assert!(p.with_extension("json.bak").exists());
    }
}
