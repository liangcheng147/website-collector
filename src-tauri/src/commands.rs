use crate::{check, config, data, md};
use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
}

fn active_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    config::read_data_dir(&data_dir(app)).map(std::path::PathBuf::from).unwrap_or_else(|| data_dir(app))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult { pub exists: bool, pub site_count: u32 }

#[tauri::command]
pub fn has_config(app: tauri::AppHandle) -> bool {
    config::exists(&data_dir(&app))
}

#[tauri::command]
pub fn set_data_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    config::write_data_dir(&data_dir(&app), &dir)
}

#[tauri::command]
pub fn probe_data_dir(dir: String) -> ProbeResult {
    let p = data::data_file_path(std::path::Path::new(&dir));
    if p.exists() {
        let d = data::load_data(std::path::Path::new(&dir));
        ProbeResult { exists: true, site_count: d.sites.len() as u32 }
    } else {
        ProbeResult { exists: false, site_count: 0 }
    }
}

#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle) -> String {
    active_data_dir(&app).to_string_lossy().to_string()
}

#[tauri::command]
pub fn load_data(app: tauri::AppHandle) -> data::AppData {
    data::load_data(&active_data_dir(&app))
}

#[tauri::command]
pub fn save_data(app: tauri::AppHandle, data: data::AppData) -> Result<(), String> {
    data::save_data(&active_data_dir(&app), &data)
}

#[tauri::command]
pub fn migrate_data_dir(app: tauri::AppHandle, new_dir: String) -> Result<(), String> {
    let from = active_data_dir(&app);
    let src = data::data_file_path(&from);
    let to_dir = std::path::PathBuf::from(&new_dir);
    std::fs::create_dir_all(&to_dir).map_err(|e| e.to_string())?;
    let dst = to_dir.join("websites.json");
    if src.exists() {
        std::fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    }
    let cfg = serde_json::json!({ "dataDir": new_dir });
    std::fs::write(config::config_path(&data_dir(&app)), serde_json::to_string_pretty(&cfg).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_site_cmd(url: String) -> check::CheckResult {
    check::check_site(&url).await
}

#[tauri::command]
pub async fn check_connectivity_cmd() -> bool {
    check::check_connectivity().await
}

#[tauri::command]
pub fn export_md_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let data = data::load_data(&active_data_dir(&app));
    Ok(md::export_to_md(&data))
}

#[tauri::command]
pub fn import_md_cmd(app: tauri::AppHandle, text: String, mode: String) -> Result<data::AppData, String> {
    let incoming = md::import_from_md(&text);
    let mut current = data::load_data(&active_data_dir(&app));
    match mode.as_str() {
        "overwrite" => {
            let p = data::data_file_path(&active_data_dir(&app));
            if p.exists() {
                std::fs::copy(&p, p.with_extension("json.bak")).map_err(|e| e.to_string())?;
            }
            let _ = data::save_data(&active_data_dir(&app), &incoming);
            Ok(incoming)
        }
        "merge" => {
            merge_into(&mut current, &incoming);
            let _ = data::save_data(&active_data_dir(&app), &current);
            Ok(current)
        }
        _ => Err("mode must be overwrite or merge".into()),
    }
}

fn merge_into(current: &mut data::AppData, incoming: &data::AppData) {
    let mut cat_id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut next = current.categories.len();
    fn find_or_create(
        list: &mut Vec<data::Category>,
        incoming_cat: &data::Category,
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
            let mut node = data::Category { id: id.clone(), name: incoming_cat.name.clone(), children: vec![] };
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
            current.sites.push(data::Site {
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