use crate::database::{self, DatabaseState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const ORIGINS: [&str; 4] = ["builtin", "catalog", "discovered", "user"];
const ADAPTERS: [&str; 7] = [
    "mediawiki",
    "json-api",
    "rss",
    "sitemap",
    "opds",
    "html-search",
    "fetch-only",
];
const TRUST_LEVELS: [&str; 4] = ["official", "curated", "community", "custom"];
const SOURCE_STATUSES: [&str; 5] = [
    "candidate",
    "active",
    "restricted",
    "unavailable",
    "retired",
];

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSource {
    pub id: String,
    pub name: String,
    pub origin: String,
    pub adapter: String,
    pub base_url: String,
    pub allowed_hosts: Vec<String>,
    pub search_endpoint: Option<String>,
    pub language: Vec<String>,
    pub region: Vec<String>,
    pub categories: Vec<String>,
    pub trust_level: String,
    pub status: String,
    pub user_enabled: bool,
    pub minimum_update_hours: u64,
    pub last_checked_at: Option<u64>,
    pub last_success_at: Option<u64>,
    pub consecutive_failures: u64,
    pub deleted: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSourceInput {
    pub id: String,
    pub name: String,
    pub origin: Option<String>,
    pub adapter: String,
    pub base_url: String,
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    pub search_endpoint: Option<String>,
    #[serde(default)]
    pub language: Vec<String>,
    #[serde(default)]
    pub region: Vec<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    pub trust_level: String,
    pub status: Option<String>,
    pub user_enabled: Option<bool>,
    pub minimum_update_hours: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceHealthInput {
    pub id: String,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceHistoryRecord {
    pub id: i64,
    pub source_id: String,
    pub action: String,
    pub before_json: String,
    pub after_json: String,
    pub reason: Option<String>,
    pub changed_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCatalogPayload {
    pub cursor: Option<String>,
    pub sources: Vec<ResearchSourceInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceUpdateConflict {
    pub id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceUpdateReport {
    pub cursor: Option<String>,
    pub added: Vec<String>,
    pub updated: Vec<String>,
    pub restricted: Vec<String>,
    pub unavailable: Vec<String>,
    pub user_overridden: Vec<String>,
    pub conflicts: Vec<SourceUpdateConflict>,
    pub applied: bool,
    pub updated_at: u64,
}

#[derive(Debug, Default)]
struct CatalogMerge {
    added: Vec<ResearchSource>,
    updated: Vec<ResearchSource>,
    unavailable: Vec<ResearchSource>,
    user_overridden: Vec<String>,
    conflicts: Vec<SourceUpdateConflict>,
}

fn validate_id(value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.len() > 160
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':' | '.')
        })
    {
        return Err("来源 ID 无效".into());
    }
    Ok(())
}

fn validate_host(host: &str) -> Result<(), String> {
    if host.trim().is_empty()
        || host.len() > 253
        || host.contains('/')
        || host.contains('?')
        || host.contains('#')
    {
        return Err("域名无效".into());
    }
    Ok(())
}

fn normalize_base_url(value: &str) -> Result<String, String> {
    let url =
        reqwest::Url::parse(value.trim()).map_err(|_| "来源地址必须是合法 URL".to_string())?;
    if url.scheme() != "https" {
        return Err("来源地址仅允许 HTTPS".into());
    }
    url.host_str()
        .ok_or_else(|| "来源地址缺少主机名".to_string())?;
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn host_for_base_url(value: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "来源地址必须是合法 URL".to_string())?;
    url.host_str()
        .map(str::to_string)
        .ok_or_else(|| "来源地址缺少主机名".to_string())
}

fn normalize_endpoint(
    value: Option<&str>,
    allowed_hosts: &[String],
) -> Result<Option<String>, String> {
    let Some(endpoint) = value.map(str::trim).filter(|item| !item.is_empty()) else {
        return Ok(None);
    };
    let normalized = normalize_base_url(endpoint)?;
    let host = host_for_base_url(&normalized)?;
    if !allowed_hosts.contains(&host) {
        return Err("搜索入口域名不在允许域名内".into());
    }
    Ok(Some(normalized))
}

fn validate_origin(value: &str) -> Result<(), String> {
    if ORIGINS.contains(&value) {
        Ok(())
    } else {
        Err("来源入口类型无效".into())
    }
}

fn validate_adapter(value: &str) -> Result<(), String> {
    if ADAPTERS.contains(&value) {
        Ok(())
    } else {
        Err("来源适配器无效".into())
    }
}

fn validate_trust_level(value: &str) -> Result<(), String> {
    if TRUST_LEVELS.contains(&value) {
        Ok(())
    } else {
        Err("来源可信等级无效".into())
    }
}

fn json_to_string_list(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value).unwrap_or_default()
}

fn source_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ResearchSource> {
    Ok(ResearchSource {
        id: row.get(0)?,
        name: row.get(1)?,
        origin: row.get(2)?,
        adapter: row.get(3)?,
        base_url: row.get(4)?,
        allowed_hosts: json_to_string_list(&row.get::<_, String>(5)?),
        search_endpoint: row.get(6)?,
        language: json_to_string_list(&row.get::<_, String>(7)?),
        region: json_to_string_list(&row.get::<_, String>(8)?),
        categories: json_to_string_list(&row.get::<_, String>(9)?),
        trust_level: row.get(10)?,
        status: row.get(11)?,
        user_enabled: row.get::<_, i64>(12)? != 0,
        minimum_update_hours: row.get::<_, i64>(13)? as u64,
        last_checked_at: row.get::<_, Option<i64>>(14)?.map(|value| value as u64),
        last_success_at: row.get::<_, Option<i64>>(15)?.map(|value| value as u64),
        consecutive_failures: row.get::<_, i64>(16)? as u64,
        deleted: row.get::<_, i64>(17)? != 0,
        created_at: row.get::<_, i64>(18)? as u64,
        updated_at: row.get::<_, i64>(19)? as u64,
    })
}

fn load_source(connection: &Connection, id: &str) -> Result<ResearchSource, String> {
    connection
        .query_row(
            "SELECT id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
             language_json, region_json, categories_json, trust_level, status, user_enabled,
             minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
             deleted, created_at, updated_at
             FROM research_sources WHERE id=?1",
            [id],
            source_from_row,
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "来源不存在".to_string())
}

pub(crate) fn get_research_source(
    connection: &Connection,
    id: &str,
) -> Result<ResearchSource, String> {
    load_source(connection, id)
}

pub(crate) fn list_active_research_sources(
    connection: &Connection,
) -> Result<Vec<ResearchSource>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
             language_json, region_json, categories_json, trust_level, status, user_enabled,
             minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
             deleted, created_at, updated_at
             FROM research_sources
             WHERE deleted=0 AND user_enabled=1 AND status='active'
             ORDER BY CASE trust_level
               WHEN 'official' THEN 1
               WHEN 'curated' THEN 2
               WHEN 'community' THEN 3
               ELSE 4
             END, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], source_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn insert_source(connection: &Connection, source: &ResearchSource) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO research_sources
             (id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
              language_json, region_json, categories_json, trust_level, status, user_enabled,
              minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
              deleted, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                source.id,
                source.name,
                source.origin,
                source.adapter,
                source.base_url,
                serde_json::to_string(&source.allowed_hosts).unwrap_or_else(|_| "[]".into()),
                source.search_endpoint,
                serde_json::to_string(&source.language).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.region).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.categories).unwrap_or_else(|_| "[]".into()),
                source.trust_level,
                source.status,
                source.user_enabled as i64,
                source.minimum_update_hours as i64,
                source.last_checked_at.map(|value| value as i64),
                source.last_success_at.map(|value| value as i64),
                source.consecutive_failures as i64,
                source.deleted as i64,
                source.created_at as i64,
                source.updated_at as i64,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn update_source(connection: &Connection, source: &ResearchSource) -> Result<(), String> {
    connection
        .execute(
            "UPDATE research_sources SET
               name=?2, origin=?3, adapter=?4, base_url=?5, allowed_hosts_json=?6, search_endpoint=?7,
               language_json=?8, region_json=?9, categories_json=?10, trust_level=?11, status=?12,
               user_enabled=?13, minimum_update_hours=?14, last_checked_at=?15, last_success_at=?16,
               consecutive_failures=?17, deleted=?18, updated_at=?19
             WHERE id=?1",
            params![
                source.id,
                source.name,
                source.origin,
                source.adapter,
                source.base_url,
                serde_json::to_string(&source.allowed_hosts).unwrap_or_else(|_| "[]".into()),
                source.search_endpoint,
                serde_json::to_string(&source.language).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.region).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.categories).unwrap_or_else(|_| "[]".into()),
                source.trust_level,
                source.status,
                source.user_enabled as i64,
                source.minimum_update_hours as i64,
                source.last_checked_at.map(|value| value as i64),
                source.last_success_at.map(|value| value as i64),
                source.consecutive_failures as i64,
                source.deleted as i64,
                source.updated_at as i64,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn append_history(
    connection: &Connection,
    source_id: &str,
    action: &str,
    before: &ResearchSource,
    after: &ResearchSource,
    reason: Option<&str>,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO research_source_history
             (source_id, action, before_json, after_json, reason, changed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                source_id,
                action,
                serde_json::to_string(before).map_err(|error| error.to_string())?,
                serde_json::to_string(after).map_err(|error| error.to_string())?,
                reason,
                now_ms() as i64
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn json_to_source(value: &str) -> Result<ResearchSource, String> {
    serde_json::from_str(value).map_err(|error| format!("历史记录损坏：{error}"))
}

fn open_registry_db(state: &State<'_, DatabaseState>) -> Result<Connection, String> {
    let connection = database::open(state)?;
    seed_builtin_catalog(&connection)?;
    Ok(connection)
}

fn seed_builtin_catalog(connection: &Connection) -> Result<(), String> {
    let now = now_ms();
    let builtins = [
        ResearchSource {
            id: "wikipedia-zh".into(),
            name: "中文维基百科".into(),
            origin: "builtin".into(),
            adapter: "mediawiki".into(),
            base_url: "https://zh.wikipedia.org".into(),
            allowed_hosts: vec!["zh.wikipedia.org".into()],
            search_endpoint: None,
            language: vec!["zh".into()],
            region: vec!["global".into()],
            categories: vec!["knowledge".into(), "reference".into()],
            trust_level: "curated".into(),
            status: "candidate".into(),
            user_enabled: true,
            minimum_update_hours: 24,
            last_checked_at: None,
            last_success_at: None,
            consecutive_failures: 0,
            deleted: false,
            created_at: now,
            updated_at: now,
        },
        ResearchSource {
            id: "wikipedia-en".into(),
            name: "English Wikipedia".into(),
            origin: "builtin".into(),
            adapter: "mediawiki".into(),
            base_url: "https://en.wikipedia.org".into(),
            allowed_hosts: vec!["en.wikipedia.org".into()],
            search_endpoint: None,
            language: vec!["en".into()],
            region: vec!["global".into()],
            categories: vec!["knowledge".into(), "reference".into()],
            trust_level: "curated".into(),
            status: "candidate".into(),
            user_enabled: true,
            minimum_update_hours: 24,
            last_checked_at: None,
            last_success_at: None,
            consecutive_failures: 0,
            deleted: false,
            created_at: now,
            updated_at: now,
        },
        ResearchSource {
            id: "open-library".into(),
            name: "Open Library".into(),
            origin: "builtin".into(),
            adapter: "json-api".into(),
            base_url: "https://openlibrary.org".into(),
            allowed_hosts: vec!["openlibrary.org".into()],
            search_endpoint: None,
            language: vec!["en".into()],
            region: vec!["global".into()],
            categories: vec!["books".into(), "reference".into()],
            trust_level: "curated".into(),
            status: "candidate".into(),
            user_enabled: true,
            minimum_update_hours: 24,
            last_checked_at: None,
            last_success_at: None,
            consecutive_failures: 0,
            deleted: false,
            created_at: now,
            updated_at: now,
        },
    ];
    for source in builtins {
        let _ = connection.execute(
            "INSERT OR IGNORE INTO research_sources
             (id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
              language_json, region_json, categories_json, trust_level, status, user_enabled,
              minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
              deleted, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![
                source.id,
                source.name,
                source.origin,
                source.adapter,
                source.base_url,
                serde_json::to_string(&source.allowed_hosts).unwrap_or_else(|_| "[]".into()),
                source.search_endpoint,
                serde_json::to_string(&source.language).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.region).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&source.categories).unwrap_or_else(|_| "[]".into()),
                source.trust_level,
                source.status,
                source.user_enabled as i64,
                source.minimum_update_hours as i64,
                source.last_checked_at.map(|value| value as i64),
                source.last_success_at.map(|value| value as i64),
                source.consecutive_failures as i64,
                source.deleted as i64,
                source.created_at as i64,
                source.updated_at as i64,
            ],
        );
    }
    Ok(())
}

fn validate_source_mut(source: &mut ResearchSource) -> Result<(), String> {
    source.base_url = normalize_base_url(&source.base_url)?;
    source.allowed_hosts = source
        .allowed_hosts
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if source.allowed_hosts.is_empty() {
        source
            .allowed_hosts
            .push(host_for_base_url(&source.base_url)?);
    }
    source.base_url = source.base_url.trim_end_matches('/').to_string();
    let base_host = host_for_base_url(&source.base_url)?;
    for host in &source.allowed_hosts {
        validate_host(host)?;
    }
    if !source.allowed_hosts.contains(&base_host) {
        return Err("允许域名必须包含来源地址主机名".into());
    }
    source.search_endpoint =
        normalize_endpoint(source.search_endpoint.as_deref(), &source.allowed_hosts)?;
    if source.minimum_update_hours == 0 || source.minimum_update_hours > 24 * 90 {
        return Err("最小更新间隔无效".into());
    }
    source.language = source
        .language
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();
    source.region = source
        .region
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();
    source.categories = source
        .categories
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();
    if source.categories.is_empty() {
        source.categories.push("general".into());
    }
    Ok(())
}

fn build_source(
    input: ResearchSourceInput,
    existing: Option<ResearchSource>,
) -> Result<ResearchSource, String> {
    let now = now_ms();
    let mut source = if let Some(mut existing) = existing {
        existing.base_url = input.base_url;
        existing.name = input.name;
        existing.adapter = input.adapter;
        existing.allowed_hosts = input.allowed_hosts;
        existing.search_endpoint = input.search_endpoint;
        existing.language = input.language;
        existing.region = input.region;
        existing.categories = input.categories;
        existing.trust_level = input.trust_level;
        if let Some(origin) = input.origin {
            validate_origin(&origin)?;
            existing.origin = origin;
        }
        if let Some(status) = input.status {
            if !SOURCE_STATUSES.contains(&status.as_str()) {
                return Err("来源状态无效".into());
            }
            existing.status = status;
        }
        if let Some(user_enabled) = input.user_enabled {
            existing.user_enabled = user_enabled;
        }
        if let Some(minimum_update_hours) = input.minimum_update_hours {
            existing.minimum_update_hours = minimum_update_hours;
        }
        existing.updated_at = now;
        existing
    } else {
        let id = input.id.clone();
        let origin = input.origin.unwrap_or_else(|| "user".into());
        validate_id(&id)?;
        validate_origin(&origin)?;
        ResearchSource {
            id,
            name: input.name,
            origin,
            adapter: input.adapter,
            base_url: input.base_url,
            allowed_hosts: input.allowed_hosts,
            search_endpoint: input.search_endpoint,
            language: input.language,
            region: input.region,
            categories: input.categories,
            trust_level: input.trust_level,
            status: input.status.unwrap_or_else(|| "candidate".into()),
            user_enabled: input.user_enabled.unwrap_or(true),
            minimum_update_hours: input.minimum_update_hours.unwrap_or(24),
            last_checked_at: None,
            last_success_at: None,
            consecutive_failures: 0,
            deleted: false,
            created_at: now,
            updated_at: now,
        }
    };
    validate_id(&source.id)?;
    if source.name.trim().is_empty() || source.name.chars().count() > 120 {
        return Err("来源名称无效".into());
    }
    validate_origin(&source.origin)?;
    validate_adapter(&source.adapter)?;
    validate_trust_level(&source.trust_level)?;
    if !SOURCE_STATUSES.contains(&source.status.as_str()) {
        return Err("来源状态无效".into());
    }
    validate_source_mut(&mut source)?;
    Ok(source)
}

#[tauri::command]
pub fn list_research_sources(
    state: State<'_, DatabaseState>,
) -> Result<Vec<ResearchSource>, String> {
    let connection = open_registry_db(&state)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
             language_json, region_json, categories_json, trust_level, status, user_enabled,
             minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
             deleted, created_at, updated_at
             FROM research_sources WHERE deleted=0 ORDER BY origin, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], source_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_research_source(
    input: ResearchSourceInput,
    state: State<'_, DatabaseState>,
) -> Result<ResearchSource, String> {
    let mut connection = open_registry_db(&state)?;
    validate_id(&input.id)?;
    let existing = load_source(&connection, &input.id).ok();
    let before = existing.clone();
    let after = build_source(input, existing)?;
    let action = if before.is_some() { "update" } else { "create" };
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    if before.is_some() {
        update_source(&transaction, &after)?;
    } else {
        insert_source(&transaction, &after)?;
    }
    if let Some(before) = before {
        append_history(&transaction, &after.id, action, &before, &after, None)?;
    } else {
        append_history(&transaction, &after.id, action, &after, &after, None)?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    load_source(&connection, &after.id)
}

#[tauri::command]
pub fn delete_research_source(id: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    let mut connection = open_registry_db(&state)?;
    validate_id(&id)?;
    let before = load_source(&connection, &id)?;
    let mut after = before.clone();
    after.deleted = true;
    after.user_enabled = false;
    after.status = "retired".into();
    after.updated_at = now_ms();
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    update_source(&transaction, &after)?;
    append_history(
        &transaction,
        &id,
        "delete",
        &before,
        &after,
        Some("用户删除来源"),
    )?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_research_source(
    id: String,
    state: State<'_, DatabaseState>,
) -> Result<ResearchSource, String> {
    let mut connection = open_registry_db(&state)?;
    validate_id(&id)?;
    let before = load_source(&connection, &id)?;
    if !before.deleted {
        return Err("来源未被删除".into());
    }
    let mut after = before.clone();
    after.deleted = false;
    after.user_enabled = true;
    after.status = "candidate".into();
    after.consecutive_failures = 0;
    after.updated_at = now_ms();
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    update_source(&transaction, &after)?;
    append_history(
        &transaction,
        &id,
        "restore",
        &before,
        &after,
        Some("恢复来源"),
    )?;
    transaction.commit().map_err(|error| error.to_string())?;
    load_source(&connection, &id)
}

fn allowed_health_transition(from: &str, to: &str) -> bool {
    if !SOURCE_STATUSES.contains(&to) || to == "candidate" {
        return false;
    }
    if from == "retired" {
        return false;
    }
    if from == to {
        return true;
    }
    matches!(
        (from, to),
        (
            "candidate",
            "active" | "restricted" | "unavailable" | "retired"
        ) | ("active", "restricted" | "unavailable" | "retired")
            | ("restricted", "active" | "unavailable" | "retired")
            | ("unavailable", "active" | "restricted" | "retired")
    )
}

#[tauri::command]
pub fn record_research_source_health(
    input: SourceHealthInput,
    state: State<'_, DatabaseState>,
) -> Result<ResearchSource, String> {
    let mut connection = open_registry_db(&state)?;
    validate_id(&input.id)?;
    let before = load_source(&connection, &input.id)?;
    if before.deleted {
        return Err("来源已删除，不能更新健康状态".into());
    }
    if !allowed_health_transition(&before.status, &input.status) {
        return Err(format!(
            "不允许从 {} 迁移到 {}",
            before.status, input.status
        ));
    }
    let now = now_ms();
    let mut after = before.clone();
    let new_status = input.status.clone();
    after.status = new_status.clone();
    after.last_checked_at = Some(now);
    if new_status == "active" {
        after.last_success_at = Some(now);
        after.consecutive_failures = 0;
        after.user_enabled = true;
    } else {
        after.consecutive_failures += 1;
        if new_status == "retired" {
            after.user_enabled = false;
        }
    }
    after.updated_at = now;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    update_source(&transaction, &after)?;
    append_history(
        &transaction,
        &input.id,
        "health",
        &before,
        &after,
        input.reason.as_deref(),
    )?;
    transaction.commit().map_err(|error| error.to_string())?;
    load_source(&connection, &input.id)
}

#[tauri::command]
pub fn rollback_research_source(
    id: String,
    state: State<'_, DatabaseState>,
) -> Result<ResearchSource, String> {
    let mut connection = open_registry_db(&state)?;
    validate_id(&id)?;
    let latest = connection
        .query_row(
            "SELECT id, source_id, action, before_json, after_json, reason, changed_at
             FROM research_source_history WHERE source_id=?1 ORDER BY id DESC LIMIT 1",
            [&id],
            |row| {
                Ok(SourceHistoryRecord {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    action: row.get(2)?,
                    before_json: row.get(3)?,
                    after_json: row.get(4)?,
                    reason: row.get(5)?,
                    changed_at: row.get::<_, i64>(6)? as u64,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "没有可回滚的变更".to_string())?;
    if latest.action == "rollback" {
        return Err("没有可回滚的变更".into());
    }
    let before = json_to_source(&latest.before_json)?;
    let current = load_source(&connection, &id)?;
    let mut restored = before;
    restored.updated_at = now_ms();
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    update_source(&transaction, &restored)?;
    append_history(
        &transaction,
        &id,
        "rollback",
        &current,
        &restored,
        Some("回滚最近一次变更"),
    )?;
    transaction.commit().map_err(|error| error.to_string())?;
    load_source(&connection, &id)
}

#[tauri::command]
pub fn export_research_sources(state: State<'_, DatabaseState>) -> Result<String, String> {
    let connection = open_registry_db(&state)?;
    let sources = list_sources_from(&connection)?;
    serde_json::to_string_pretty(&sources).map_err(|error| error.to_string())
}

fn list_sources_from(connection: &Connection) -> Result<Vec<ResearchSource>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, origin, adapter, base_url, allowed_hosts_json, search_endpoint,
             language_json, region_json, categories_json, trust_level, status, user_enabled,
             minimum_update_hours, last_checked_at, last_success_at, consecutive_failures,
             deleted, created_at, updated_at
             FROM research_sources WHERE deleted=0 ORDER BY origin, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], source_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_research_sources(
    payload: String,
    state: State<'_, DatabaseState>,
) -> Result<Vec<ResearchSource>, String> {
    let imported: Vec<ResearchSource> =
        serde_json::from_str(&payload).map_err(|error| format!("导入数据无效：{error}"))?;
    let mut connection = open_registry_db(&state)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    for mut source in imported {
        validate_id(&source.id)?;
        if source.name.trim().is_empty() || source.name.chars().count() > 120 {
            return Err("来源名称无效".into());
        }
        validate_origin(&source.origin)?;
        validate_adapter(&source.adapter)?;
        validate_trust_level(&source.trust_level)?;
        if !SOURCE_STATUSES.contains(&source.status.as_str()) {
            return Err("来源状态无效".into());
        }
        validate_source_mut(&mut source)?;
        source.deleted = false;
        source.updated_at = now_ms();
        let existing = load_source(&transaction, &source.id).ok();
        let before = existing.clone();
        let action = if before.is_some() {
            "import-update"
        } else {
            "import-create"
        };
        if before.is_some() {
            source.created_at = before.as_ref().unwrap().created_at;
            source.consecutive_failures = before.as_ref().unwrap().consecutive_failures;
            source.last_checked_at = before.as_ref().unwrap().last_checked_at;
            source.last_success_at = before.as_ref().unwrap().last_success_at;
            update_source(&transaction, &source)?;
        } else {
            source.created_at = source.created_at.max(now_ms());
            insert_source(&transaction, &source)?;
        }
        if let Some(before) = before {
            append_history(
                &transaction,
                &source.id,
                action,
                &before,
                &source,
                Some("导入来源"),
            )?;
        } else {
            append_history(
                &transaction,
                &source.id,
                action,
                &source,
                &source,
                Some("导入来源"),
            )?;
        }
    }
    transaction.commit().map_err(|error| error.to_string())?;
    list_sources_from(&connection)
}

const CATALOG_UPDATE_COOLDOWN_MS: u64 = 24 * 60 * 60 * 1000;

fn read_catalog_meta(
    connection: &Connection,
) -> Result<(Option<u64>, u64, Option<String>), String> {
    connection
        .query_row(
            "SELECT last_update_at, updated_count, last_cursor FROM research_source_catalog_meta WHERE id=1",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?.map(|value| value as u64),
                    row.get::<_, i64>(1)? as u64,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())
        .map(|value| value.unwrap_or((None, 0, None)))
}

fn ensure_catalog_update_allowed(connection: &Connection) -> Result<(), String> {
    let (last_update_at, _, _) = read_catalog_meta(connection)?;
    if let Some(last_update_at) = last_update_at {
        let now = now_ms();
        if now.saturating_sub(last_update_at) < CATALOG_UPDATE_COOLDOWN_MS {
            return Err("来源目录更新冷却中，请稍后再试".into());
        }
    }
    Ok(())
}

fn write_catalog_meta(
    connection: &Connection,
    updated_this_run: u64,
    cursor: Option<&str>,
) -> Result<(), String> {
    let (_, previous_count, _) = read_catalog_meta(connection)?;
    let now = now_ms();
    connection
        .execute(
            "INSERT INTO research_source_catalog_meta
             (id, last_update_at, updated_count, last_cursor)
             VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               last_update_at=excluded.last_update_at,
               updated_count=excluded.updated_count,
               last_cursor=excluded.last_cursor",
            params![
                now as i64,
                (previous_count + updated_this_run) as i64,
                cursor
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn source_jsons_equal(left: &ResearchSource, right: &ResearchSource) -> bool {
    let Ok(left) = serde_json::to_string(left) else {
        return false;
    };
    let Ok(right) = serde_json::to_string(right) else {
        return false;
    };
    left == right
}

fn build_catalog_merge(
    connection: &Connection,
    payload: SourceCatalogPayload,
) -> Result<CatalogMerge, String> {
    let mut candidates = HashMap::<String, ResearchSource>::new();
    let mut conflicts = Vec::new();
    for mut input in payload.sources {
        if input.id.trim().is_empty() {
            continue;
        }
        if candidates.contains_key(&input.id) {
            conflicts.push(SourceUpdateConflict {
                id: input.id,
                reason: "目录中存在重复来源 ID".into(),
            });
            continue;
        }
        input.origin = Some("catalog".into());
        match build_source(input, None) {
            Ok(value) => {
                candidates.insert(value.id.clone(), value);
            }
            Err(error) => {
                conflicts.push(SourceUpdateConflict {
                    id: String::new(),
                    reason: error,
                });
            }
        }
    }

    let existing_sources = list_sources_from(connection)?;
    let existing_by_id: HashMap<String, ResearchSource> = existing_sources
        .iter()
        .map(|source| (source.id.clone(), source.clone()))
        .collect();
    let now = now_ms();
    let mut merge = CatalogMerge::default();

    for existing in &existing_sources {
        let Some(catalog_source) = candidates.get(&existing.id) else {
            if existing.origin == "user" {
                continue;
            }
            if !existing.user_enabled || existing.status == "retired" {
                continue;
            }
            let mut unavailable = existing.clone();
            unavailable.status = "unavailable".into();
            unavailable.updated_at = now;
            merge.unavailable.push(unavailable);
            continue;
        };
        if existing.origin == "user" {
            merge.user_overridden.push(existing.id.clone());
            continue;
        }
        if !existing.user_enabled {
            merge.conflicts.push(SourceUpdateConflict {
                id: existing.id.clone(),
                reason: "用户已停用，目录更新未自动启用".into(),
            });
            continue;
        }
        let mut merged = existing.clone();
        merged.name = catalog_source.name.clone();
        merged.adapter = catalog_source.adapter.clone();
        merged.base_url = catalog_source.base_url.clone();
        merged.allowed_hosts = catalog_source.allowed_hosts.clone();
        merged.search_endpoint = catalog_source.search_endpoint.clone();
        merged.language = catalog_source.language.clone();
        merged.region = catalog_source.region.clone();
        merged.categories = catalog_source.categories.clone();
        merged.trust_level = catalog_source.trust_level.clone();
        merged.minimum_update_hours = catalog_source.minimum_update_hours;
        if catalog_source.status != "candidate" {
            if !allowed_health_transition(&existing.status, &catalog_source.status) {
                merge.conflicts.push(SourceUpdateConflict {
                    id: existing.id.clone(),
                    reason: format!(
                        "目录状态 {} 不可从 {} 迁移",
                        catalog_source.status, existing.status
                    ),
                });
                continue;
            }
            merged.status = catalog_source.status.clone();
            merged.last_checked_at = Some(now);
            if catalog_source.status == "active" {
                merged.last_success_at = Some(now);
                merged.consecutive_failures = 0;
            } else {
                merged.consecutive_failures += 1;
                if catalog_source.status == "retired" {
                    merged.user_enabled = false;
                }
            }
        }
        let mut compared = merged.clone();
        compared.updated_at = existing.updated_at;
        if source_jsons_equal(existing, &compared) {
            continue;
        }
        merged.updated_at = now;
        merge.updated.push(merged);
    }

    for (id, mut catalog_source) in candidates {
        if existing_by_id.contains_key(&id) {
            continue;
        }
        if catalog_source.status != "candidate" {
            catalog_source.last_checked_at = Some(now);
            if catalog_source.status == "active" {
                catalog_source.last_success_at = Some(now);
            }
        }
        merge.added.push(catalog_source);
    }

    merge.conflicts.extend(conflicts);
    Ok(merge)
}

fn apply_catalog_merge(connection: &Connection, merge: &CatalogMerge) -> Result<(), String> {
    for source in &merge.added {
        insert_source(connection, source)?;
        append_history(
            connection,
            &source.id,
            "catalog-add",
            source,
            source,
            Some("目录更新新增来源"),
        )?;
    }
    for source in &merge.updated {
        let before = load_source(connection, &source.id)?;
        update_source(connection, source)?;
        append_history(
            connection,
            &source.id,
            "catalog-update",
            &before,
            source,
            Some("目录更新合并来源"),
        )?;
    }
    for source in &merge.unavailable {
        let before = load_source(connection, &source.id)?;
        update_source(connection, source)?;
        append_history(
            connection,
            &source.id,
            "catalog-unavailable",
            &before,
            source,
            Some("目录更新标记不可用"),
        )?;
    }
    Ok(())
}

fn report_from_merge(
    merge: &CatalogMerge,
    cursor: Option<String>,
    applied: bool,
) -> SourceUpdateReport {
    let restricted = merge
        .added
        .iter()
        .chain(merge.updated.iter())
        .chain(merge.unavailable.iter())
        .filter(|source| source.status == "restricted")
        .map(|source| source.id.clone())
        .collect();
    let unavailable = merge
        .added
        .iter()
        .chain(merge.updated.iter())
        .chain(merge.unavailable.iter())
        .filter(|source| source.status == "unavailable")
        .map(|source| source.id.clone())
        .collect();
    SourceUpdateReport {
        cursor,
        added: merge.added.iter().map(|source| source.id.clone()).collect(),
        updated: merge
            .updated
            .iter()
            .map(|source| source.id.clone())
            .collect(),
        restricted,
        unavailable,
        user_overridden: merge.user_overridden.clone(),
        conflicts: merge.conflicts.clone(),
        applied,
        updated_at: now_ms(),
    }
}

#[tauri::command]
pub fn preview_research_catalog(
    payload: SourceCatalogPayload,
    state: State<'_, DatabaseState>,
) -> Result<SourceUpdateReport, String> {
    let connection = open_registry_db(&state)?;
    let cursor = payload.cursor.clone();
    let merge = build_catalog_merge(&connection, payload)?;
    Ok(report_from_merge(&merge, cursor, false))
}

#[tauri::command]
pub fn apply_research_catalog(
    payload: SourceCatalogPayload,
    state: State<'_, DatabaseState>,
) -> Result<SourceUpdateReport, String> {
    let mut connection = open_registry_db(&state)?;
    ensure_catalog_update_allowed(&connection)?;
    let cursor = payload.cursor.clone();
    let merge = build_catalog_merge(&connection, payload)?;
    let applied_count = (merge.added.len() + merge.updated.len() + merge.unavailable.len()) as u64;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    apply_catalog_merge(&transaction, &merge)?;
    write_catalog_meta(&transaction, applied_count, cursor.as_deref())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(report_from_merge(&merge, cursor, true))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::init_research_source_schema;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        init_research_source_schema(&connection).unwrap();
        connection
    }

    fn valid_source() -> ResearchSourceInput {
        ResearchSourceInput {
            id: "test-source".into(),
            name: "测试来源".into(),
            origin: Some("user".into()),
            adapter: "fetch-only".into(),
            base_url: "https://example.com/".into(),
            allowed_hosts: vec!["example.com".into()],
            search_endpoint: None,
            language: vec!["zh".into()],
            region: vec!["global".into()],
            categories: vec!["general".into()],
            trust_level: "custom".into(),
            status: Some("candidate".into()),
            user_enabled: Some(true),
            minimum_update_hours: Some(24),
        }
    }

    #[test]
    fn seeds_builtin_catalog() {
        let connection = test_connection();
        seed_builtin_catalog(&connection).unwrap();
        let sources = list_sources_from(&connection).unwrap();
        assert!(sources.iter().any(|source| source.id == "wikipedia-zh"));
    }

    #[test]
    fn saves_and_soft_deletes_source() {
        let mut connection = test_connection();
        let input = valid_source();
        let saved = build_source(input, None).unwrap();
        let before = saved.clone();
        insert_source(&connection, &saved).unwrap();
        assert_eq!(
            load_source(&connection, "test-source").unwrap().status,
            "candidate"
        );

        let mut deleted = saved.clone();
        deleted.deleted = true;
        deleted.user_enabled = false;
        deleted.status = "retired".into();
        update_source(&connection, &deleted).unwrap();
        assert!(load_source(&connection, "test-source").unwrap().deleted);

        let mut restored = before;
        restored.deleted = false;
        restored.user_enabled = true;
        restored.status = "candidate".into();
        update_source(&connection, &restored).unwrap();
        assert!(!load_source(&connection, "test-source").unwrap().deleted);
    }

    #[test]
    fn rejects_invalid_health_transition() {
        let connection = test_connection();
        let input = valid_source();
        let source = build_source(input, None).unwrap();
        insert_source(&connection, &source).unwrap();
        assert!(!allowed_health_transition("candidate", "candidate"));
        assert!(allowed_health_transition("candidate", "active"));
        assert!(!allowed_health_transition("retired", "active"));
    }

    #[test]
    fn normalizes_source_fields() {
        let mut source = build_source(valid_source(), None).unwrap();
        validate_source_mut(&mut source).unwrap();
        assert_eq!(source.base_url, "https://example.com");
        assert_eq!(source.allowed_hosts, vec!["example.com"]);
    }
}
