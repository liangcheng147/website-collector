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
    let base = data_dir(&app);
    let from = active_data_dir(&app);
    let to = std::path::PathBuf::from(&new_dir);
    data::ensure_empty_or_create(&to)?;
    let src = data::data_file_path(&from);
    let dst = data::data_file_path(&to);
    data::move_data_file(&src, &dst)?;
    if let Err(e) = config::write_data_dir(&base, &new_dir) {
        let _ = data::move_data_file(&dst, &src); // 回滚文件移动
        return Err(format!("写入配置失败，已回滚：{}", e));
    }
    Ok(())
}

#[tauri::command]
pub fn get_data_file_path(app: tauri::AppHandle) -> String {
    data::data_file_path(&active_data_dir(&app)).to_string_lossy().to_string()
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
pub fn export_md_to_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data = data::load_data(&active_data_dir(&app));
    md::export_md_to_path(&data, std::path::Path::new(&path))
}

#[tauri::command]
pub fn export_json_to_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let data = data::load_data(&active_data_dir(&app));
    data::export_json_to_path(&data, std::path::Path::new(&path))
}

#[tauri::command]
pub fn import_md_from_file(app: tauri::AppHandle, path: String, mode: String) -> Result<data::AppData, String> {
    md::import_md_from_path(&active_data_dir(&app), std::path::Path::new(&path), &mode)
}

#[tauri::command]
pub fn import_json_from_file(app: tauri::AppHandle, path: String) -> Result<data::AppData, String> {
    data::import_json_from_path(&active_data_dir(&app), std::path::Path::new(&path))
}