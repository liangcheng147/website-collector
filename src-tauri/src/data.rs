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
    #[serde(default)] pub note: String,
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
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
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

fn default_port(scheme: &str) -> Option<&'static str> {
    match scheme {
        "http" | "ws" => Some("80"),
        "https" | "wss" => Some("443"),
        "ftp" => Some("21"),
        _ => None,
    }
}

fn split_host_port(authority: &str) -> (&str, Option<&str>) {
    if let Some(rest) = authority.strip_prefix('[') {
        if let Some(i) = rest.find(']') {
            let host = &authority[..i + 2];
            let tail = &authority[i + 2..];
            return (host, tail.strip_prefix(':'));
        }
    }
    match authority.rfind(':') {
        Some(i) => (&authority[..i], Some(&authority[i + 1..])),
        None => (authority, None),
    }
}

/// 统一 URL 归一化：scheme/host 小写、去默认端口、折叠多余斜杠并去尾斜杠、丢弃 fragment。
/// 与前端 `src/store/app.ts` 的 `normalizeUrl` 保持同语义。
pub fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    let before_hash = match trimmed.find('#') {
        Some(i) => &trimmed[..i],
        None => trimmed,
    };
    let scheme_end = match before_hash.find("://") {
        Some(i) => i,
        None => return before_hash.to_lowercase().trim_end_matches('/').to_string(),
    };
    let scheme = before_hash[..scheme_end].to_lowercase();
    let rest = &before_hash[scheme_end + 3..];

    let (authority, path_and_query) = match rest.find(['/', '?']) {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    let authority = match authority.rfind('@') {
        Some(i) => &authority[i + 1..],
        None => authority,
    };
    let (host, port) = split_host_port(authority);
    let host = host.to_lowercase();
    let port_str = match port {
        Some(p) if default_port(&scheme) == Some(p) => String::new(),
        Some(p) => format!(":{}", p),
        None => String::new(),
    };

    let (path_raw, query) = match path_and_query.find('?') {
        Some(i) => (&path_and_query[..i], &path_and_query[i..]),
        None => (path_and_query, ""),
    };
    let query = if query == "?" { "" } else { query };

    let mut path = String::with_capacity(path_raw.len());
    let mut prev_slash = false;
    for ch in path_raw.chars() {
        if ch == '/' {
            if !prev_slash { path.push('/'); }
            prev_slash = true;
        } else {
            path.push(ch);
            prev_slash = false;
        }
    }
    while path.len() > 1 && path.ends_with('/') {
        path.pop();
    }
    if path == "/" {
        path.clear();
    }

    format!("{}://{}{}{}{}", scheme, host, port_str, path, query)
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
        let norm = normalize_url(&s.url);
        if let Some(existing) = current.sites.iter_mut().find(|x| normalize_url(&x.url) == norm) {
            existing.name = s.name.clone();
            if target_cat.is_some() { existing.category_id = target_cat.clone(); }
        } else {
            current.sites.push(Site {
                id: s.id.clone(), name: s.name.clone(), url: s.url.clone(),
                category_id: target_cat, tags: s.tags.clone(),
                status: "unknown".into(), last_check: None,
                note: s.note.clone(),
            });
        }
    }
    let mut seen = std::collections::HashSet::new();
    let mut tags = Vec::new();
    for s in &current.sites { for t in &s.tags { if seen.insert(t.clone()) { tags.push(t.clone()); } } }
    current.tags = tags;
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
            note: "".into(),
        });
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.sites.len(), 1);
assert_eq!(loaded.sites[0].name, "React");
    }

    #[test]
    fn atomic_save_no_tmp_leftover() {
        let d = tmp_dir("atomic");
        let data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.version, 1);
        let tmp = data_file_path(&d).with_extension("json.tmp");
        assert!(!tmp.exists(), "atomic write should clean up .tmp file");
        let _ = std::fs::remove_dir_all(&d);
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
        data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "".into() });
        save_data(&d, &data).unwrap();
        let mut fresh = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        fresh.sites.push(Site { id: "s2".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "".into() });
        let in_path = d.join("in.json");
        export_json_to_path(&fresh, &in_path).unwrap();
        let back = import_json_from_path(&d, &in_path).unwrap();
        assert_eq!(back.sites.len(), 1);
        assert_eq!(back.sites[0].id, "s2");
        assert!(data_file_path(&d).with_extension("json.bak").exists(), "覆盖导入应自动备份 .bak");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn site_note_roundtrip() {
        let d = tmp_dir("note_rt");
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site {
            id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
            category_id: None, tags: vec![], status: "ok".into(), last_check: None,
            note: "官方文档".into(),
        });
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.sites[0].note, "官方文档");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn legacy_json_without_note_loads_empty() {
        let d = tmp_dir("legacy_note");
        let p = data_file_path(&d);
        std::fs::write(&p, r#"{"version":1,"categories":[],"sites":[{"id":"s1","name":"A","url":"https://a.dev","categoryId":null,"tags":[],"status":"ok","lastCheck":null}],"recycleBin":[],"tags":[]}"#).unwrap();
        let data = load_data(&d);
        assert_eq!(data.sites[0].note, "");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn normalize_url_unifies_case_default_port_and_slashes() {
        assert_eq!(normalize_url("HTTPS://Example.com///"), normalize_url("https://example.com"));
        assert_eq!(normalize_url("https://GitHub.com/"), "https://github.com");
        assert_eq!(normalize_url("https://Example.COM/path/"), "https://example.com/path");
        assert_eq!(normalize_url("http://example.com:80"), "http://example.com");
        assert_eq!(normalize_url("https://example.com:443/a//b/"), "https://example.com/a/b");
        assert_eq!(normalize_url("https://example.com:8443"), "https://example.com:8443");
    }

    #[test]
    fn merge_treats_case_and_trailing_slash_variants_as_same_url() {
        let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "已有备注".into() });
        let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        incoming.sites.push(Site { id: "x".into(), name: "A2".into(), url: "HTTPS://A.dev/".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "incoming".into() });
        merge_into(&mut current, &incoming);
        assert_eq!(current.sites.len(), 1, "大小写/尾斜杠不同的等价 URL 应合并而非新增");
        assert_eq!(current.sites[0].name, "A2", "名称更新为导入值");
        assert_eq!(current.sites[0].note, "已有备注", "保留现有备注");
    }

    #[test]
    fn merge_keeps_existing_note_and_copies_new() {
        let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "已有备注".into() });
        let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        incoming.sites.push(Site { id: "x".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "incoming 备注".into() });
        incoming.sites.push(Site { id: "y".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "新站点备注".into() });
        merge_into(&mut current, &incoming);
        assert_eq!(current.sites[0].note, "已有备注", "已存在站点保留原备注");
        assert_eq!(current.sites[1].note, "新站点备注", "新站点拷贝备注");
    }
}
