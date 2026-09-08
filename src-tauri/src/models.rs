use crate::{
    database::{self, DatabaseState},
    runtime_log::RuntimeLogState,
};
use futures_util::StreamExt;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, State};

const KEYRING_SERVICE: &str = "com.vinkey.desktop";
const CHAT_TIMEOUT_SECS: u64 = 300;
const MAX_WORKER_CHAT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConnectionInput {
    id: String,
    name: String,
    kind: String,
    base_url: String,
    api_key: Option<String>,
    clear_api_key: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConnection {
    id: String,
    name: String,
    kind: String,
    base_url: String,
    has_api_key: bool,
    updated_at: u64,
}

fn connection_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelConnection> {
    Ok(ModelConnection {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        base_url: row.get(3)?,
        has_api_key: row.get::<_, i64>(4)? != 0,
        updated_at: row.get::<_, i64>(5)? as u64,
    })
}

fn load_connection(db: &rusqlite::Connection, id: &str) -> Result<ModelConnection, String> {
    db.query_row("SELECT id, name, kind, base_url, has_api_key, updated_at FROM model_connections WHERE id=?1", [id], connection_from_row)
        .map_err(|error| format!("无法读取模型连接：{error}"))
}

fn hydrate_profile(db: &rusqlite::Connection, profile: &mut ModelProfile) -> Result<(), String> {
    use rusqlite::OptionalExtension;
    let id: Option<String> = db
        .query_row(
            "SELECT connection_id FROM model_profile_connections WHERE profile_id=?1",
            [&profile.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(id) = id {
        let connection = load_connection(db, &id)?;
        profile.connection_id = Some(id);
        profile.kind = connection.kind;
        profile.base_url = connection.base_url;
        profile.has_api_key = connection.has_api_key;
    }
    Ok(())
}

#[tauri::command]
pub fn list_model_connections(
    state: State<'_, DatabaseState>,
) -> Result<Vec<ModelConnection>, String> {
    let db = database::open(&state)?;
    let mut statement = db.prepare("SELECT id, name, kind, base_url, has_api_key, updated_at FROM model_connections ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], connection_from_row)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_model_connection(
    input: ModelConnectionInput,
    state: State<'_, DatabaseState>,
) -> Result<ModelConnection, String> {
    validate_id(&input.id)?;
    let base = normalize_base(&input.kind, &input.base_url)?;
    if input.name.trim().is_empty() {
        return Err("连接名称不能为空".into());
    }
    let db = database::open(&state)?;
    let mut has_key = load_connection(&db, &input.id)
        .map(|value| value.has_api_key)
        .unwrap_or(false);
    if input.clear_api_key.unwrap_or(false) {
        delete_secret(&input.id)?;
        has_key = false;
    }
    if let Some(key) = input
        .api_key
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        set_secret(&input.id, key.trim())?;
        has_key = true;
    }
    db.execute("INSERT INTO model_connections(id, name, kind, base_url, has_api_key, updated_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, base_url=excluded.base_url, has_api_key=excluded.has_api_key, updated_at=excluded.updated_at",
        params![input.id, input.name.trim(), input.kind, base, has_key as i32, now_ms() as i64]).map_err(|error| error.to_string())?;
    load_connection(&db, &input.id)
}

#[tauri::command]
pub fn delete_model_connection(id: String, state: State<'_, DatabaseState>) -> Result<(), String> {
    validate_id(&id)?;
    let mut db = database::open(&state)?;
    let transaction = db.transaction().map_err(|error| error.to_string())?;
    transaction.execute("DELETE FROM model_profiles WHERE id IN (SELECT profile_id FROM model_profile_connections WHERE connection_id=?1)", [&id]).map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM model_profile_connections WHERE connection_id=?1",
            [&id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM model_connections WHERE id=?1", [&id])
        .map_err(|error| error.to_string())?;
    delete_secret(&id)?;
    transaction.commit().map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileInput {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub context_window: u32,
    pub api_key: Option<String>,
    pub clear_api_key: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    connection_id: Option<String>,
    name: String,
    kind: String,
    base_url: String,
    model: String,
    context_window: u32,
    has_api_key: bool,
    updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    ok: bool,
    message: String,
    models: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStopResult {
    stopped: bool,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RequestMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    request_id: String,
    profile_id: String,
    source_policy: String,
    messages: Vec<RequestMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkerModelCompatibility {
    pub profile_id: String,
    pub provider_kind: String,
    pub base_url: String,
    pub model: String,
    pub context_window: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ChatStreamEvent {
    Chunk { content: String },
    Done,
    Error { message: String },
}

#[derive(Default)]
pub struct ChatCancellation(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("模型配置 ID 无效".into());
    }
    Ok(())
}

fn normalize_base(kind: &str, raw: &str) -> Result<String, String> {
    if !matches!(kind, "ollama" | "openai-compatible") {
        return Err("不支持的模型提供商".into());
    }
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("模型地址不能为空".into());
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let mut url = reqwest::Url::parse(&candidate).map_err(|_| "模型地址格式无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("模型地址仅支持 HTTP 或 HTTPS".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("模型地址不能包含查询参数或片段".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("模型地址不能包含凭据，请使用 API Key".into());
    }
    if kind == "ollama" && url.path().trim_end_matches('/') == "/v1" {
        url.set_path("");
    }
    if kind == "openai-compatible" && matches!(url.path(), "" | "/") {
        url.set_path("/v1");
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn is_loopback_base(base_url: &str) -> bool {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|address| address.is_loopback())
        })
}

fn normalize_ollama_model_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn ollama_model_names_match(left: &str, right: &str) -> bool {
    let left = normalize_ollama_model_name(left);
    let right = normalize_ollama_model_name(right);
    left == right || format!("{left}:latest") == right || left == format!("{right}:latest")
}

fn enforce_source_policy(request: &ChatRequest, profile: &ModelProfile) -> Result<(), String> {
    match request.source_policy.as_str() {
        "metadata-only" => Ok(()),
        "local-excerpts" if is_loopback_base(&profile.base_url) => Ok(()),
        "local-excerpts" => Err("正文摘录仅允许发送到本机回环模型；远程正文授权尚未启用".into()),
        "local-chunks" if is_loopback_base(&profile.base_url) => Ok(()),
        "local-chunks" => Err("正文分块仅允许发送到本机回环模型；远程正文授权尚未启用".into()),
        _ => Err("未知的模型数据来源策略".into()),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn set_secret(id: &str, value: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("model-{id}"))
        .map_err(|error| format!("无法访问系统凭据库：{error}"))?
        .set_password(value)
        .map_err(|error| format!("无法保存 API Key：{error}"))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn set_secret(_id: &str, _value: &str) -> Result<(), String> {
    Err("当前开发平台不支持系统凭据库".into())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn get_secret(id: &str) -> Result<String, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("model-{id}"))
        .map_err(|error| format!("无法访问系统凭据库：{error}"))?
        .get_password()
        .map_err(|_| "该模型配置尚未保存 API Key".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_secret(_id: &str) -> Result<String, String> {
    Err("当前开发平台不支持系统凭据库".into())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn delete_secret(id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &format!("model-{id}"))
        .map_err(|error| format!("无法访问系统凭据库：{error}"))?;
    let _ = entry.delete_credential();
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn delete_secret(_id: &str) -> Result<(), String> {
    Ok(())
}

fn profile_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelProfile> {
    Ok(ModelProfile {
        id: row.get(0)?,
        connection_id: None,
        name: row.get(1)?,
        kind: row.get(2)?,
        base_url: row.get(3)?,
        model: row.get(4)?,
        context_window: row.get::<_, i64>(5)? as u32,
        has_api_key: row.get::<_, i64>(6)? != 0,
        updated_at: row.get::<_, i64>(7)? as u64,
    })
}

fn load_profile_at(id: &str, state: &DatabaseState) -> Result<ModelProfile, String> {
    let connection = database::open_state(state)?;
    let mut profile = connection.query_row(
        "SELECT id, name, kind, base_url, model, context_window, has_api_key, updated_at FROM model_profiles WHERE id = ?1",
        [id], profile_from_row,
    ).map_err(|_| "找不到模型配置".to_string())?;
    hydrate_profile(&connection, &mut profile)?;
    Ok(profile)
}

fn load_profile(id: &str, state: &State<'_, DatabaseState>) -> Result<ModelProfile, String> {
    load_profile_at(id, state.inner())
}

fn worker_compatibility(profile: &ModelProfile) -> WorkerModelCompatibility {
    WorkerModelCompatibility {
        profile_id: profile.id.clone(),
        provider_kind: profile.kind.clone(),
        base_url: profile.base_url.clone(),
        model: profile.model.clone(),
        context_window: profile.context_window,
    }
}

pub(crate) fn worker_model_compatibility(
    profile_id: &str,
    database: &DatabaseState,
) -> Result<WorkerModelCompatibility, String> {
    validate_id(profile_id)?;
    let profile = load_profile_at(profile_id, database)?;
    let request = ChatRequest {
        request_id: "worker-preflight".into(),
        profile_id: profile_id.into(),
        source_policy: "local-chunks".into(),
        messages: Vec::new(),
    };
    enforce_source_policy(&request, &profile)?;
    Ok(worker_compatibility(&profile))
}

#[tauri::command]
pub fn list_model_profiles(state: State<'_, DatabaseState>) -> Result<Vec<ModelProfile>, String> {
    let connection = database::open(&state)?;
    let mut statement = connection.prepare(
        "SELECT id, name, kind, base_url, model, context_window, has_api_key, updated_at FROM model_profiles ORDER BY updated_at DESC"
    ).map_err(|error| format!("无法读取模型配置：{error}"))?;
    let rows = statement
        .query_map([], profile_from_row)
        .map_err(|error| format!("无法读取模型配置：{error}"))?;
    let mut profiles = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取模型配置：{error}"))?;
    for profile in &mut profiles {
        hydrate_profile(&connection, profile)?;
    }
    Ok(profiles)
}

#[tauri::command]
pub fn save_model_profile(
    input: ModelProfileInput,
    state: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<ModelProfile, String> {
    validate_id(&input.id)?;
    let base_url = normalize_base(&input.kind, &input.base_url)?;
    if input.name.trim().is_empty() || input.model.trim().is_empty() {
        return Err("配置名称和模型名称不能为空".into());
    }
    if !(2048..=2_000_000).contains(&input.context_window) {
        return Err("上下文窗口必须在 2048 到 2000000 之间".into());
    }
    let connection = database::open(&state)?;
    if let Some(id) = &input.connection_id {
        validate_id(id)?;
        load_connection(&connection, id)?;
    }
    let previous_has_key: bool = connection
        .query_row(
            "SELECT has_api_key FROM model_profiles WHERE id = ?1",
            [&input.id],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .unwrap_or(false);
    let mut has_api_key = previous_has_key;
    if input.clear_api_key.unwrap_or(false) {
        delete_secret(&input.id)?;
        has_api_key = false;
    }
    if let Some(api_key) = input
        .api_key
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        set_secret(&input.id, api_key.trim())?;
        has_api_key = true;
    }
    let updated_at = now_ms();
    connection.execute(
        "INSERT INTO model_profiles(id, name, kind, base_url, model, context_window, has_api_key, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, base_url=excluded.base_url,
         model=excluded.model, context_window=excluded.context_window, has_api_key=excluded.has_api_key, updated_at=excluded.updated_at",
        params![input.id, input.name.trim(), input.kind, base_url, input.model.trim(), input.context_window, has_api_key as i32, updated_at as i64],
    ).map_err(|error| format!("无法保存模型配置：{error}"))?;
    if let Some(id) = &input.connection_id {
        connection
            .execute(
                "INSERT INTO model_profile_connections(profile_id, connection_id) VALUES(?1, ?2)
             ON CONFLICT(profile_id) DO UPDATE SET connection_id=excluded.connection_id",
                params![input.id, id],
            )
            .map_err(|error| error.to_string())?;
    }
    let profile = load_profile(&input.id, &state)?;
    runtime.info(
        "model.profile_saved",
        serde_json::json!({
            "profileId": profile.id.clone(),
            "provider": profile.kind.clone(),
            "model": profile.model.clone(),
            "hasApiKey": profile.has_api_key,
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    );
    Ok(profile)
}

#[tauri::command]
pub fn delete_model_profile(
    id: String,
    state: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<(), String> {
    validate_id(&id)?;
    let profile = load_profile(&id, &state)?;
    if profile.connection_id.is_none() {
        delete_secret(&id)?;
    }
    database::open(&state)?
        .execute("DELETE FROM model_profiles WHERE id = ?1", [&id])
        .map_err(|error| format!("无法删除模型配置：{error}"))?;
    database::open(&state)?
        .execute(
            "DELETE FROM model_profile_connections WHERE profile_id = ?1",
            [&id],
        )
        .map_err(|error| error.to_string())?;
    runtime.info(
        "model.profile_deleted",
        serde_json::json!({ "profileId": id })
            .as_object()
            .cloned()
            .unwrap_or_default(),
    );
    Ok(())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("无法创建模型连接：{error}"))
}

fn chat_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(CHAT_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("无法创建模型连接：{error}"))
}

async fn discover(profile: &ModelProfile, api_key: Option<&str>) -> Result<Vec<String>, String> {
    let url = if profile.kind == "ollama" {
        format!("{}/api/tags", profile.base_url)
    } else {
        format!("{}/models", profile.base_url)
    };
    let mut request = client()?.get(url);
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("连接失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("服务返回 HTTP {status}"));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| "模型列表响应格式无效".to_string())?;
    let values = if profile.kind == "ollama" {
        value.get("models")
    } else {
        value.get("data")
    };
    let mut models = values
        .and_then(Value::as_array)
        .ok_or_else(|| "模型列表响应格式无效".to_string())?
        .iter()
        .filter_map(|item| {
            item.get(if profile.kind == "ollama" {
                "name"
            } else {
                "id"
            })
            .and_then(Value::as_str)
            .map(str::to_string)
        })
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
pub async fn test_model_connection(
    input: ModelProfileInput,
    runtime: State<'_, RuntimeLogState>,
) -> Result<ConnectionResult, String> {
    validate_id(&input.id)?;
    let started = Instant::now();
    runtime.info(
        "model.connection_test_started",
        serde_json::json!({
            "profileId": input.id.clone(),
            "provider": input.kind.clone(),
            "model": input.model.clone(),
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    );
    let base_url = normalize_base(&input.kind, &input.base_url)?;
    let stored = if input.clear_api_key.unwrap_or(false) {
        None
    } else {
        input
            .api_key
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| get_secret(input.connection_id.as_deref().unwrap_or(&input.id)).ok())
    };
    let profile = ModelProfile {
        id: input.id,
        connection_id: input.connection_id,
        name: input.name,
        kind: input.kind,
        base_url,
        model: input.model,
        context_window: input.context_window,
        has_api_key: stored.is_some(),
        updated_at: now_ms(),
    };
    match discover(&profile, stored.as_deref()).await {
        Ok(models) => {
            runtime.info(
                "model.connection_tested",
                serde_json::json!({
                    "ok": true,
                    "modelCount": models.len(),
                    "durationMs": started.elapsed().as_millis(),
                })
                .as_object()
                .cloned()
                .unwrap_or_default(),
            );
            Ok(ConnectionResult {
                ok: true,
                message: if models.is_empty() {
                    "连接成功，但服务未返回模型".into()
                } else {
                    format!("连接成功，发现 {} 个模型", models.len())
                },
                models,
            })
        }
        Err(message) => {
            runtime.error("model.connection_tested", &message);
            Ok(ConnectionResult {
                ok: false,
                message,
                models: Vec::new(),
            })
        }
    }
}

async fn unload_local_ollama(profile: &ModelProfile) -> Result<OllamaStopResult, String> {
    let running = response_or_error(
        client()?
            .get(format!("{}/api/ps", profile.base_url))
            .send()
            .await
            .map_err(|error| format!("无法查询本机 Ollama 驻留模型：{error}"))?,
    )
    .await?
    .json::<Value>()
    .await
    .map_err(|_| "本机 Ollama 驻留模型响应格式无效".to_string())?;
    let is_running = running
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("name").or_else(|| item.get("model")))
        .filter_map(Value::as_str)
        .any(|name| ollama_model_names_match(name, &profile.model));
    if !is_running {
        return Ok(OllamaStopResult {
            stopped: false,
            message: format!("模型 {} 当前未驻留", profile.model),
        });
    }

    response_or_error(
        client()?
            .post(format!("{}/api/generate", profile.base_url))
            .json(&json!({ "model": profile.model, "keep_alive": 0 }))
            .send()
            .await
            .map_err(|error| format!("无法停止本机 Ollama 模型：{error}"))?,
    )
    .await?;
    Ok(OllamaStopResult {
        stopped: true,
        message: format!("已停止驻留模型 {}", profile.model),
    })
}

#[tauri::command]
pub async fn stop_ollama_model(
    profile_id: String,
    state: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<OllamaStopResult, String> {
    validate_id(&profile_id)?;
    let profile = load_profile(&profile_id, &state)?;
    if profile.kind != "ollama" || !is_loopback_base(&profile.base_url) {
        return Err("仅本机回环地址的 Ollama 配置可以停止驻留模型".into());
    }
    let started = Instant::now();
    let result = unload_local_ollama(&profile).await;
    match &result {
        Ok(value) => runtime.info(
            "model.ollama_stopped",
            serde_json::json!({
                "profileId": profile.id,
                "model": profile.model,
                "stopped": value.stopped,
                "durationMs": started.elapsed().as_millis(),
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        ),
        Err(message) => runtime.error("model.ollama_stop_failed", message),
    }
    result
}

async fn response_or_error(response: reqwest::Response) -> Result<reqwest::Response, String> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(240).collect());
    Err(format!("模型服务返回 HTTP {status}：{detail}"))
}

fn stream_line_content(line: &[u8], provider_kind: &str) -> Result<Option<String>, String> {
    let line = String::from_utf8_lossy(line).trim().to_string();
    if line.is_empty() {
        return Ok(None);
    }
    let payload = if provider_kind == "ollama" {
        line.as_str()
    } else {
        line.strip_prefix("data:").map(str::trim).unwrap_or("")
    };
    if payload.is_empty() || payload == "[DONE]" {
        return Ok(None);
    }
    let value: Value =
        serde_json::from_str(payload).map_err(|_| "模型流响应格式无效".to_string())?;
    let content = if provider_kind == "ollama" {
        value.pointer("/message/content")
    } else {
        value.pointer("/choices/0/delta/content")
    }
    .and_then(Value::as_str)
    .unwrap_or("");
    Ok((!content.is_empty()).then(|| content.to_string()))
}

async fn run_stream_with(
    request: &ChatRequest,
    profile: &ModelProfile,
    key: Option<&str>,
    cancel: &AtomicBool,
    mut on_chunk: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("请求已停止".into());
    }
    let messages = request
        .messages
        .iter()
        .map(|message| json!({"role": message.role, "content": message.content}))
        .collect::<Vec<_>>();
    let (url, body) = if profile.kind == "ollama" {
        (
            format!("{}/api/chat", profile.base_url),
            json!({"model": profile.model, "messages": messages, "stream": true}),
        )
    } else {
        (
            format!("{}/chat/completions", profile.base_url),
            json!({"model": profile.model, "messages": messages, "stream": true}),
        )
    };
    let mut builder = chat_client()?.post(url).json(&body);
    if let Some(value) = key.filter(|value| !value.is_empty()) {
        builder = builder.bearer_auth(value);
    }
    let response = response_or_error(builder.send().await.map_err(|error| {
        if error.is_timeout() {
            format!(
                "模型请求超时：{} 秒内未收到完整响应，请检查模型推理速度或缩短上下文",
                CHAT_TIMEOUT_SECS
            )
        } else {
            format!("模型请求失败：{error}")
        }
    })?)
    .await?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err("请求已停止".into());
        }
        buffer.extend_from_slice(&chunk.map_err(|error| {
            if error.is_timeout() {
                format!(
                    "模型响应超时：{} 秒内未完成响应，请检查模型推理速度或缩短上下文",
                    CHAT_TIMEOUT_SECS
                )
            } else if error.is_decode() {
                format!("模型响应解码失败：{error}，服务可能提前关闭了响应流")
            } else if error.is_body() {
                format!("模型响应连接中断：{error}")
            } else {
                format!("读取模型响应失败：{error}")
            }
        })?);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            if let Some(content) = stream_line_content(&line, &profile.kind)? {
                on_chunk(&content)?;
            }
        }
    }
    if !buffer.is_empty() {
        if let Some(content) = stream_line_content(&buffer, &profile.kind)? {
            on_chunk(&content)?;
        }
    }
    Ok(())
}

async fn run_stream(
    request: ChatRequest,
    profile: ModelProfile,
    key: Option<String>,
    channel: Channel<ChatStreamEvent>,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    run_stream_with(&request, &profile, key.as_deref(), &cancel, |content| {
        let _ = channel.send(ChatStreamEvent::Chunk {
            content: content.to_string(),
        });
        Ok(())
    })
    .await?;
    let _ = channel.send(ChatStreamEvent::Done);
    Ok(())
}

fn append_worker_chunk(content: &mut String, chunk: &str) -> Result<(), String> {
    if content.len().saturating_add(chunk.len()) > MAX_WORKER_CHAT_BYTES {
        return Err("Worker 模型输出超过 16 MB 限制".into());
    }
    content.push_str(chunk);
    Ok(())
}

pub(crate) async fn complete_worker_chat(
    profile_id: &str,
    messages: Vec<RequestMessage>,
    database: &DatabaseState,
    expected: &WorkerModelCompatibility,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let profile = load_profile_at(profile_id, database)?;
    if worker_compatibility(&profile) != *expected {
        return Err("模型配置已变化，不能复用当前 Worker 检查点".into());
    }
    let request = ChatRequest {
        request_id: "background-worker".into(),
        profile_id: profile_id.into(),
        source_policy: "local-chunks".into(),
        messages,
    };
    enforce_source_policy(&request, &profile)?;
    let key = if profile.has_api_key {
        Some(get_secret(
            profile.connection_id.as_deref().unwrap_or(&profile.id),
        )?)
    } else {
        None
    };
    let mut content = String::new();
    run_stream_with(&request, &profile, key.as_deref(), cancel, |chunk| {
        append_worker_chunk(&mut content, chunk)
    })
    .await?;
    Ok(content.trim().to_string())
}

#[tauri::command]
pub async fn stream_chat(
    request: ChatRequest,
    on_event: Channel<ChatStreamEvent>,
    database: State<'_, DatabaseState>,
    cancellations: State<'_, ChatCancellation>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<(), String> {
    let started = Instant::now();
    let profile = load_profile(&request.profile_id, &database)?;
    enforce_source_policy(&request, &profile)?;
    let request_id = request.request_id.clone();
    runtime.info(
        "chat.started",
        serde_json::json!({
            "requestId": request_id.clone(),
            "profileId": profile.id.clone(),
            "provider": profile.kind.clone(),
            "model": profile.model.clone(),
            "messageCount": request.messages.len(),
            "sourcePolicy": request.source_policy.clone(),
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    );
    let key = if profile.has_api_key {
        Some(get_secret(
            profile.connection_id.as_deref().unwrap_or(&profile.id),
        )?)
    } else {
        None
    };
    let cancel = Arc::new(AtomicBool::new(false));
    cancellations
        .0
        .lock()
        .map_err(|_| "取消状态不可用".to_string())?
        .insert(request.request_id.clone(), cancel.clone());
    let result = run_stream(request.clone(), profile, key, on_event.clone(), cancel).await;
    if let Ok(mut values) = cancellations.0.lock() {
        values.remove(&request.request_id);
    }
    if let Err(message) = &result {
        let _ = on_event.send(ChatStreamEvent::Error {
            message: message.clone(),
        });
    }
    match &result {
        Ok(()) => runtime.info(
            "chat.completed",
            serde_json::json!({
                "requestId": request_id.clone(),
                "durationMs": started.elapsed().as_millis(),
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        ),
        Err(message) if message == "请求已停止" => runtime.info(
            "chat.cancelled",
            serde_json::json!({
                "requestId": request_id,
                "durationMs": started.elapsed().as_millis(),
            })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        ),
        Err(message) => runtime.error("chat.failed", message),
    }
    result
}

#[tauri::command]
pub fn cancel_chat(request_id: String, state: State<'_, ChatCancellation>) -> Result<(), String> {
    if let Some(flag) = state
        .0
        .lock()
        .map_err(|_| "取消状态不可用".to_string())?
        .get(&request_id)
    {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_profiles_and_resolves_shared_connection_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("models.sqlite3");
        database::init(&path).unwrap();
        let db = rusqlite::Connection::open(&path).unwrap();
        db.execute("INSERT INTO model_profiles VALUES('legacy', 'Existing', 'openai-compatible', 'https://old.example/v1', 'same-model', 8192, 1, 1)", []).unwrap();
        database::init(&path).unwrap();
        let state = DatabaseState(path.clone());
        let migrated = load_profile_at("legacy", &state).unwrap();
        assert_eq!(migrated.connection_id.as_deref(), Some("legacy"));
        assert!(migrated.has_api_key);

        db.execute("INSERT INTO model_profiles VALUES('second-model', 'Second', 'ollama', 'http://localhost:11434', 'other-model', 16384, 0, 2)", []).unwrap();
        db.execute(
            "INSERT INTO model_profile_connections VALUES('second-model', 'legacy')",
            [],
        )
        .unwrap();
        db.execute("UPDATE model_connections SET base_url='https://new.example/v1', has_api_key=0 WHERE id='legacy'", []).unwrap();
        database::init(&path).unwrap();
        let second = load_profile_at("second-model", &state).unwrap();
        assert_eq!(second.connection_id.as_deref(), Some("legacy"));
        assert_eq!(second.base_url, "https://new.example/v1");
        assert_eq!(second.kind, "openai-compatible");
        assert_eq!(second.model, "other-model");
        assert!(!second.has_api_key);
        assert_eq!(
            load_profile_at("legacy", &state).unwrap().base_url,
            second.base_url
        );
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM model_connections", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn normalizes_local_provider_addresses() {
        assert_eq!(
            normalize_base("ollama", "192.168.1.5:11434/v1/").unwrap(),
            "http://192.168.1.5:11434"
        );
        assert_eq!(
            normalize_base("openai-compatible", "localhost:1234").unwrap(),
            "http://localhost:1234/v1"
        );
    }

    #[test]
    fn rejects_non_http_endpoints() {
        assert!(normalize_base("ollama", "file:///tmp/model").is_err());
        assert!(normalize_base("other", "http://localhost").is_err());
        assert!(normalize_base("openai-compatible", "https://user:secret@example.com/v1").is_err());
    }

    #[test]
    fn identifies_only_loopback_model_addresses() {
        assert!(is_loopback_base("http://localhost:11434"));
        assert!(is_loopback_base("http://127.0.0.1:1234/v1"));
        assert!(is_loopback_base("http://[::1]:8080"));
        assert!(!is_loopback_base("http://192.168.1.5:11434"));
        assert!(!is_loopback_base("https://api.openai.com/v1"));
    }

    #[test]
    fn matches_ollama_latest_aliases_only() {
        assert!(ollama_model_names_match("qwen3:8b", "QWEN3:8B"));
        assert!(ollama_model_names_match("model", "model:latest"));
        assert!(!ollama_model_names_match("qwen3:8b", "qwen3:14b"));
    }

    #[test]
    fn protects_focused_excerpts_with_the_loopback_policy() {
        let request = ChatRequest {
            request_id: "request-1".into(),
            profile_id: "profile-1".into(),
            source_policy: "local-excerpts".into(),
            messages: vec![],
        };
        let mut profile = ModelProfile {
            id: "profile-1".into(),
            connection_id: None,
            name: "Local".into(),
            kind: "openai-compatible".into(),
            base_url: "http://127.0.0.1:1234/v1".into(),
            model: "local-model".into(),
            context_window: 8192,
            has_api_key: false,
            updated_at: 0,
        };
        assert!(enforce_source_policy(&request, &profile).is_ok());
        profile.base_url = "https://api.example.com/v1".into();
        assert!(enforce_source_policy(&request, &profile).is_err());
    }

    #[test]
    fn bounds_collected_worker_model_output() {
        let mut content = "x".repeat(MAX_WORKER_CHAT_BYTES - 1);
        append_worker_chunk(&mut content, "y").unwrap();
        assert_eq!(content.len(), MAX_WORKER_CHAT_BYTES);
        assert!(append_worker_chunk(&mut content, "z")
            .unwrap_err()
            .contains("16 MB"));
    }
}
