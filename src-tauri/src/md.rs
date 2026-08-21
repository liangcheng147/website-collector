use crate::data::{self, AppData, Category, Site};

pub fn export_to_md(data: &AppData) -> String {
    let mut out = String::new();
    fn walk(cats: &[Category], data: &AppData, out: &mut String, depth: usize) {
        for c in cats {
            out.push_str(&format!("{} {}\n", "#".repeat(depth), c.name));
            for s in data.sites.iter().filter(|s| s.category_id.as_deref() == Some(&c.id)) {
                out.push_str(&site_line(s));
                let note = s.note.trim().replace('\t', " ").replace('\n', " ").replace('\r', " ");
                if !note.is_empty() { out.push_str(&format!("  > {}\n", note)); }
            }
            walk(&c.children, data, out, depth + 1);
            out.push('\n');
        }
    }
    walk(&data.categories, data, &mut out, 1);
    out
}

fn parse_list_item(body: &str) -> Option<(String, String)> {
    if let Some(open) = body.find('[') {
        if let Some(rel) = body[open..].find("](") {
            let close = open + rel;
            let name = body[open + 1..close].trim().to_string();
            let rest = &body[close + 2..];
            if let Some(end) = rest.find(')') {
                let url = rest[..end].trim().to_string();
                return Some((name, url));
            }
        }
    }
    Some((body.to_string(), String::new()))
}

fn site_line(s: &Site) -> String {
    let mark = match (s.status.as_str(), &s.last_check) {
        ("ok", Some(d)) => format!(" ✅ {}", d),
        ("dead", Some(d)) => format!(" ❌ {}", d),
        _ => String::new(),
    };
    format!("- [{}]({}){}\n", s.name, s.url, mark)
}

pub fn import_from_md(text: &str) -> AppData {
    // 第一遍：收集扁平分类行与站点行
    struct FlatCat { name: String, parent: Option<usize> }
    let mut flat: Vec<FlatCat> = Vec::new();
    let mut sites: Vec<Site> = Vec::new();
    let mut heading_stack: Vec<(usize, usize)> = Vec::new(); // (depth, flat index)
    let mut site_seq = 0usize;
    let mut last_site: Option<usize> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() { continue; }
        if line.starts_with('#') {
            let depth = line.chars().take_while(|c| *c == '#').count();
            let name = line[depth..].trim().to_string();
            while let Some(&(d, _)) = heading_stack.last() { if d >= depth { heading_stack.pop(); } else { break; } }
            let parent = heading_stack.last().map(|&(_, i)| i);
            let idx = flat.len();
            flat.push(FlatCat { name, parent });
            heading_stack.push((depth, idx));
            last_site = None;
        } else if let Some(body) = line.strip_prefix(['-', '*', '+']).map(|b| b.trim()) {
            if let Some((name, url)) = parse_list_item(body) {
                if !url.is_empty() {
                let category_id = heading_stack.last().map(|&(_, i)| format!("c{}", i));
                sites.push(Site {
                    id: format!("s{}", site_seq),
                    name, url, category_id,
                    tags: vec![], status: "unknown".into(), last_check: None,
                    note: "".into(),
                });
                site_seq += 1;
                last_site = Some(sites.len() - 1);
            }
            }
        } else if let Some(note_text) = line.strip_prefix('>') {
            let note = note_text.trim();
            if let Some(idx) = last_site { if !note.is_empty() { sites[idx].note = note.to_string(); } }
        }
    }

    // 第二遍：按 parent 索引建树。id 采用其在 flat 中的下标，保证映射稳定。
    fn build(cats: &[FlatCat], parent: Option<usize>) -> Vec<Category> {
        cats.iter().enumerate()
            .filter(|(_, c)| c.parent == parent)
            .map(|(idx, c)| Category {
                id: format!("c{}", idx),
                name: c.name.clone(),
                children: build(cats, Some(idx)),
            })
            .collect()
    }

    let categories = build(&flat, None);
    AppData { version: 1, categories, sites, recycle_bin: vec![], tags: vec![] }
}

pub fn export_md_to_path(data: &AppData, path: &std::path::Path) -> Result<(), String> {
    std::fs::write(path, export_to_md(data)).map_err(|e| e.to_string())
}

pub fn import_md_from_path(app_data_dir: &std::path::Path, path: &std::path::Path, mode: &str) -> Result<AppData, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let incoming = import_from_md(&text);
    let mut current = data::load_data(app_data_dir);
    match mode {
        "overwrite" => { data::backup_data_file(app_data_dir)?; data::save_data(app_data_dir, &incoming)?; Ok(incoming) }
        "merge" => { data::merge_into(&mut current, &incoming); data::save_data(app_data_dir, &current)?; Ok(current) }
        _ => Err("mode must be overwrite or merge".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
use crate::data::{self, AppData, Category, Site};

    #[test]
    fn export_roundtrip_preserves_structure() {
        let data = AppData {
            version: 1,
            categories: vec![Category {
                id: "c1".into(), name: "开发工具".into(),
                children: vec![Category { id: "c2".into(), name: "前端".into(), children: vec![] }],
            }],
            sites: vec![Site {
                id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
                category_id: Some("c2".into()), tags: vec!["框架".into()],
                status: "ok".into(), last_check: Some("2026-08-15".into()),
                note: "React 官方文档与教程站".into(),
            }],
            recycle_bin: vec![], tags: vec![],
        };
        let md = export_to_md(&data);
        assert!(md.contains("# 开发工具"));
        assert!(md.contains("## 前端"));
        assert!(md.contains("- [React](https://react.dev) ✅ 2026-08-15"));
        assert!(md.contains("  > React 官方文档与教程站"));
        assert!(!md.contains("框架"), "标签不应出现在 md 中");
    }

    #[test]
    fn export_import_note_roundtrip() {
        let data = AppData {
            version: 1,
            categories: vec![Category {
                id: "c1".into(), name: "开发工具".into(), children: vec![],
            }],
            sites: vec![Site {
                id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
                category_id: Some("c1".into()), tags: vec![],
                status: "ok".into(), last_check: Some("2026-08-15".into()),
                note: "React 官方文档与教程站".into(),
            }],
            recycle_bin: vec![], tags: vec![],
        };
        let md = export_to_md(&data);
        let back = import_from_md(&md);
        assert_eq!(back.sites.len(), 1);
        assert_eq!(back.sites[0].note, "React 官方文档与教程站", "导出的两格缩进备注应能原样导回");
    }

    #[test]
    fn import_ignores_status_and_tags() {
        let text = "# 开发工具\n## 前端\n- [React](https://react.dev) ✅ 2026-08-15\n> React 官方文档与教程站\n- [Vue](https://vuejs.org) ❌ 2026-08-15\n";
        let data = import_from_md(text);
        assert_eq!(data.categories.len(), 1);
        assert_eq!(data.categories[0].children.len(), 1);
        assert_eq!(data.sites.len(), 2);
        assert_eq!(data.sites[0].status, "unknown");
        assert_eq!(data.sites[0].tags.len(), 0);
        assert_eq!(data.sites[0].note, "React 官方文档与教程站");
        assert_eq!(data.sites[1].note, "");
    }

    #[test]
    fn export_sanitizes_note_tabs_and_newlines() {
        let data = AppData {
            version: 1,
            categories: vec![Category { id: "c1".into(), name: "开发".into(), children: vec![] }],
            sites: vec![Site {
                id: "s1".into(), name: "A".into(), url: "https://a.dev".into(),
                category_id: Some("c1".into()), tags: vec![], status: "ok".into(),
                last_check: Some("2026-08-15".into()), note: "多\t列\n换行\r备注".into(),
            }],
            recycle_bin: vec![], tags: vec![],
        };
        let md = export_to_md(&data);
        assert!(md.contains("  > 多 列 换行 备注"));
        assert!(!md.contains("> 多\t列"), "备注中的 tab 已被替换为空格");
    }

    #[test]
    fn import_note_binding_stops_at_heading() {
        let text = "# 开发\n- [A](https://a.dev)\n> A 的备注\n# 资讯\n> 游离备注不应被读入\n- [B](https://b.dev)\n";
        let data = import_from_md(text);
        assert_eq!(data.sites[0].note, "A 的备注");
        assert_eq!(data.sites[1].note, "");
    }

    #[test]
    fn export_md_to_file_writes() {
        let d = std::env::temp_dir().join(format!("md_export_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        let out = d.join("out.md");
        export_md_to_path(&data, &out).unwrap();
        assert!(out.exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn import_md_from_file_overwrite_backs_up() {
        let d = std::env::temp_dir().join(format!("md_import_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let mut data = AppData { version: 1, categories: vec![], sites: vec![], recycle_bin: vec![], tags: vec![] };
        data.sites.push(Site { id: "s1".into(), name: "A".into(), url: "https://a.dev".into(), category_id: None, tags: vec![], status: "ok".into(), last_check: None, note: "".into() });
        data::save_data(&d, &data).unwrap();
        let in_path = d.join("in.md");
        std::fs::write(&in_path, "# 新分类\n- [X](https://x.dev)\n").unwrap();
        let back = import_md_from_path(&d, &in_path, "overwrite").unwrap();
        assert_eq!(back.sites.len(), 1);
        assert_eq!(back.sites[0].name, "X");
        assert!(data::data_file_path(&d).with_extension("json.bak").exists());
        let _ = std::fs::remove_dir_all(&d);
    }
}