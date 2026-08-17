use crate::{check, config, data, md, settings};
use tauri::Manager;

fn exe_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn resolve(app: &tauri::AppHandle) -> (std::path::PathBuf, bool) {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    config::resolve_data_dir(&exe_dir(), &app_dir, config::exe_dir_writable(&exe_dir()))
}

fn active_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    resolve(app).0
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocation { pub dir: String, pub is_fallback: bool }

#[tauri::command]
pub fn get_data_location(app: tauri::AppHandle) -> DataLocation {
    let (dir, fallback) = resolve(&app);
    DataLocation { dir: dir.to_string_lossy().to_string(), is_fallback: fallback }
}

#[tauri::command]
pub fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = active_data_dir(&app);
    let _ = std::fs::create_dir_all(&dir);
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| e.to_string())
}

fn main_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "主窗口不存在".to_string())
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_maximize_window(app: tauri::AppHandle) -> Result<(), String> {
    let win = main_window(&app)?;
    let result = if win.is_maximized().unwrap_or(false) { win.unmaximize() } else { win.maximize() };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    main_window(&app)?.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_maximized(app: tauri::AppHandle) -> bool {
    main_window(&app).map(|w| w.is_maximized().unwrap_or(false)).unwrap_or(false)
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> settings::Settings {
    settings::load_settings(&active_data_dir(&app))
}

#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, settings: settings::Settings) -> Result<(), String> {
    settings::save_settings(&active_data_dir(&app), &settings)
}

#[cfg(test)]
mod tests {
    use super::exe_dir;

    #[test]
    fn exe_dir_returns_current_dir() {
        let d = exe_dir();
        assert!(d.is_absolute() || d.as_os_str().is_empty() || d == std::path::Path::new("."));
        // 测试二进制自身所在目录必然存在
        assert!(d.exists() || d == std::path::Path::new("."));
    }
}