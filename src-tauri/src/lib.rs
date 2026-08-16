// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod check;
mod commands;
mod config;
mod data;
mod md;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_data_dir,
            commands::has_config,
            commands::set_data_dir,
            commands::probe_data_dir,
            commands::load_data,
            commands::save_data,
            commands::migrate_data_dir,
            commands::get_data_file_path,
            commands::check_site_cmd,
            commands::check_connectivity_cmd,
            commands::export_md_to_file,
            commands::export_json_to_file,
            commands::import_md_from_file,
            commands::import_json_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
