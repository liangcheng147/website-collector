use crate::data::{AppData, Category, Site};

pub fn export_to_md(data: &AppData) -> String {
    let mut out = String::new();
    fn walk(cats: &[Category], data: &AppData, out: &mut String, depth: usize) {
        for c in cats {
            out.push_str(&format!("{} {}\n", "#".repeat(depth), c.name));
            for s in data.sites.iter().filter(|s| s.category_id.as_deref() == Some(&c.id)) {
                out.push_str(&site_line(s));
            }
            walk(&c.children, data, out, depth + 1);
            out.push('\n');
        }
    }
    walk(&data.categories, data, &mut out, 1);
    out
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
        } else if let Some(rest) = line.strip_prefix('-') {
            let rest = rest.trim();
            if let (Some(ns), Some(ne)) = (rest.find('['), rest.find(']')) {
                let name = rest[ns + 1..ne].to_string();
                let tail = &rest[ne + 1..];
                if let (Some(us), Some(ue)) = (tail.find('('), tail.find(')')) {
                    let url = tail[us + 1..ue].trim().to_string();
                    let category_id = heading_stack.last().map(|&(_, i)| format!("c{}", i));
                    sites.push(Site {
                        id: format!("s{}", site_seq),
                        name, url, category_id,
                        tags: vec![], status: "unknown".into(), last_check: None,
                    });
                    site_seq += 1;
                }
            }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{AppData, Category, Site};

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
            }],
            recycle_bin: vec![], tags: vec![],
        };
        let md = export_to_md(&data);
        assert!(md.contains("# 开发工具"));
        assert!(md.contains("## 前端"));
        assert!(md.contains("- [React](https://react.dev) ✅ 2026-08-15"));
        assert!(!md.contains("框架"), "标签不应出现在 md 中");
    }

    #[test]
    fn import_ignores_status_and_tags() {
        let text = "# 开发工具\n## 前端\n- [React](https://react.dev) ✅ 2026-08-15\n- [Vue](https://vuejs.org) ❌ 2026-08-15\n";
        let data = import_from_md(text);
        assert_eq!(data.categories.len(), 1);
        assert_eq!(data.categories[0].children.len(), 1);
        assert_eq!(data.sites.len(), 2);
        assert_eq!(data.sites[0].status, "unknown");
        assert_eq!(data.sites[0].tags.len(), 0);
    }
}