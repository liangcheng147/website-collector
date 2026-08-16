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

pub fn backup_data_file(app_data_dir: &Path) -> Result<(), String> {
    let p = data_file_path(app_data_dir);
    if p.exists() { fs::copy(&p, p.with_extension("json.bak")).map_err(|e| e.to_string())?; }
    Ok(())
}

pub fn export_json_to_path(data: &AppData, path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn import_json_from_path(app_data_dir: &Path, path: &Path) -> Result<AppData, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let incoming: AppData = serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败：{}", e))?;
    backup_data_file(app_data_dir)?;
    save_data(app_data_dir, &incoming)?;
    Ok(incoming)
}

pub fn merge_into(current: &mut AppData, incoming: &AppData) {
    let mut cat_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut next = current.categories.len();
    fn find_or_create(
        list: &mut Vec<Category>,
        incoming_cat: &Category,
        map: &mut std::collections::HashMap<String, String>,
        next: &mut usize,
    ) {
        let matched = list.iter().position(|c| c.name == incoming_cat.name);
        let id = if let Some(i) = matched {
            let id = list[i].id.clone();
            for child in &incoming_cat.children {
                find_or_create(&mut list[i].children, child, map, next);
            }
            id
        } else {
            let id = format!("auto{}", *next); *next += 1;
            let mut node = Category { id: id.clone(), name: incoming_cat.name.clone(), children: vec![] };
            for child in &incoming_cat.children {
                find_or_create(&mut node.children, child, map, next);
            }
            list.push(node);
            id
        };
        map.insert(incoming_cat.id.clone(), id);
    }
    for c in &incoming.categories {
        find_or_create(&mut current.categories, c, &mut cat_id_map, &mut next);
    }
    for s in &incoming.sites {
        let target_cat = s.category_id.as_ref().and_then(|id| cat_id_map.get(id)).cloned();
        if let Some(existing) = current.sites.iter_mut().find(|x| x.url == s.url) {
            existing.name = s.name.clone();
            if target_cat.is_some() { existing.category_id = target_cat.clone(); }
        } else {
            current.sites.push(Site {
                id: s.id.clone(), name: s.name.clone(), url: s.url.clone(),
                category_id: target_cat, tags: s.tags.clone(),
                status: "unknown".into(), last_check: None,
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    let mut tags = Vec::new();
    for s in &current.sites { for t in &s.tags { if seen.insert(t.clone()) { tags.push(t.clone()); } } }
    current.tags = tags;
}

/// 目标目录必须存在且为空；不存在则创建。非空拒绝。
pub fn ensure_empty_or_create(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        let mut it = fs::read_dir(dir).map_err(|e| e.to_string())?;
        if it.next().is_some() { return Err(format!("目标目录非空，拒绝迁移：{}", dir.display())); }
    } else {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 复制后删除源；任一步失败回滚（删除已复制的目标副本）。
pub fn copy_then_remove(src: &Path, dst: &Path) -> Result<(), String> {
    fs::copy(src, dst).map_err(|e| { let _ = fs::remove_file(dst); format!("跨盘复制失败，已回滚：{}", e) })?;
    fs::remove_file(src).map_err(|e| { let _ = fs::remove_file(dst); format!("复制成功但删除源失败，已回滚目标文件：{}", e) })
}

/// 优先同卷 rename；跨卷失败时退化为复制+删除。源不存在则视为成功。
pub fn move_data_file(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() { return Ok(()); }
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(_) => copy_then_remove(src, dst),
    }
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

    #[test]
    fn ensure_empty_rejects_non_empty() {
        let d = std::env::temp_dir().join(format!("mv_test_{}_full", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("x.txt"), "x").unwrap();
        assert!(ensure_empty_or_create(&d).is_err(), "非空目录应被拒绝");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn ensure_empty_creates_missing() {
        let d = std::env::temp_dir().join(format!("mv_test_{}_create", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        assert!(ensure_empty_or_create(&d).is_ok());
        assert!(d.exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn copy_then_remove_moves_file() {
        let base = std::env::temp_dir().join(format!("mv_test_{}_copy", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let src = base.join("a.json");
        let dst = base.join("b.json");
        fs::write(&src, "hello").unwrap();
        copy_then_remove(&src, &dst).unwrap();
        assert!(!src.exists() && dst.exists());
        assert_eq!(fs::read_to_string(&dst).unwrap(), "hello");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn move_data_file_same_volume() {
        let base = std::env::temp_dir().join(format!("mv_test_{}_rename", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let src = base.join("a.json");
        let dst = base.join("b.json");
        fs::write(&src, "data").unwrap();
        move_data_file(&src, &dst).unwrap();
        assert!(!src.exists() && dst.exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn export_import_json_roundtrip() {
        let d = tmp_dir("json_rt");
        let data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        let out = d.join("backup.json");
        export_json_to_path(&data, &out).unwrap();
        assert!(out.exists());
        let back = import_json_from_path(&d, &out).unwrap();
        assert_eq!(back.version, 1);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn import_json_backs_up_and_replaces() {
        let d = tmp_dir("json_bak");
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None });
        save_data(&d, &data).unwrap();
        let mut fresh = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        fresh.sites.push(Site { id: "s2".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None });
        let in_path = d.join("in.json");
        export_json_to_path(&fresh, &in_path).unwrap();
        let back = import_json_from_path(&d, &in_path).unwrap();
        assert_eq!(back.sites.len(), 1);
        assert_eq!(back.sites[0].id, "s2");
        assert!(data_file_path(&d).with_extension("json.bak").exists(), "覆盖导入应自动备份 .bak");
        let _ = std::fs::remove_dir_all(&d);
    }
}
