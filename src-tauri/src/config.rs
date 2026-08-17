use std::fs;
use std::path::{Path, PathBuf};

/// exe_dir 可写时用 exe 旁 data/（便携），否则回退系统用户目录。
/// 返回 (数据目录, 是否回退)。
pub fn resolve_data_dir(exe_dir: &Path, app_data_dir: &Path, exe_writable: bool) -> (PathBuf, bool) {
    if exe_writable { (exe_dir.join("data"), false) } else { (app_data_dir.to_path_buf(), true) }
}

/// 探测目录是否可写：尝试创建探针文件再删除。
pub fn exe_dir_writable(exe_dir: &Path) -> bool {
    let probe = exe_dir.join(format!(".write_probe_{}", std::process::id()));
    match fs::write(&probe, b"") {
        Ok(_) => { let _ = fs::remove_file(&probe); true }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(label: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cfg_v1_{}_{}", std::process::id(), label));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn resolve_uses_exe_dir_when_writable() {
        let exe = std::path::PathBuf::from("C:\\Programs\\guiji");
        let app = std::path::PathBuf::from("C:\\Users\\x\\AppData\\Roaming\\com.personal.site-collector");
        assert_eq!(resolve_data_dir(&exe, &app, true), (exe.join("data"), false));
    }

    #[test]
    fn resolve_falls_back_when_not_writable() {
        let exe = std::path::PathBuf::from("C:\\Program Files\\guiji");
        let app = std::path::PathBuf::from("C:\\Users\\x\\AppData\\Roaming\\com.personal.site-collector");
        assert_eq!(resolve_data_dir(&exe, &app, false), (app, true));
    }

    #[test]
    fn exe_dir_writable_true_on_temp() {
        let d = tmp_dir("writable");
        assert!(exe_dir_writable(&d));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn exe_dir_writable_false_when_missing() {
        let d = std::env::temp_dir().join(format!("cfg_v1_missing_{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        assert!(!exe_dir_writable(&d), "不存在的目录写入探测应失败");
    }
}