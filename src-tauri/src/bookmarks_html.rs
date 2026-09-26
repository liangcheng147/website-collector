use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBookmarkSite {
    pub name: String,
    pub url: String,
    pub category_path: Vec<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBookmarks {
    pub sites: Vec<ParsedBookmarkSite>,
    pub categories: Vec<Vec<String>>,
}

pub fn parse_bookmarks_html(html: &str) -> Result<ParsedBookmarks, String> {
    use scraper::Html;

    let dom = Html::parse_fragment(html);
    let mut sites: Vec<ParsedBookmarkSite> = Vec::new();
    let mut categories: Vec<Vec<String>> = Vec::new();
    let mut seen_urls: std::collections::HashSet<String> = std::collections::HashSet::new();

    fn walk(node: scraper::ElementRef, path: &mut Vec<String>, sites: &mut Vec<ParsedBookmarkSite>, categories: &mut Vec<Vec<String>>, seen_urls: &mut std::collections::HashSet<String>) {
        for child in node.children() {
            let val = child.value();
            if let Some(_) = val.as_element() {
                if let Some(el_ref) = scraper::ElementRef::wrap(child) {
                    let el = el_ref.value();
                    let tag = el.name().to_lowercase();
                    if tag == "dt" {
                        let mut folder: Option<String> = None;
                        let mut link_name: Option<String> = None;
                        let mut link_url: Option<String> = None;
                        let mut has_dl = false;
                        for dt_child in el_ref.children() {
                            if let Some(_) = dt_child.value().as_element() {
                                if let Some(dt_el_ref) = scraper::ElementRef::wrap(dt_child) {
                                    let dt_el = dt_el_ref.value();
                                    let dt_tag = dt_el.name().to_lowercase();
                                    if dt_tag == "h3" && folder.is_none() {
                                        folder = Some(html_decode(&dt_el_ref.text().collect::<String>()));
                                    } else if dt_tag == "a" && link_url.is_none() {
                                        let href = dt_el.attr("href").unwrap_or("").to_string();
                                        if !href.is_empty() {
                                            let name = html_decode(&dt_el_ref.text().collect::<String>());
                                            link_name = Some(name);
                                            link_url = Some(href);
                                        }
                                    } else if dt_tag == "dl" {
                                        has_dl = true;
                                    }
                                }
                            }
                        }
                        if let Some(fname) = folder {
                            if has_dl {
                                let mut new_path = path.clone();
                                new_path.push(fname.clone());
                                if new_path.len() > 3 {
                                    new_path.truncate(3);
                                }
                                if !categories.iter().any(|c| c == &new_path) {
                                    categories.push(new_path.clone());
                                }
                                walk(el_ref, &mut new_path, sites, categories, seen_urls);
                            }
                        } else if let Some(url) = link_url {
                            if let Some(name) = link_name {
                                if seen_urls.insert(url.clone()) {
                                    let mut cat_path = path.clone();
                                    if cat_path.len() > 3 {
                                        cat_path.truncate(3);
                                    }
                                    sites.push(ParsedBookmarkSite { name, url, category_path: cat_path });
                                }
                            }
                        }
                    } else if tag == "dl" {
                        walk(el_ref, path, sites, categories, seen_urls);
                    } else {
                        walk(el_ref, path, sites, categories, seen_urls);
                    }
                }
            }
        }
    }

    let mut path: Vec<String> = Vec::new();
    walk(dom.root_element(), &mut path, &mut sites, &mut categories, &mut seen_urls);

    Ok(ParsedBookmarks { sites, categories })
}

pub fn to_app_data(parsed: &ParsedBookmarks, existing: &crate::data::AppData) -> crate::data::AppData {
    use crate::data::{AppData, Category, Site};

    let mut categories: Vec<Category> = Vec::new();

    for path in &parsed.categories {
        let mut current = &mut categories;
        for (i, name) in path.iter().enumerate() {
            if let Some(pos) = current.iter().position(|c| &c.name == name) {
                current = &mut current[pos].children;
            } else {
                let new_cat = Category {
                    id: format!("html_cat_{}_{}", i, name.replace(' ', "_")),
                    name: name.clone(),
                    children: vec![],
                };
                current.push(new_cat);
                let len = current.len();
                current = &mut current[len - 1].children;
            }
        }
    }

    fn find_category_id(cats: &[Category], path: &[String]) -> Option<String> {
        if path.is_empty() {
            return None;
        }
        for cat in cats {
            if cat.name == path[0] {
                if path.len() == 1 {
                    return Some(cat.id.clone());
                }
                if let Some(id) = find_category_id(&cat.children, &path[1..]) {
                    return Some(id);
                }
            }
        }
        None
    }

    let base_seq = existing.sites.len();
    let sites: Vec<Site> = parsed.sites.iter().enumerate().map(|(i, s)| {
        let category_id = find_category_id(&categories, &s.category_path);
        Site {
            id: format!("hs{}", base_seq + i),
            name: s.name.clone(),
            url: s.url.clone(),
            category_id,
            tags: vec![],
            status: "unknown".into(),
            last_check: None,
            note: "".into(),
        }
    }).collect();

    let mut all_sites = existing.sites.clone();
    all_sites.extend(sites);

    AppData {
        version: existing.version,
        categories,
        sites: all_sites,
        recycle_bin: vec![],
        tags: vec![],
    }
}

pub fn export_bookmarks_html(data: &crate::data::AppData) -> String {
    let mut out = String::new();
    out.push_str("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n");
    out.push_str("<!-- This is an automatically generated file.\n");
    out.push_str("     It will be read and overwritten.\n");
    out.push_str("     DO NOT EDIT! -->\n");
    out.push_str("<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n");
    out.push_str("<TITLE>Bookmarks</TITLE>\n");
    out.push_str("<H1>Bookmarks</H1>\n");
    out.push_str("<DL><p>\n");

    fn collect_cat_display_paths(data: &crate::data::AppData) -> std::collections::HashMap<String, String> {
        let mut map = std::collections::HashMap::new();
        fn walk(cats: &[crate::data::Category], parent_names: &[String], map: &mut std::collections::HashMap<String, String>) {
            for cat in cats {
                let mut path = parent_names.to_vec();
                path.push(cat.name.clone());
                let display = path.join(">");
                map.insert(cat.id.clone(), display.clone());
                let pass_on = if path.len() > 3 { path[..3].to_vec() } else { path };
                walk(&cat.children, &pass_on, map);
            }
        }
        walk(&data.categories, &[], &mut map);
        map
    }

    let cat_map = collect_cat_display_paths(data);
    let mut grouped: std::collections::BTreeMap<String, Vec<&crate::data::Site>> = std::collections::BTreeMap::new();
    for site in &data.sites {
        let path_key = match &site.category_id {
            Some(cid) => cat_map.get(cid).cloned().unwrap_or_default(),
            None => String::new(),
        };
        grouped.entry(path_key).or_insert_with(Vec::new).push(site);
    }

    fn path_components(key: &str) -> Vec<String> {
        if key.is_empty() { vec![] } else { key.split('>').map(String::from).collect() }
    }

    fn write_group(
        out: &mut String,
        grouped: &std::collections::BTreeMap<String, Vec<&crate::data::Site>>,
        path: &[String],
        depth: usize,
    ) {
        let key = path.join(">");
        if let Some(sites) = grouped.get(&key) {
            for site in sites {
                let indent = "    ".repeat(depth + 1);
                out.push_str(&format!("{}<DT><A HREF=\"{}\">{}</A>\n", indent, html_encode(&site.url), html_encode(&site.name)));
            }
        }
        let mut child_folders: Vec<String> = Vec::new();
        for gkey in grouped.keys() {
            let comps = path_components(gkey);
            if comps.starts_with(path) && comps.len() > path.len() {
                let child_name = comps[path.len()].clone();
                if !child_folders.contains(&child_name) {
                    child_folders.push(child_name);
                }
            }
        }
        for child_name in child_folders {
            let indent = "    ".repeat(depth + 1);
            out.push_str(&format!("{}<DT><H3>{}</H3>\n", indent, html_encode(&child_name)));
            let child_indent = "    ".repeat(depth + 1);
            out.push_str(&format!("{}<DL><p>\n", child_indent));
            let mut child_path = path.to_vec();
            child_path.push(child_name);
            write_group(out, grouped, &child_path, depth + 1);
            out.push_str(&format!("{}</DL><p>\n", child_indent));
        }
    }

    write_group(&mut out, &grouped, &[], 0);
    out.push_str("</DL>\n");
    out
}

fn html_decode(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

fn html_encode(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_bookmarks() {
        let html = "<DL><p>\n    <DT><H3>开发工具</H3>\n    <DL><p>\n        <DT><A HREF=\"https://react.dev\">React</A>\n        <DT><A HREF=\"https://vuejs.org\">Vue</A>\n    </DL><p>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 2);
        assert_eq!(result.sites[0].name, "React");
        assert_eq!(result.sites[0].url, "https://react.dev");
        assert_eq!(result.sites[0].category_path, vec!["开发工具"]);
        assert_eq!(result.sites[1].name, "Vue");
        assert_eq!(result.sites[1].url, "https://vuejs.org");
        assert_eq!(result.sites[1].category_path, vec!["开发工具"]);
    }

    #[test]
    fn parse_nested_folders() {
        let html = "<DL><p>\n    <DT><H3>技术</H3>\n    <DL><p>\n        <DT><H3>前端</H3>\n        <DL><p>\n            <DT><A HREF=\"https://react.dev\">React</A>\n        </DL><p>\n    </DL><p>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 1);
        assert_eq!(result.sites[0].category_path, vec!["技术", "前端"]);
        assert_eq!(result.categories.len(), 2);
    }

    #[test]
    fn parse_flatten_depth_beyond_3() {
        let html = "<DL><p>\n    <DT><H3>A</H3>\n    <DL><p>\n        <DT><H3>B</H3>\n        <DL><p>\n            <DT><H3>C</H3>\n            <DL><p>\n                <DT><H3>D</H3>\n                <DL><p>\n                    <DT><A HREF=\"https://deep.dev\">Deep Site</A>\n                </DL><p>\n            </DL><p>\n        </DL><p>\n    </DL><p>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 1);
        assert_eq!(result.sites[0].category_path, vec!["A", "B", "C"]);
    }

    #[test]
    fn parse_duplicate_urls_keep_first() {
        let html = "<DL><p>\n    <DT><H3>Folder1</H3>\n    <DL><p>\n        <DT><A HREF=\"https://dup.com\">First</A>\n    </DL><p>\n    <DT><H3>Folder2</H3>\n    <DL><p>\n        <DT><A HREF=\"https://dup.com\">Second</A>\n    </DL><p>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 1);
        assert_eq!(result.sites[0].name, "First");
    }

    #[test]
    fn export_roundtrip() {
        let data = crate::data::AppData {
            version: 1,
            categories: vec![crate::data::Category {
                id: "c1".into(), name: "开发".into(),
                children: vec![crate::data::Category { id: "c2".into(), name: "前端".into(), children: vec![] }],
            }],
            sites: vec![
                crate::data::Site {
                    id: "s1".into(), name: "React".into(), url: "https://react.dev".into(),
                    category_id: Some("c2".into()), tags: vec![], status: "ok".into(),
                    last_check: Some("2026-08-15".into()), note: "".into(),
                },
                crate::data::Site {
                    id: "s2".into(), name: "百度".into(), url: "https://baidu.com".into(),
                    category_id: None, tags: vec![], status: "ok".into(),
                    last_check: None, note: "".into(),
                },
            ],
            recycle_bin: vec![], tags: vec![],
        };
        let html = export_bookmarks_html(&data);
        assert!(html.contains("https://react.dev"));
        assert!(html.contains("React"));
        assert!(html.contains("https://baidu.com"));
        assert!(html.contains("百度"));
        assert!(html.contains("开发"));
        assert!(html.contains("前端"));
        assert!(html.contains("NETSCAPE-Bookmark-file-1"));
    }

    #[test]
    fn export_excludes_recycle_bin() {
        let data = crate::data::AppData {
            version: 1,
            categories: vec![],
            sites: vec![],
            recycle_bin: vec![crate::data::TrashedSite {
                site: crate::data::Site {
                    id: "s1".into(), name: "Deleted".into(), url: "https://deleted.com".into(),
                    category_id: None, tags: vec![], status: "ok".into(),
                    last_check: None, note: "".into(),
                },
                deleted_at: "2026-01-01".into(),
            }],
            tags: vec![],
        };
        let html = export_bookmarks_html(&data);
        assert!(!html.contains("deleted.com"));
        assert!(!html.contains("Deleted"));
    }

    #[test]
    fn parse_handles_html_entities() {
        let html = "<DL><p>\n    <DT><H3>AT&amp;T</H3>\n    <DL><p>\n        <DT><A HREF=\"https://att.com\">AT&amp;T Site</A>\n    </DL><p>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 1);
        assert_eq!(result.sites[0].name, "AT&T Site");
        assert_eq!(result.sites[0].category_path, vec!["AT&T"]);
    }

    #[test]
    fn parse_uncategorized_site() {
        let html = "<DL><p>\n    <DT><A HREF=\"https://root.com\">Root Site</A>\n</DL>\n";
        let result = parse_bookmarks_html(html).unwrap();
        assert_eq!(result.sites.len(), 1);
        assert_eq!(result.sites[0].name, "Root Site");
        assert!(result.sites[0].category_path.is_empty());
    }

    #[test]
    fn html_decode_handles_entities() {
        assert_eq!(html_decode("AT&amp;T"), "AT&T");
        assert_eq!(html_decode("a&lt;b"), "a<b");
        assert_eq!(html_decode("a&gt;b"), "a>b");
        assert_eq!(html_decode("&quot;hello&quot;"), "\"hello\"");
        assert_eq!(html_decode("&#39;hi&#39;"), "'hi'");
        assert_eq!(html_decode("&nbsp; "), "");
    }

    #[test]
    fn html_encode_escapes_special_chars() {
        assert_eq!(html_encode("AT&T"), "AT&amp;T");
        assert_eq!(html_encode("<tag>"), "&lt;tag&gt;");
        assert_eq!(html_encode("\"hello\""), "&quot;hello&quot;");
    }
}
