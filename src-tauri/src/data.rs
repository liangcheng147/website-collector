use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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
    /// 本地缓存的 favicon 绝对路径，旧数据缺失时为 None。
    #[serde(default)] pub favicon_path: Option<String>,
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

/// 本地备份目录/文件命名与保留策略。
pub const BACKUP_DIR_NAME: &str = "backups";
pub const BACKUP_FILE_PREFIX: &str = "backup-";
pub const BACKUP_FILE_SUFFIX: &str = ".json";
/// 最多保留的备份份数，超出删除最旧。前端设置页文案需与此保持一致。
pub const MAX_BACKUPS: usize = 10;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub size: u64,
    /// 创建时间（Unix 毫秒）。由文件名时间戳解析，保证排序稳定、跨语言易格式化。
    pub created_at: i64,
}

fn backup_dir(app_data_dir: &Path) -> PathBuf { app_data_dir.join(BACKUP_DIR_NAME) }

/// Howard Hinnant 的 civil↔days 换算，仅用 std，避免引入时间依赖。
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if m > 2 { m - 3 } else { m + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + d as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// 文件名时间戳 `YYYYMMDD-HHMMSS-mmm`（UTC，毫秒）；不引入时区依赖，前端按本地时区展示。
fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn backup_stem() -> String {
    let ms = now_millis();
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}-{:03}",
        y, m, d, sod / 3600, (sod % 3600) / 60, sod % 60, ms.rem_euclid(1000)
    )
}

fn is_backup_file_name(name: &std::ffi::OsStr) -> bool {
    let s = name.to_string_lossy();
    s.starts_with(BACKUP_FILE_PREFIX) && s.ends_with(BACKUP_FILE_SUFFIX)
}

/// 解析备份文件名，返回 `(创建时间毫秒, 同毫秒序号)`。
/// 支持 `backup-<ts>.json`、`backup-<ts>-<mmm>.json` 与可选的 `-NN` 冲突后缀。
fn parse_backup_name(name: &str) -> Option<(i64, u32)> {
    let rest = name.strip_prefix(BACKUP_FILE_PREFIX)?;
    let dot = rest.find(BACKUP_FILE_SUFFIX)?;
    let body = &rest[..dot];
    if body.len() < 15 || body.as_bytes()[8] != b'-' { return None; }
    let ascii_digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if !(ascii_digits(&body[0..8]) && ascii_digits(&body[9..15])) { return None; }
    let year = body[0..4].parse::<i64>().ok()?;
    let month = body[4..6].parse::<u32>().ok()?;
    let day = body[6..8].parse::<u32>().ok()?;
    let hour = body[9..11].parse::<u32>().ok()?;
    let minute = body[11..13].parse::<u32>().ok()?;
    let second = body[13..15].parse::<u32>().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let mut millis = days_from_civil(year, month, day) * 86_400_000
        + (hour * 3600 + minute * 60 + second) as i64 * 1000;
    let mut seq = 0u32;
    let tail = &body[15..];
    if let Some(t) = tail.strip_prefix('-') {
        let parts: Vec<&str> = t.split('-').collect();
        match parts.as_slice() {
            // 兼容旧命名：`-NN`
            [only] if only.len() == 3 && ascii_digits(only) => millis += only.parse::<i64>().ok()?,
            [only] if ascii_digits(only) => seq = only.parse::<u32>().ok()?,
            [ms, n] if ms.len() == 3 && ascii_digits(ms) && ascii_digits(n) => {
                millis += ms.parse::<i64>().ok()?;
                seq = n.parse::<u32>().ok()?;
            }
            _ => return None,
        }
    } else if !tail.is_empty() {
        return None;
    }
    Some((millis, seq))
}

/// 在同一时间戳基础上递增序号；即使旧文件已被保留策略删除也不复用序号，
/// 保证按 (时间, 序号) 排序始终与创建顺序一致。
fn unique_backup_path(dir: &Path) -> PathBuf {
    let head = format!("{}{}", BACKUP_FILE_PREFIX, backup_stem());
    let mut seq = 0u32;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let os_name = entry.file_name();
            let name = os_name.to_string_lossy();
            if !name.starts_with(&head) { continue; }
            if let Some((_, existing)) = parse_backup_name(&name) { seq = seq.max(existing); }
        }
    }
    if seq == 0 {
        dir.join(format!("{}{}", head, BACKUP_FILE_SUFFIX))
    } else {
        dir.join(format!("{}-{:02}{}", head, seq, BACKUP_FILE_SUFFIX))
    }
}

fn copy_atomic(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let tmp = dst.with_extension("json.tmp");
    fs::copy(src, &tmp).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dst).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn backup_info(path: &Path) -> Option<BackupInfo> {
    let meta = fs::metadata(path).ok()?;
    let name = path.file_name()?.to_string_lossy().to_string();
    let created_at = parse_backup_name(&name)
        .map(|(millis, _)| millis)
        .or_else(|| meta.modified().ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as i64))?;
    Some(BackupInfo {
        path: path.to_string_lossy().to_string(),
        file_name: name,
        size: meta.len(),
        created_at,
    })
}

fn scan_backups(dir: &Path) -> Vec<BackupInfo> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new(); };
    entries
        .flatten()
        .filter(|e| e.path().is_file())
        .filter(|e| is_backup_file_name(&e.file_name()))
        .filter_map(|e| backup_info(&e.path()))
        .collect()
}

fn sort_newest_first(list: &mut [BackupInfo]) {
    // 同毫秒多份按序号排序；序号由目录内已有最大值递增，删除后不复用。
    list.sort_by(|a, b| {
        let ka = parse_backup_name(&a.file_name).unwrap_or((a.created_at, 0));
        let kb = parse_backup_name(&b.file_name).unwrap_or((b.created_at, 0));
        kb.0.cmp(&ka.0).then_with(|| kb.1.cmp(&ka.1))
    });
}

/// 列出备份目录中的备份，按创建时间倒序；目录不存在返回空数组。
pub fn list_backups(app_data_dir: &Path) -> Vec<BackupInfo> {
    let mut out = scan_backups(&backup_dir(app_data_dir));
    sort_newest_first(&mut out);
    out
}

fn prune_old_backups(dir: &Path) {
    let mut all = scan_backups(dir);
    sort_newest_first(&mut all);
    for info in all.into_iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(&info.path);
    }
}

/// 手动备份：把当前数据文件原子复制到 `<data_dir>/backups/`，并应用保留策略。
/// 当前数据文件不存在时报错，避免生成无意义的空备份。
pub fn create_backup(app_data_dir: &Path) -> Result<BackupInfo, String> {
    let src = data_file_path(app_data_dir);
    if !src.exists() { return Err("当前数据文件不存在，无法备份".to_string()); }
    let dir = backup_dir(app_data_dir);
    let target = unique_backup_path(&dir);
    copy_atomic(&src, &target)?;
    prune_old_backups(&dir);
    backup_info(&target).ok_or_else(|| "备份已写入但读取信息失败".to_string())
}

/// 恢复备份：先校验目标真实位于 `backups/` 内（拒绝 `../` 穿越与目录外绝对路径），
/// 再把当前数据快照进备份目录，最后用校验通过的备份内容原子覆盖当前数据文件。
pub fn restore_backup(app_data_dir: &Path, target: &Path) -> Result<AppData, String> {
    let dir = backup_dir(app_data_dir);
    let canonical_dir = fs::canonicalize(&dir).map_err(|e| format!("备份目录不可用：{}", e))?;
    let canonical_target = fs::canonicalize(target).map_err(|e| format!("备份文件不存在：{}", e))?;
    if !crate::favicon::path_is_within(&canonical_dir, &canonical_target) {
        return Err("恢复失败：目标不在备份目录内".to_string());
    }
    let text = fs::read_to_string(&canonical_target).map_err(|e| format!("读取备份失败：{}", e))?;
    let incoming: AppData = serde_json::from_str(&text).map_err(|e| format!("备份内容解析失败：{}", e))?;
    let current = data_file_path(app_data_dir);
    if current.exists() {
        let snapshot = unique_backup_path(&dir);
        copy_atomic(&current, &snapshot)?;
        prune_old_backups(&dir);
    }
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

/// 解析开头合法的 scheme（首字符 ASCII 字母，其余为字母/数字/`+`/`-`/`.`，且必须紧跟 `://`）。
/// 规则与前端 `/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//` 一致；不符合时整体走「无 scheme」回退路径。
fn split_scheme(before_hash: &str) -> Option<(&str, &str)> {
    let idx = before_hash.find("://")?;
    let candidate = &before_hash[..idx];
    let mut chars = candidate.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic()
            && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')) =>
        {
            Some((candidate, &before_hash[idx + 3..]))
        }
        _ => None,
    }
}

/// 统一 URL 归一化：scheme/host 小写、空端口视为无端口、去默认端口、折叠多余斜杠并去尾斜杠、丢弃 fragment。
/// 与前端 `src/store/app.ts` 的 `normalizeUrl` 保持同语义。
pub fn normalize_url(url: &str) -> String {
    let trimmed = url.trim();
    let before_hash = match trimmed.find('#') {
        Some(i) => &trimmed[..i],
        None => trimmed,
    };
    let (scheme, rest) = match split_scheme(before_hash) {
        Some((s, r)) => (s.to_lowercase(), r),
        None => return before_hash.to_lowercase().trim_end_matches('/').to_string(),
    };

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
    // `host:` 等价于 `host`：空端口按无端口处理（与前端一致）。
    let port = port.filter(|p| !p.is_empty());
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
            // 导入合并策略：名称/分类按 incoming 更新，标签并入 existing（并集、去重），
            // 备注保持 existing 原值（设计文档要求已存在站点保留现有 note）。
            // 手动「合并到所选」（`store/app.ts` 的 `mergeDuplicateGroup`）为标签并集 + 备注追加。
            existing.name = s.name.clone();
            if target_cat.is_some() { existing.category_id = target_cat.clone(); }
            for t in &s.tags {
                if !existing.tags.contains(t) {
                    existing.tags.push(t.clone());
                }
            }
        } else {
            current.sites.push(Site {
                id: s.id.clone(), name: s.name.clone(), url: s.url.clone(),
                category_id: target_cat, tags: s.tags.clone(),
                status: "unknown".into(), last_check: None,
                note: s.note.clone(),
                favicon_path: s.favicon_path.clone(),
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
            favicon_path: None,
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
        data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "".into(), favicon_path: None });
        save_data(&d, &data).unwrap();
        let mut fresh = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        fresh.sites.push(Site { id: "s2".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "".into(), favicon_path: None });
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
            favicon_path: None,
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
        assert_eq!(data.sites[0].favicon_path, None, "旧数据缺少 faviconPath 时应为 None");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn site_favicon_path_roundtrip() {
        let d = tmp_dir("favicon_rt");
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site {
            id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
            category_id: None, tags: vec![], status: "ok".into(), last_check: None,
            note: "".into(), favicon_path: Some("C:/data/favicons/abc.png".into()),
        });
        save_data(&d, &data).unwrap();
        let loaded = load_data(&d);
        assert_eq!(loaded.sites[0].favicon_path.as_deref(), Some("C:/data/favicons/abc.png"));
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
    fn normalize_url_empty_port_equals_no_port_and_scheme_rules_match_frontend() {
        // 与前端 `normalizeUrl` 的等价性回归：空端口视为无端口。
        assert_eq!(normalize_url("https://a.dev:/path"), normalize_url("https://a.dev/path"));
        assert_eq!(normalize_url("https://a.dev:/path"), "https://a.dev/path");
        assert_eq!(normalize_url("https://[::1]:/path"), normalize_url("https://[::1]/path"));
        // scheme 非法（首字符非字母 / 含下划线）时整体走「无 scheme」回退路径。
        assert_eq!(normalize_url("1http://x"), "1http://x");
        assert_eq!(normalize_url("a_b://x"), "a_b://x");
    }

    #[test]
    fn merge_treats_case_and_trailing_slash_variants_as_same_url() {
        let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "已有备注".into(), favicon_path: None });
        let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        incoming.sites.push(Site { id: "x".into(), name: "A2".into(), url: "HTTPS://A.dev/".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "incoming".into(), favicon_path: None });
        merge_into(&mut current, &incoming);
        assert_eq!(current.sites.len(), 1, "大小写/尾斜杠不同的等价 URL 应合并而非新增");
        assert_eq!(current.sites[0].name, "A2", "名称更新为导入值");
        assert_eq!(current.sites[0].note, "已有备注", "保留现有备注");
    }

    #[test]
    fn merge_unions_incoming_tags_and_keeps_existing_note() {
        let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec!["框架".into()], status: "ok".into(), last_check: None, note: "已有备注".into(), favicon_path: None });
        let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        incoming.sites.push(Site { id: "x".into(), name: "A2".into(), url: "https://a.dev/".into(), category_id: None, tags: vec!["工具".into(), "框架".into()], status: "unknown".into(), last_check: None, note: "incoming".into(), favicon_path: None });
        merge_into(&mut current, &incoming);
        assert_eq!(current.sites.len(), 1);
        assert_eq!(current.sites[0].tags, vec!["框架".to_string(), "工具".to_string()], "标签取并集");
        assert_eq!(current.sites[0].note, "已有备注", "导入合并不覆盖现有备注");
    }

    fn backup_sample(site_name: &str) -> AppData {
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site {
            id: "s1".into(), name: site_name.into(), url: "https://a.dev".into(),
            category_id: None, tags: vec![], status: "ok".into(), last_check: None,
            note: "".into(), favicon_path: None,
        });
        data
    }

    fn read_backup_json(path: &Path) -> AppData {
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn backup_list_empty_when_dir_missing() {
        let d = tmp_dir("bk_list_missing");
        assert!(list_backups(&d).is_empty());
    }

    #[test]
    fn backup_list_ignores_non_backup_files() {
        let d = tmp_dir("bk_list_filter");
        save_data(&d, &backup_sample("A")).unwrap();
        create_backup(&d).unwrap();
        let dir = d.join("backups");
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        fs::create_dir_all(dir.join("backup-dir.json")).unwrap();
        let list = list_backups(&d);
        assert_eq!(list.len(), 1, "只统计 backup-*.json 普通文件");
    }

    #[test]
    fn backup_create_copies_file_and_lists_desc() {
        let d = tmp_dir("bk_create");
        save_data(&d, &backup_sample("A")).unwrap();
        let first = create_backup(&d).unwrap();
        let second = create_backup(&d).unwrap();
        assert_ne!(first.path, second.path, "同秒创建也不应覆盖");
        let list = list_backups(&d);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].file_name, second.file_name, "最新备份应排在最前");
        assert_eq!(list[1].file_name, first.file_name);
        for info in &list {
            assert!(Path::new(&info.path).exists());
            assert_eq!(info.size, fs::metadata(data_file_path(&d)).unwrap().len());
            assert!(info.created_at > 0);
        }
        assert_eq!(read_backup_json(Path::new(&second.path)).sites[0].name, "A");
    }

    #[test]
    fn backup_create_fails_without_data_file() {
        let d = tmp_dir("bk_nodata");
        let err = create_backup(&d).unwrap_err();
        assert!(err.contains("不存在"));
        assert!(list_backups(&d).is_empty());
    }

    #[test]
    fn backup_restore_replaces_data_and_snapshots_current() {
        let d = tmp_dir("bk_restore");
        save_data(&d, &backup_sample("A")).unwrap();
        let bk = create_backup(&d).unwrap();
        save_data(&d, &backup_sample("B")).unwrap();
        let restored = restore_backup(&d, Path::new(&bk.path)).unwrap();
        assert_eq!(restored.sites[0].name, "A");
        assert_eq!(load_data(&d).sites[0].name, "A", "恢复后磁盘数据应为备份内容");
        let list = list_backups(&d);
        assert_eq!(list.len(), 2, "恢复前应先把当前数据快照进备份目录");
        let names: Vec<String> = list.iter()
            .map(|i| read_backup_json(Path::new(&i.path)).sites[0].name.clone())
            .collect();
        assert!(names.contains(&"A".to_string()) && names.contains(&"B".to_string()));
    }

    #[test]
    fn backup_restore_rejects_paths_outside_backup_dir() {
        let d = tmp_dir("bk_trav");
        save_data(&d, &backup_sample("A")).unwrap();
        create_backup(&d).unwrap();
        let outside = d.join("outside.json");
        export_json_to_path(&backup_sample("X"), &outside).unwrap();
        let err = restore_backup(&d, &outside).unwrap_err();
        assert!(err.contains("备份目录"), "目录外绝对路径应被拒绝：{}", err);
        let traversal = d.join("backups").join("../outside.json");
        assert!(restore_backup(&d, &traversal).is_err(), "../ 穿越到目录外应被拒绝");
        assert_eq!(load_data(&d).sites[0].name, "A", "拒绝后数据不应变化");
    }

    #[test]
    fn backup_restore_rejects_invalid_json() {
        let d = tmp_dir("bk_bad");
        save_data(&d, &backup_sample("A")).unwrap();
        create_backup(&d).unwrap();
        let bad = d.join("backups").join("backup-20260101-000000.json");
        fs::write(&bad, "{ not json").unwrap();
        let err = restore_backup(&d, &bad).unwrap_err();
        assert!(err.contains("解析失败"));
        assert_eq!(load_data(&d).sites[0].name, "A", "无效备份不应覆盖当前数据");
    }

    #[test]
    fn backup_retention_keeps_newest_ten() {
        let d = tmp_dir("bk_prune");
        save_data(&d, &backup_sample("A")).unwrap();
        let mut names = Vec::new();
        for _ in 0..12 {
            names.push(create_backup(&d).unwrap().file_name);
        }
        let list = list_backups(&d);
        assert_eq!(list.len(), 10, "默认最多保留 10 份");
        let listed: Vec<&str> = list.iter().map(|i| i.file_name.as_str()).collect();
        assert!(!listed.contains(&names[0].as_str()), "最早的两份应被删除");
        assert!(!listed.contains(&names[1].as_str()));
        assert!(listed.contains(&names[11].as_str()), "最新一份必须保留");
    }

    #[test]
    fn backup_restore_snapshot_respects_retention() {
        let d = tmp_dir("bk_restore_prune");
        save_data(&d, &backup_sample("A")).unwrap();
        for _ in 0..10 { create_backup(&d).unwrap(); }
        let oldest_before = list_backups(&d).last().unwrap().file_name.clone();
        let target = list_backups(&d).last().unwrap().path.clone();
        save_data(&d, &backup_sample("B")).unwrap();
        restore_backup(&d, Path::new(&target)).unwrap();
        let list = list_backups(&d);
        assert_eq!(list.len(), 10, "恢复产生快照后仍受保留上限约束");
        assert!(!list.iter().any(|i| i.file_name == oldest_before), "超限时最旧快照应被删除");
    }

    #[test]
    fn merge_keeps_existing_note_and_copies_new() {
        let mut current = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        current.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "已有备注".into(), favicon_path: None });
        let mut incoming = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        incoming.sites.push(Site { id: "x".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "incoming 备注".into(), favicon_path: None });
        incoming.sites.push(Site { id: "y".into(), name: "B".into(), url: "https://b.dev".into(), category_id: None, tags: vec![], status: "unknown".into(), last_check: None, note: "新站点备注".into(), favicon_path: None });
        merge_into(&mut current, &incoming);
        assert_eq!(current.sites[0].note, "已有备注", "已存在站点保留原备注");
        assert_eq!(current.sites[1].note, "新站点备注", "新站点拷贝备注");
    }
}
