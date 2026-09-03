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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileInput {
    pub id: String,
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

#[derive(Debug, Clone, Deserialize)]
pub struct RequestMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    request_id: String,
    profile_id: String,
    messages: Vec<RequestMessage>,
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
    if kind == "ollama" && url.path().trim_end_matches('/') == "/v1" {
        url.set_path("");
    }
    if kind == "openai-compatible" && matches!(url.path(), "" | "/") {
        url.set_path("/v1");
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
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
        name: row.get(1)?,
        kind: row.get(2)?,
        base_url: row.get(3)?,
        model: row.get(4)?,
        context_window: row.get::<_, i64>(5)? as u32,
        has_api_key: row.get::<_, i64>(6)? != 0,
        updated_at: row.get::<_, i64>(7)? as u64,
    })
}

fn load_profile(id: &str, state: &State<'_, DatabaseState>) -> Result<ModelProfile, String> {
    database::open(state)?.query_row(
        "SELECT id, name, kind, base_url, model, context_window, has_api_key, updated_at FROM model_profiles WHERE id = ?1",
        [id], profile_from_row,
    ).map_err(|_| "找不到模型配置".to_string())
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
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取模型配置：{error}"))
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
    delete_secret(&id)?;
    database::open(&state)?
        .execute("DELETE FROM model_profiles WHERE id = ?1", [&id])
        .map_err(|error| format!("无法删除模型配置：{error}"))?;
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
        .into_iter()
        .flatten()
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
    state: State<'_, DatabaseState>,
    runtime: State<'_, RuntimeLogState>,
) -> Result<ConnectionResult, String> {
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
    let stored = input
        .api_key
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            if input.kind == "openai-compatible" {
                get_secret(&input.id).ok()
            } else {
                None
            }
        });
    let profile = ModelProfile {
        id: input.id,
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

fn emit_stream_line(
    line: &[u8],
    provider_kind: &str,
    channel: &Channel<ChatStreamEvent>,
) -> Result<(), String> {
    let line = String::from_utf8_lossy(line).trim().to_string();
    if line.is_empty() {
        return Ok(());
    }
    let payload = if provider_kind == "ollama" {
        line.as_str()
    } else {
        line.strip_prefix("data:").map(str::trim).unwrap_or("")
    };
    if payload.is_empty() || payload == "[DONE]" {
        return Ok(());
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
    if !content.is_empty() {
        let _ = channel.send(ChatStreamEvent::Chunk {
            content: content.to_string(),
        });
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
    let mut builder = client()?.post(url).json(&body);
    if let Some(value) = key.as_deref().filter(|value| !value.is_empty()) {
        builder = builder.bearer_auth(value);
    }
    let response = response_or_error(
        builder
            .send()
            .await
            .map_err(|error| format!("模型请求失败：{error}"))?,
    )
    .await?;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err("请求已停止".into());
        }
        buffer.extend_from_slice(&chunk.map_err(|error| format!("读取模型响应失败：{error}"))?);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            emit_stream_line(&line, &profile.kind, &channel)?;
        }
    }
    if !buffer.is_empty() {
        emit_stream_line(&buffer, &profile.kind, &channel)?;
    }
    let _ = channel.send(ChatStreamEvent::Done);
    Ok(())
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
    let request_id = request.request_id.clone();
    runtime.info(
        "chat.started",
        serde_json::json!({
            "requestId": request_id.clone(),
            "profileId": profile.id.clone(),
            "provider": profile.kind.clone(),
            "model": profile.model.clone(),
            "messageCount": request.messages.len(),
        })
        .as_object()
        .cloned()
        .unwrap_or_default(),
    );
    let key = if profile.has_api_key {
        Some(get_secret(&profile.id)?)
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
    }
}
