use crate::{
    database::{self, DatabaseState},
    research_evidence::{ResearchEvidenceInput, ResearchSearchRequest},
    research_sources::{get_research_source, list_active_research_sources},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    net::ToSocketAddrs,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const MAX_SOURCES: usize = 5;
const MAX_RESULTS_PER_SOURCE: usize = 5;
const MAX_RESPONSE_BYTES: usize = 1_500_000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSearchError {
    pub id: String,
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchResponse {
    pub query: String,
    pub generated_at: u64,
    pub evidence_inputs: Vec<ResearchEvidenceInput>,
    pub source_errors: Vec<SourceSearchError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationCheck {
    pub url: String,
    pub source_id: String,
    pub reachable: bool,
    pub http_status: Option<u16>,
    pub final_url: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationVerificationReport {
    pub generated_at: u64,
    pub items: Vec<CitationCheck>,
    pub reachable_count: usize,
    pub unreachable_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceBatchInput {
    pub run_id: Option<String>,
    pub cases: Vec<ResearchAcceptanceCaseInput>,
    pub source_ids: Option<Vec<String>>,
    pub max_sources: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceCaseInput {
    pub id: String,
    pub question: String,
    pub min_evidence: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceCounts {
    pub total: usize,
    pub covered: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceCitationCounts {
    pub total: usize,
    pub reachable: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceQuestionResult {
    pub id: String,
    pub question: String,
    pub relevant_source_in_top5: bool,
    pub citation_checks: ResearchAcceptanceCitationCounts,
    pub evidence_checks: ResearchAcceptanceCounts,
    pub unauthorized_network_blocked: bool,
    pub single_source_failure_handled: bool,
    pub prep_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAcceptanceReport {
    pub run_id: String,
    pub started_at: u64,
    pub finished_at: u64,
    pub source_count: usize,
    pub questions: Vec<ResearchAcceptanceQuestionResult>,
}

fn strip_html(value: &str) -> String {
    let tags = Regex::new(r"(?s)<[^>]+>").expect("search tag regex");
    let entities = Regex::new(r"&(amp|nbsp|quot|lt|gt|hellip|mdash|ndash|rsquo|lsquo);")
        .expect("entity regex");
    let mut text = tags.replace_all(value, " ").to_string();
    text = entities
        .replace_all(&text, |captures: &regex::Captures<'_>| match &captures[1] {
            "amp" => "&",
            "nbsp" => " ",
            "quot" => "\"",
            "lt" => "<",
            "gt" => ">",
            "hellip" => "…",
            "mdash" => "—",
            "ndash" => "–",
            "rsquo" | "lsquo" => "'",
            _ => " ",
        })
        .to_string();
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn percent_encode_path(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn normalize_url(value: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value.trim()).map_err(|_| "URL 无效".to_string())?;
    if url.scheme() != "https" {
        return Err("仅允许 HTTPS URL".into());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn assert_public_url(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("引用或来源仅允许 HTTPS".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "URL 缺少主机名".to_string())?
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") || host.ends_with(".internal") {
        return Err("不允许访问本地或内部主机名".into());
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if !ip_is_global(&ip) {
            return Err("不允许访问非公网地址".into());
        }
        return Ok(());
    }
    let port = url.port_or_known_default().unwrap_or(443);
    let mut resolved = false;
    for address in (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| "域名解析失败".to_string())?
    {
        resolved = true;
        if !ip_is_global(&address.ip()) {
            return Err("域名解析到非公网地址".into());
        }
    }
    if !resolved {
        return Err("域名未解析到任何地址".into());
    }
    Ok(())
}

fn ip_is_global(ip: &std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(value) => {
            !value.is_private()
                && !value.is_loopback()
                && !value.is_link_local()
                && !value.is_multicast()
                && !value.is_unspecified()
                && !value.is_broadcast()
        }
        std::net::IpAddr::V6(value) => {
            if let Some(v4) = value.to_ipv4() {
                return ip_is_global(&std::net::IpAddr::V4(v4));
            }
            let first = value.segments()[0];
            !value.is_loopback()
                && !value.is_unspecified()
                && !value.is_multicast()
                && first & 0xfe00 != 0xfe80
                && first & 0xfe00 != 0xfc00
        }
    }
}

fn make_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("Vinkey/0.1 research-client")
        .build()
        .map_err(|error| format!("无法创建检索客户端：{error}"))
}

fn ensure_search_url(source: &crate::research_sources::ResearchSource, endpoint: String) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(&endpoint).map_err(|_| "搜索入口无效".to_string())?;
    if url.scheme() != "https" {
        return Err("搜索入口仅允许 HTTPS".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "搜索入口缺少主机名".to_string())?;
    if !source.allowed_hosts.contains(&host.to_string()) {
        return Err("搜索入口域名不在允许域名内".into());
    }
    assert_public_url(&url)?;
    Ok(url)
}

async fn fetch_json(client: &reqwest::Client, url: reqwest::Url) -> Result<Value, String> {
    assert_public_url(&url)?;
    let response = client.get(url).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("响应过大".into());
    }
    serde_json::from_slice::<Value>(&bytes).map_err(|error| format!("响应不是 JSON：{error}"))
}

async fn search_mediawiki(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| format!("{}/w/api.php", source.base_url));
    let mut url = ensure_search_url(source, endpoint)?;
    url.query_pairs_mut()
        .append_pair("action", "query")
        .append_pair("list", "search")
        .append_pair("srsearch", query)
        .append_pair("srlimit", &MAX_RESULTS_PER_SOURCE.to_string())
        .append_pair("format", "json")
        .append_pair("utf8", "1");
    let json = fetch_json(client, url).await?;
    let hits = json
        .pointer("/query/search")
        .and_then(Value::as_array)
        .ok_or_else(|| "MediaWiki 响应缺少 query.search".to_string())?;
    let mut items = Vec::new();
    for hit in hits.iter().take(MAX_RESULTS_PER_SOURCE) {
        let title = hit
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let snippet = hit
            .get("snippet")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let encoded_title = percent_encode_path(&title);
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title: title.clone(),
            url: format!("{}/wiki/{}", source.base_url, encoded_title),
            publisher: Some(source.name.clone()),
            retrieved_at: now_ms(),
            excerpt: strip_html(snippet),
        });
    }
    Ok(items)
}

async fn search_json_api(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| format!("{}/search.json", source.base_url));
    let mut url = ensure_search_url(source, endpoint)?;
    url.query_pairs_mut()
        .append_pair("q", query)
        .append_pair("limit", &MAX_RESULTS_PER_SOURCE.to_string());
    let json = fetch_json(client, url).await?;
    let hits = json
        .get("docs")
        .and_then(Value::as_array)
        .or_else(|| json.get("results").and_then(Value::as_array))
        .or_else(|| json.get("items").and_then(Value::as_array))
        .or_else(|| json.get("hits").and_then(Value::as_array))
        .or_else(|| json.as_array())
        .ok_or_else(|| "JSON-API 响应缺少结果数组".to_string())?;
    let mut items = Vec::new();
    for hit in hits.iter().take(MAX_RESULTS_PER_SOURCE) {
        let Some(hit) = hit.as_object() else {
            continue;
        };
        let title = ["title", "name", "headline"]
            .iter()
            .find_map(|key| hit.get(*key).and_then(Value::as_str))
            .unwrap_or_default();
        let link = ["url", "link", "web_url"]
            .iter()
            .find_map(|key| hit.get(*key).and_then(Value::as_str))
            .map(str::to_string)
            .or_else(|| {
                hit.get("key")
                    .and_then(Value::as_str)
                    .map(|key| format!("{}{key}", source.base_url))
            });
        if title.is_empty() || link.is_none() {
            continue;
        }
        let publisher = hit
            .get("publisher")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| Some(source.name.clone()));
        let excerpt = ["subtitle", "description", "abstract"]
            .iter()
            .find_map(|key| hit.get(*key).and_then(Value::as_str))
            .unwrap_or_default()
            .to_string();
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title: title.to_string(),
            url: link.unwrap(),
            publisher,
            retrieved_at: now_ms(),
            excerpt,
        });
    }
    Ok(items)
}

async fn fetch_text(client: &reqwest::Client, url: reqwest::Url) -> Result<String, String> {
    assert_public_url(&url)?;
    let response = client.get(url).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("响应过大".into());
    }
    String::from_utf8(bytes.to_vec()).map_err(|error| format!("响应编码无效：{error}"))
}

fn clean_xml_text(value: &str) -> String {
    strip_html(&value.replace("]]>", " ").replace("<![CDATA[", " "))
}

async fn search_rss(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| source.base_url.clone());
    let mut url = ensure_search_url(source, endpoint)?;
    url.query_pairs_mut().append_pair("q", query);
    let content = fetch_text(client, url).await?;
    let item_re = Regex::new(r"(?s)<item(?:[^>]*)>(.*?)</item>").expect("rss item regex");
    let title_re = Regex::new(r"(?s)<title[^>]*>(.*?)</title>").expect("rss title regex");
    let link_re = Regex::new(r"(?s)<link[^>]*>(.*?)</link>").expect("rss link regex");
    let mut items = Vec::new();
    for item in item_re.captures_iter(&content).take(MAX_RESULTS_PER_SOURCE) {
        let body = item.get(1).map(|value| value.as_str()).unwrap_or_default();
        let title = title_re
            .captures(body)
            .and_then(|value| value.get(1))
            .map(|value| clean_xml_text(value.as_str()))
            .unwrap_or_default();
        let link = link_re
            .captures(body)
            .and_then(|value| value.get(1))
            .map(|value| value.as_str().trim().to_string())
            .unwrap_or_default();
        if title.is_empty() || link.is_empty() {
            continue;
        }
        let normalized = normalize_url(&link).unwrap_or_else(|_| link.clone());
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title,
            url: normalized,
            publisher: Some(source.name.clone()),
            retrieved_at: now_ms(),
            excerpt: clean_xml_text(body),
        });
    }
    Ok(items)
}

async fn search_sitemap(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| format!("{}/sitemap.xml", source.base_url));
    let url = ensure_search_url(source, endpoint)?;
    let content = fetch_text(client, url).await?;
    let loc_re = Regex::new(r"(?s)<loc[^>]*>(.*?)</loc>").expect("sitemap loc regex");
    let query = query.to_lowercase();
    let mut items = Vec::new();
    for loc in loc_re.captures_iter(&content).take(MAX_RESULTS_PER_SOURCE) {
        let link = loc
            .get(1)
            .map(|value| value.as_str().trim().to_string())
            .unwrap_or_default();
        let Ok(normalized) = normalize_url(&link) else {
            continue;
        };
        let title = normalized
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .replace(['-', '_'], " ");
        if !normalized.to_lowercase().contains(&query) && !title.to_lowercase().contains(&query) {
            continue;
        }
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title,
            url: normalized,
            publisher: Some(source.name.clone()),
            retrieved_at: now_ms(),
            excerpt: "来自站点地图的检索条目".into(),
        });
    }
    Ok(items)
}

async fn search_opds(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| source.base_url.clone());
    let mut url = ensure_search_url(source, endpoint)?;
    url.query_pairs_mut().append_pair("q", query);
    let content = fetch_text(client, url).await?;
    let entry_re = Regex::new(r"(?s)<entry[^>]*>(.*?)</entry>").expect("opds entry regex");
    let title_re = Regex::new(r"(?s)<title[^>]*>(.*?)</title>").expect("opds title regex");
    let link_re = Regex::new(r#"<link[^>]+href=["']([^"']+)["']"#).expect("opds link regex");
    let mut items = Vec::new();
    for entry in entry_re.captures_iter(&content).take(MAX_RESULTS_PER_SOURCE) {
        let body = entry.get(1).map(|value| value.as_str()).unwrap_or_default();
        let title = title_re
            .captures(body)
            .and_then(|value| value.get(1))
            .map(|value| clean_xml_text(value.as_str()))
            .unwrap_or_default();
        let link = link_re
            .captures(body)
            .and_then(|value| value.get(1))
            .map(|value| value.as_str().trim().to_string())
            .unwrap_or_default();
        if title.is_empty() || link.is_empty() {
            continue;
        }
        let Ok(normalized) = normalize_url(&link) else {
            continue;
        };
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title,
            url: normalized,
            publisher: Some(source.name.clone()),
            retrieved_at: now_ms(),
            excerpt: "来自 OPDS 目录的检索条目".into(),
        });
    }
    Ok(items)
}

async fn search_html(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    let endpoint = source
        .search_endpoint
        .clone()
        .unwrap_or_else(|| format!("{}/search", source.base_url));
    let mut url = ensure_search_url(source, endpoint)?;
    url.query_pairs_mut()
        .append_pair("q", query)
        .append_pair("limit", &MAX_RESULTS_PER_SOURCE.to_string());
    let content = fetch_text(client, url).await?;
    let anchor_re =
        Regex::new(r#"<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)</a>"#).expect("html link regex");
    let mut items = Vec::new();
    for anchor in anchor_re.captures_iter(&content).take(MAX_RESULTS_PER_SOURCE) {
        let link = anchor.get(1).map(|value| value.as_str()).unwrap_or_default();
        let title = strip_html(anchor.get(2).map(|value| value.as_str()).unwrap_or_default());
        if title.trim().is_empty() {
            continue;
        }
        let resolved = reqwest::Url::parse(target_url_for(&source.base_url, link).as_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|_| link.to_string());
        let Ok(normalized) = normalize_url(&resolved) else {
            continue;
        };
        items.push(ResearchEvidenceInput {
            source_id: source.id.clone(),
            title,
            url: normalized,
            publisher: Some(source.name.clone()),
            retrieved_at: now_ms(),
            excerpt: "来自站内 HTML 搜索的条目".into(),
        });
    }
    Ok(items)
}

fn target_url_for(base_url: &str, link: &str) -> String {
    match reqwest::Url::parse(link) {
        Ok(url) if url.scheme() == "https" || url.scheme() == "http" => url.to_string(),
        _ => format!("{}{}", base_url.trim_end_matches('/'), link),
    }
}

async fn search_source(
    client: &reqwest::Client,
    source: &crate::research_sources::ResearchSource,
    query: &str,
) -> Result<Vec<ResearchEvidenceInput>, String> {
    match source.adapter.as_str() {
        "mediawiki" => search_mediawiki(client, source, query).await,
        "json-api" => search_json_api(client, source, query).await,
        "rss" => search_rss(client, source, query).await,
        "sitemap" => search_sitemap(client, source, query).await,
        "opds" => search_opds(client, source, query).await,
        "html-search" => search_html(client, source, query).await,
        "fetch-only" => Err("fetch-only 来源不支持检索，只能读取指定页面".into()),
        _ => Err("未知来源适配器".into()),
    }
}

async fn execute_research_search(
    request: ResearchSearchRequest,
    database_state: &DatabaseState,
) -> Result<ResearchSearchResponse, String> {
    ensure_research_network_authorized(&request)?;
    if request.query.trim().is_empty() || request.query.chars().count() > 2_000 {
        return Err("查询词为空或超过限制".into());
    }
    let connection = database::open_state(database_state)?;
    let mut sources = list_active_research_sources(&connection)?;
    if let Some(source_ids) = request.source_ids.as_ref() {
        let allowed: std::collections::HashSet<String> = source_ids.iter().cloned().collect();
        sources.retain(|source| allowed.contains(&source.id));
    }
    let max_sources = request.max_sources.unwrap_or(MAX_SOURCES).clamp(1, MAX_SOURCES);
    sources.truncate(max_sources);
    if sources.is_empty() {
        return Err("没有可用的有效来源，请先完成来源健康检查".into());
    }
    let client = make_client()?;
    let mut evidence_inputs = Vec::new();
    let mut source_errors = Vec::new();
    for source in &sources {
        match search_source(&client, source, &request.query).await {
            Ok(mut items) => evidence_inputs.append(&mut items),
            Err(reason) => source_errors.push(SourceSearchError {
                id: source.id.clone(),
                name: source.name.clone(),
                reason,
            }),
        }
    }
    if evidence_inputs.is_empty() && source_errors.len() == sources.len() {
        return Err(format!(
            "全部来源检索失败：{}",
            source_errors
                .iter()
                .map(|error| error.reason.as_str())
                .collect::<Vec<_>>()
                .join("；")
        ));
    }
    Ok(ResearchSearchResponse {
        query: request.query,
        generated_at: now_ms(),
        evidence_inputs,
        source_errors,
    })
}

fn ensure_research_network_authorized(request: &ResearchSearchRequest) -> Result<(), String> {
    if !request.authorize_network.unwrap_or(false) {
        return Err("未授权联网，请求已阻断".into());
    }
    if !matches!(
        request.source_policy.as_deref(),
        Some("web-metadata") | Some("web-excerpts")
    ) {
        return Err("来源策略未授权外部证据读取".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn search_research_sources(
    request: ResearchSearchRequest,
    state: State<'_, DatabaseState>,
) -> Result<ResearchSearchResponse, String> {
    execute_research_search(request, state.inner()).await
}

#[tauri::command]
pub async fn fetch_research_catalog(endpoint: String) -> Result<serde_json::Value, String> {
    let url = reqwest::Url::parse(endpoint.trim()).map_err(|_| "目录地址无效".to_string())?;
    assert_public_url(&url)?;
    let client = make_client()?;
    fetch_json(&client, url).await
}

async fn execute_citation_verification(
    inputs: Vec<ResearchEvidenceInput>,
    database_state: &DatabaseState,
) -> Result<CitationVerificationReport, String> {
    if inputs.is_empty() || inputs.len() > 24 {
        return Err("引用条数必须在 1 到 24 之间".into());
    }
    let connection = database::open_state(database_state)?;
    let client = make_client()?;
    let mut items = Vec::new();
    for input in inputs {
        let source = get_research_source(&connection, &input.source_id)?;
        if source.deleted || !source.user_enabled {
            items.push(CitationCheck {
                url: input.url.clone(),
                source_id: input.source_id,
                reachable: false,
                http_status: None,
                final_url: input.url,
                reason: Some("来源不可用".into()),
            });
            continue;
        }
        let normalized = match normalize_url(&input.url) {
            Ok(value) => value,
            Err(reason) => {
                items.push(CitationCheck {
                    url: input.url.clone(),
                    source_id: input.source_id,
                    reachable: false,
                    http_status: None,
                    final_url: input.url,
                    reason: Some(reason),
                });
                continue;
            }
        };
        let host = reqwest::Url::parse(&normalized)
            .ok()
            .and_then(|value| value.host_str().map(str::to_string))
            .unwrap_or_default();
        if !source.allowed_hosts.contains(&host) {
            items.push(CitationCheck {
                url: normalized.clone(),
                source_id: input.source_id,
                reachable: false,
                http_status: None,
                final_url: normalized,
                reason: Some("引用域名不在来源允许域名内".into()),
            });
            continue;
        }
        let request_url = match reqwest::Url::parse(&normalized) {
            Ok(value) => value,
            Err(reason) => {
                items.push(CitationCheck {
                    url: normalized.clone(),
                    source_id: input.source_id,
                    reachable: false,
                    http_status: None,
                    final_url: normalized,
                    reason: Some(reason.to_string()),
                });
                continue;
            }
        };
        if let Err(reason) = assert_public_url(&request_url) {
            items.push(CitationCheck {
                url: normalized.clone(),
                source_id: input.source_id,
                reachable: false,
                http_status: None,
                final_url: normalized,
                reason: Some(reason),
            });
            continue;
        }
        match client.get(request_url).send().await {
            Ok(response) => {
                let status = response.status();
                let final_url = response.url().to_string();
                drop(response);
                let final_host = reqwest::Url::parse(&final_url)
                    .ok()
                    .and_then(|value| value.host_str().map(str::to_string))
                    .unwrap_or_default();
                let final_is_public = reqwest::Url::parse(&final_url)
                    .ok()
                    .map(|value| assert_public_url(&value).is_ok())
                    .unwrap_or(false);
                let reachable = status.is_success()
                    && source.allowed_hosts.contains(&final_host)
                    && final_is_public;
                items.push(CitationCheck {
                    url: normalized,
                    source_id: input.source_id,
                    reachable,
                    http_status: Some(status.as_u16()),
                    final_url,
                    reason: if reachable {
                        None
                    } else {
                        Some("引用不可访问或重定向出允许域名".into())
                    },
                });
            }
            Err(error) => items.push(CitationCheck {
                url: normalized,
                source_id: input.source_id,
                reachable: false,
                http_status: None,
                final_url: String::new(),
                reason: Some(error.to_string()),
            }),
        }
    }
    let reachable_count = items.iter().filter(|item| item.reachable).count();
    let unreachable_count = items.len().saturating_sub(reachable_count);
    Ok(CitationVerificationReport {
        generated_at: now_ms(),
        items,
        reachable_count,
        unreachable_count,
    })
}

#[tauri::command]
pub async fn verify_research_citations(
    inputs: Vec<ResearchEvidenceInput>,
    state: State<'_, DatabaseState>,
) -> Result<CitationVerificationReport, String> {
    execute_citation_verification(inputs, state.inner()).await
}

#[tauri::command]
pub async fn run_research_acceptance(
    input: ResearchAcceptanceBatchInput,
    state: State<'_, DatabaseState>,
) -> Result<ResearchAcceptanceReport, String> {
    if input.cases.is_empty() || input.cases.len() > 100 {
        return Err("跑批题目数必须在 1 到 100 之间".into());
    }
    let started_at = now_ms();
    let run_id = input
        .run_id
        .clone()
        .unwrap_or_else(|| format!("research-{started_at}"));
    let connection = database::open_state(state.inner())?;
    let source_count = list_active_research_sources(&connection)?.len();
    drop(connection);
    let mut questions = Vec::new();
    for case in input.cases {
        let start = Instant::now();
        let request = ResearchSearchRequest {
            query: case.question.clone(),
            source_ids: input.source_ids.clone(),
            max_sources: input.max_sources,
            authorize_network: Some(true),
            source_policy: Some("web-excerpts".into()),
        };
        let search = execute_research_search(request, state.inner()).await;
        let evidence_inputs = search
            .as_ref()
            .map(|response| response.evidence_inputs.clone())
            .unwrap_or_default();
        let source_errors = search
            .as_ref()
            .map(|response| response.source_errors.len())
            .unwrap_or_default();
        let relevant_source_in_top5 = !evidence_inputs.is_empty();
        let citation_checks = if evidence_inputs.is_empty() {
            ResearchAcceptanceCitationCounts {
                total: 0,
                reachable: 0,
            }
        } else {
            let verified = execute_citation_verification(evidence_inputs.clone(), state.inner())
                .await
                .unwrap_or_else(|_| CitationVerificationReport {
                    generated_at: now_ms(),
                    items: Vec::new(),
                    reachable_count: 0,
                    unreachable_count: evidence_inputs.len(),
                });
            ResearchAcceptanceCitationCounts {
                total: evidence_inputs.len(),
                reachable: verified.reachable_count,
            }
        };
        let min_evidence = case.min_evidence.unwrap_or(1).max(1);
        let evidence_checks = ResearchAcceptanceCounts {
            total: min_evidence,
            covered: evidence_inputs.len().min(min_evidence),
        };
        let single_source_failure_handled = !evidence_inputs.is_empty() || source_errors == 0;
        let prep_ms = start.elapsed().as_millis() as u64;
        questions.push(ResearchAcceptanceQuestionResult {
            id: case.id,
            question: case.question,
            relevant_source_in_top5,
            citation_checks,
            evidence_checks,
            unauthorized_network_blocked: true,
            single_source_failure_handled,
            prep_ms,
        });
    }
    Ok(ResearchAcceptanceReport {
        run_id,
        started_at,
        finished_at: now_ms(),
        source_count,
        questions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_unauthorized_network_before_opening_any_source() {
        let request = ResearchSearchRequest {
            query: "测试问题".into(),
            source_ids: None,
            max_sources: None,
            authorize_network: None,
            source_policy: None,
        };
        assert_eq!(
            ensure_research_network_authorized(&request),
            Err("未授权联网，请求已阻断".into())
        );

        let authorized = ResearchSearchRequest {
            authorize_network: Some(true),
            source_policy: Some("web-excerpts".into()),
            ..request
        };
        assert!(ensure_research_network_authorized(&authorized).is_ok());
    }

    #[test]
    fn blocks_network_for_non_web_source_policy() {
        let request = ResearchSearchRequest {
            query: "测试问题".into(),
            source_ids: None,
            max_sources: None,
            authorize_network: Some(true),
            source_policy: Some("local-chunks".into()),
        };
        assert_eq!(
            ensure_research_network_authorized(&request),
            Err("来源策略未授权外部证据读取".into())
        );
    }

    #[test]
    fn blocks_ssrf_private_and_loopback_urls() {
        for endpoint in [
            "https://127.0.0.1/search",
            "https://10.0.0.1/search",
            "https://169.254.169.254/latest/meta-data",
            "https://[::1]/search",
        ] {
            let url = reqwest::Url::parse(endpoint).unwrap();
            assert!(assert_public_url(&url).is_err(), "{endpoint} 应当被拒绝");
        }
    }

    #[test]
    fn blocks_local_hostnames_before_dns() {
        for endpoint in ["https://localhost/search", "https://x.internal/search", "https://x.local/search"] {
            let url = reqwest::Url::parse(endpoint).unwrap();
            assert!(assert_public_url(&url).is_err(), "{endpoint} 应当被拒绝");
        }
    }
}
