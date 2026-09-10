use crate::{database, job_service, long_text, models, read_document_at, task_runtime, Workspace};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

const WORKER_VERSION: &str = "long-text-worker-6";
const PROMPT_VERSION: &str = "long-text-prompts-2";
const OUTPUT_SCHEMA_VERSION: &str = "long-text-output-3";
const INPUT_NAME: &str = "worker-input.json";
const OUTPUT_NAME: &str = "worker-output.json";
const EVENTS_NAME: &str = "worker-events.json";
const CHECKPOINTS_NAME: &str = "worker-checkpoints.json";
const CHECKPOINT_SCHEMA_VERSION: &str = "long-text-checkpoints-2";
const MAP_CACHE_DIR: &str = "_stage-cache";
const MAP_CACHE_SCHEMA_VERSION: &str = "long-text-map-cache-2";
const MAX_MAP_CACHE_ENTRIES: usize = 1_024;
const MAX_WORKER_EVENTS: usize = 1_000;
const MAX_MODEL_ATTEMPTS: u32 = 3;
const MIN_CHUNK_TOKENS: usize = 128;
const VALIDATOR_VERSION: &str = "evidence-gate-2";
const NO_EVIDENCE: &str = "未找到与任务相关的证据。";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkerDocumentInput {
    pub path: String,
    pub source_fingerprint: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkerExcludedDocument {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartLongTextWorkerInput {
    pub job_id: String,
    pub instruction: String,
    pub instruction_hash: String,
    pub profile_id: String,
    pub context_window: u32,
    pub source_policy: String,
    pub max_tokens: usize,
    pub overlap_tokens: usize,
    pub dispatch: task_runtime::WorkerDispatchIdentity,
    #[serde(default)]
    pub document_index: Option<String>,
    pub documents: Vec<WorkerDocumentInput>,
    #[serde(default)]
    pub excluded_documents: Vec<WorkerExcludedDocument>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LongTextWorkerSnapshot {
    worker_version: String,
    prompt_version: String,
    output_schema_version: String,
    compatibility_key: String,
    workspace_id: String,
    created_at: u64,
    model: models::WorkerModelCompatibility,
    input: StartLongTextWorkerInput,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceReference {
    pub source_id: String,
    pub chunk_id: Option<String>,
    pub line_start: usize,
    pub line_end: usize,
    pub start_char: Option<usize>,
    pub end_char: Option<usize>,
    pub quote: Option<String>,
    pub verified: bool,
    pub verification_error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LongTextWorkerOutput {
    pub worker_version: String,
    pub prompt_version: String,
    pub output_schema_version: String,
    pub compatibility_key: String,
    pub pipeline_completed: bool,
    pub job_id: String,
    pub workspace_id: String,
    pub source_fingerprints: HashMap<String, String>,
    pub manifests: Vec<long_text::ChunkManifest>,
    pub content: String,
    pub evidence: Vec<EvidenceReference>,
    pub chunk_count: usize,
    pub summary_count: usize,
    pub model_invocation_count: usize,
    pub map_cache_hits: usize,
    pub stage_cache_hits: usize,
    pub job_checkpoint_hits: usize,
    pub duration_ms: u64,
    pub completed_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskWorkerEvent {
    pub sequence: u64,
    pub timestamp: u64,
    pub job_id: String,
    pub stage: String,
    pub status: String,
    pub completed: usize,
    pub total: usize,
    pub message: String,
    #[serde(default)]
    pub artifact: Option<String>,
    #[serde(default)]
    pub cache_source: Option<String>,
}

#[derive(Clone, Debug)]
struct WorkerProgress {
    stage: String,
    step_id: Option<String>,
    completed: usize,
    total: usize,
}

impl Default for WorkerProgress {
    fn default() -> Self {
        Self {
            stage: "lifecycle".into(),
            step_id: None,
            completed: 0,
            total: 0,
        }
    }
}

#[derive(Default)]
struct WorkerControl {
    cancel: AtomicBool,
    pause: AtomicBool,
    completed: AtomicUsize,
    total: AtomicUsize,
    progress: Mutex<WorkerProgress>,
}

impl WorkerControl {
    fn set_phase(&self, stage: &str, step_id: Option<String>, completed: usize, total: usize) {
        self.completed.store(completed, Ordering::Relaxed);
        self.total.store(total, Ordering::Relaxed);
        if let Ok(mut progress) = self.progress.lock() {
            *progress = WorkerProgress {
                stage: stage.into(),
                step_id,
                completed,
                total,
            };
        }
    }

    fn set_completed(&self, completed: usize) {
        self.completed.store(completed, Ordering::Relaxed);
        if let Ok(mut progress) = self.progress.lock() {
            progress.completed = completed;
        }
    }

    fn snapshot(&self) -> WorkerProgress {
        self.progress
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default()
    }
}

#[derive(Clone, Default)]
pub struct WorkerRuntimeState {
    controls: Arc<Mutex<HashMap<String, Arc<WorkerControl>>>>,
    event_write: Arc<Mutex<()>>,
}

impl WorkerRuntimeState {
    pub fn has_workers(&self) -> bool {
        self.controls
            .lock()
            .map(|controls| !controls.is_empty())
            .unwrap_or(true)
    }
}

#[derive(Clone, Debug)]
struct SummaryRecord {
    source_id: String,
    chunk_id: String,
    heading: Option<String>,
    text: String,
    evidence: Vec<EvidenceReference>,
    artifact: String,
    content_hash: String,
    volume: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckpointDependency {
    artifact: String,
    content_hash: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkerCheckpoint {
    artifact: String,
    stage: String,
    source_id: Option<String>,
    source_fingerprint: Option<String>,
    dependencies: Vec<CheckpointDependency>,
    content_hash: String,
    created_at: u64,
    #[serde(default)]
    cache_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkerCheckpointManifest {
    schema_version: String,
    compatibility_key: String,
    updated_at: u64,
    entries: Vec<WorkerCheckpoint>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MapCacheEntry {
    schema_version: String,
    cache_key: String,
    worker_version: String,
    prompt_version: String,
    output_schema_version: String,
    model: models::WorkerModelCompatibility,
    prompt_hash: String,
    content_hash: String,
    content: String,
    created_at: u64,
    validation_status: String,
    validator_version: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn valid_fingerprint(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate(input: &StartLongTextWorkerInput) -> Result<(), String> {
    if !valid_id(&input.job_id) || !valid_id(&input.profile_id) {
        return Err("Worker Job 或模型配置 ID 无效".into());
    }
    if input.instruction.trim().is_empty() || input.instruction.chars().count() > 200_000 {
        return Err("Worker 指令为空或超过限制".into());
    }
    if !valid_fingerprint(&input.instruction_hash)
        || input.instruction_hash != long_text::source_fingerprint(&input.instruction)
    {
        return Err("Worker 指令指纹无效".into());
    }
    if input.source_policy != "local-chunks" {
        return Err("长文本 Worker 仅接受 local-chunks 来源策略".into());
    }
    task_runtime::validate_worker_identity(&input.dispatch)?;
    if input.dispatch.job_id != input.job_id {
        return Err("Worker Job ID 与 Dispatch 身份不一致".into());
    }
    if !(2_048..=1_048_576).contains(&input.context_window)
        || !(128..=6_000).contains(&input.max_tokens)
        || input.overlap_tokens >= input.max_tokens
        || input.overlap_tokens > 1_024
    {
        return Err("Worker 上下文或分块预算无效".into());
    }
    if input
        .document_index
        .as_deref()
        .is_some_and(|value| value.len() > 512 * 1024)
    {
        return Err("Worker 文档索引超过限制".into());
    }
    if input.documents.is_empty() || input.documents.len() > 100 {
        return Err("Worker 文档数量无效".into());
    }
    let mut paths = HashSet::new();
    for document in &input.documents {
        if document.path.trim().is_empty()
            || document.path.len() > 600
            || document.path.contains('\0')
            || !valid_fingerprint(&document.source_fingerprint)
            || !paths.insert(document.path.as_str())
        {
            return Err("Worker 文档目标或源指纹无效".into());
        }
    }
    if input.excluded_documents.len() > 500
        || input.excluded_documents.iter().any(|document| {
            document.path.trim().is_empty()
                || document.path.len() > 600
                || document.path.contains('\0')
                || !paths.insert(document.path.as_str())
                || document.name.trim().is_empty()
                || document.name.len() > 300
                || !matches!(
                    document.kind.as_str(),
                    "markdown" | "text" | "code" | "image" | "pdf" | "audio" | "video" | "binary"
                )
                || document.reason.as_deref().is_some_and(|reason| {
                    !matches!(
                        reason,
                        "supported"
                            | "sensitive"
                            | "unsupported"
                            | "not-targeted"
                            | "too-large"
                            | "read-error"
                    )
                })
        })
    {
        return Err("Worker 排除文档清单无效".into());
    }
    Ok(())
}

fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Worker 产物路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建 Worker 目录：{error}"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("无法创建 Worker 临时文件：{error}"))?;
    temporary
        .write_all(content)
        .map_err(|error| format!("无法写入 Worker 临时文件：{error}"))?;
    temporary
        .flush()
        .map_err(|error| format!("无法刷新 Worker 临时文件：{error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("无法同步 Worker 临时文件：{error}"))?;
    #[cfg(not(unix))]
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法替换 Worker 产物：{error}"))?;
    }
    temporary
        .persist(path)
        .map_err(|error| format!("无法提交 Worker 产物：{}", error.error))?;
    Ok(())
}

fn write_json(path: &Path, value: &impl Serialize, label: &str) -> Result<(), String> {
    let content =
        serde_json::to_vec_pretty(value).map_err(|error| format!("无法序列化{label}：{error}"))?;
    write_atomic(path, &content)
}

fn artifact_path(jobs_root: &Path, job_id: &str, name: &str) -> PathBuf {
    jobs_root.join(job_id).join(name)
}

fn compatibility_key(
    input: &StartLongTextWorkerInput,
    model: &models::WorkerModelCompatibility,
) -> Result<String, String> {
    let value = serde_json::to_string(&json!({
        "workerVersion": WORKER_VERSION,
        "promptVersion": PROMPT_VERSION,
        "outputSchemaVersion": OUTPUT_SCHEMA_VERSION,
        "chunkAlgorithmVersion": long_text::CHUNK_ALGORITHM_VERSION,
        "profile": model,
        "contextWindow": input.context_window,
        "maxTokens": input.max_tokens,
        "overlapTokens": input.overlap_tokens,
        "dispatch": input.dispatch,
        "documentIndexHash": input.document_index.as_deref().map(long_text::source_fingerprint)
    }))
    .map_err(|error| format!("无法生成模型兼容键：{error}"))?;
    Ok(long_text::source_fingerprint(&value))
}

fn persist_snapshot(
    jobs_root: &Path,
    workspace: &Workspace,
    input: &StartLongTextWorkerInput,
    model: &models::WorkerModelCompatibility,
) -> Result<LongTextWorkerSnapshot, String> {
    let key = compatibility_key(input, model)?;
    let path = artifact_path(jobs_root, &input.job_id, INPUT_NAME);
    if path.exists() {
        let bytes =
            fs::read(&path).map_err(|error| format!("无法读取 Worker 输入快照：{error}"))?;
        let previous: LongTextWorkerSnapshot = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Worker 输入快照损坏或版本过旧：{error}"))?;
        if previous.worker_version != WORKER_VERSION
            || previous.prompt_version != PROMPT_VERSION
            || previous.output_schema_version != OUTPUT_SCHEMA_VERSION
            || previous.compatibility_key != key
            || previous.workspace_id != workspace.id
            || previous.model != *model
            || previous.input != *input
        {
            return Err("Worker 恢复输入或模型兼容键与持久化快照不一致".into());
        }
        return Ok(previous);
    }
    let snapshot = LongTextWorkerSnapshot {
        worker_version: WORKER_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        output_schema_version: OUTPUT_SCHEMA_VERSION.into(),
        compatibility_key: key,
        workspace_id: workspace.id.clone(),
        created_at: now_ms(),
        model: model.clone(),
        input: input.clone(),
    };
    write_json(&path, &snapshot, " Worker 输入快照")?;
    Ok(snapshot)
}

fn read_snapshot(jobs_root: &Path, job_id: &str) -> Result<LongTextWorkerSnapshot, String> {
    let bytes = fs::read(artifact_path(jobs_root, job_id, INPUT_NAME))
        .map_err(|error| format!("无法读取 Worker 输入快照：{error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("Worker 输入快照损坏或版本过旧：{error}"))
}

fn persist_start_manifest(
    jobs_root: &Path,
    workspace: &Workspace,
    input: &StartLongTextWorkerInput,
) -> Result<(), String> {
    let path = artifact_path(jobs_root, &input.job_id, "job-start.json");
    if path.exists() {
        return Ok(());
    }
    let fingerprints = input
        .documents
        .iter()
        .map(|document| (document.path.clone(), document.source_fingerprint.clone()))
        .collect::<HashMap<_, _>>();
    let timestamp = now_ms();
    write_json(
        &path,
        &json!({
            "jobId": input.job_id,
            "workspaceId": workspace.id,
            "instruction": input.instruction,
            "status": "running",
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "documentCount": input.documents.len() + input.excluded_documents.len(),
            "supportedDocumentCount": input.documents.len(),
            "excludedDocuments": input.excluded_documents,
            "sourceFingerprints": fingerprints
        }),
        " Worker 任务清单",
    )
}

fn event_fields(values: Value) -> Map<String, Value> {
    values.as_object().cloned().unwrap_or_default()
}

fn read_events_at(jobs_root: &Path, job_id: &str) -> Result<Vec<TaskWorkerEvent>, String> {
    let path = artifact_path(jobs_root, job_id, EVENTS_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(path).map_err(|error| format!("无法读取 Worker 事件：{error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("Worker 事件记录损坏：{error}"))
}

fn publish(
    jobs_root: &Path,
    runtime: &WorkerRuntimeState,
    app: &AppHandle,
    mut event: TaskWorkerEvent,
) -> Result<(), String> {
    let _guard = runtime
        .event_write
        .lock()
        .map_err(|_| "Worker 事件写入状态不可用".to_string())?;
    event = persist_event(jobs_root, event)?;
    let _ = app.emit("task-worker-event", event);
    Ok(())
}

fn persist_event(jobs_root: &Path, mut event: TaskWorkerEvent) -> Result<TaskWorkerEvent, String> {
    let mut events = read_events_at(jobs_root, &event.job_id)?;
    event.sequence = events.last().map(|value| value.sequence + 1).unwrap_or(1);
    event.timestamp = now_ms();
    events.push(event.clone());
    if events.len() > MAX_WORKER_EVENTS {
        events.drain(0..events.len() - MAX_WORKER_EVENTS);
    }
    write_json(
        &artifact_path(jobs_root, &event.job_id, EVENTS_NAME),
        &events,
        " Worker 事件",
    )?;
    Ok(event)
}

fn worker_event(
    job_id: &str,
    stage: &str,
    status: &str,
    completed: usize,
    total: usize,
    message: impl Into<String>,
) -> TaskWorkerEvent {
    TaskWorkerEvent {
        sequence: 0,
        timestamp: 0,
        job_id: job_id.into(),
        stage: stage.into(),
        status: status.into(),
        completed,
        total,
        message: message.into(),
        artifact: None,
        cache_source: None,
    }
}

async fn wait_for_control(control: &WorkerControl) -> Result<(), String> {
    loop {
        if control.cancel.load(Ordering::Relaxed) {
            return Err("请求已停止".into());
        }
        if !control.pause.load(Ordering::Relaxed) {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

fn read_output_at(jobs_root: &Path, job_id: &str) -> Result<Option<LongTextWorkerOutput>, String> {
    let path = artifact_path(jobs_root, job_id, OUTPUT_NAME);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| format!("无法读取 Worker 输出：{error}"))?;
    let output: LongTextWorkerOutput =
        serde_json::from_slice(&bytes).map_err(|error| format!("Worker 输出损坏：{error}"))?;
    if output.job_id != job_id {
        return Err("Worker 输出 Job ID 不匹配".into());
    }
    let snapshot = read_snapshot(jobs_root, job_id)?;
    let manifest = load_checkpoint_manifest(jobs_root, &snapshot);
    if output.compatibility_key != snapshot.compatibility_key
        || output.worker_version != WORKER_VERSION
        || output.prompt_version != PROMPT_VERSION
        || output.output_schema_version != OUTPUT_SCHEMA_VERSION
    {
        return Err("Worker 输出版本或输入不匹配".into());
    }
    let final_entry = manifest
        .entries
        .iter()
        .find(|entry| entry.artifact == "analysis.md")
        .ok_or("Worker 输出缺少综合检查点")?;
    if long_text::source_fingerprint(&output.content) != final_entry.content_hash {
        return Err("Worker 输出与综合检查点不一致".into());
    }
    for entry in &manifest.entries {
        if !is_model_checkpoint_artifact(&entry.artifact)
            || checkpoint_revoked(jobs_root, entry)
            || read_cached_text(&artifact_path(jobs_root, job_id, &entry.artifact))
                .is_none_or(|text| long_text::source_fingerprint(&text) != entry.content_hash)
            || entry.dependencies.iter().any(|dependency| {
                !manifest.entries.iter().any(|parent| {
                    parent.artifact == dependency.artifact
                        && parent.content_hash == dependency.content_hash
                })
            })
        {
            return Err("Worker 输出依赖已变化或作废".into());
        }
    }
    Ok(Some(output))
}

fn load_and_chunk_document(
    workspace: &Workspace,
    source: &WorkerDocumentInput,
    max_tokens: usize,
    overlap_tokens: usize,
) -> Result<(long_text::ChunkManifest, String), String> {
    let document = read_document_at(workspace, &source.path)?;
    if !matches!(document.kind, "markdown" | "text" | "code") {
        return Err(format!("Worker 不支持该文档类型：{}", source.path));
    }
    let actual_fingerprint = long_text::source_fingerprint(&document.content);
    if actual_fingerprint != source.source_fingerprint {
        return Err(format!("源文档已变化，无法继续 Worker：{}", source.path));
    }
    let manifest =
        long_text::chunk_text(document.path, &document.content, max_tokens, overlap_tokens)?;
    Ok((manifest, document.content))
}

fn read_cached_manifest(
    jobs_root: &Path,
    input: &StartLongTextWorkerInput,
    index: usize,
    source: &WorkerDocumentInput,
) -> Option<long_text::ChunkManifest> {
    let bytes = fs::read(artifact_path(
        jobs_root,
        &input.job_id,
        &format!("manifest-{:03}.json", index + 1),
    ))
    .ok()?;
    let manifest = serde_json::from_slice::<long_text::ChunkManifest>(&bytes).ok()?;
    (manifest.source_id == source.path
        && manifest.source_fingerprint == source.source_fingerprint
        && manifest.algorithm_version == long_text::CHUNK_ALGORITHM_VERSION
        && manifest.max_tokens == input.max_tokens
        && manifest.overlap_tokens == input.overlap_tokens)
        .then_some(manifest)
}

fn read_cached_text(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 * 1024 {
        return None;
    }
    fs::read_to_string(path)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn map_cache_identity(
    snapshot: &LongTextWorkerSnapshot,
    prompt: &str,
) -> Result<(String, String), String> {
    let prompt_hash = long_text::source_fingerprint(prompt);
    let identity = serde_json::to_string(&json!({
        "schemaVersion": MAP_CACHE_SCHEMA_VERSION,
        "workerVersion": WORKER_VERSION,
        "promptVersion": PROMPT_VERSION,
        "outputSchemaVersion": OUTPUT_SCHEMA_VERSION,
        "chunkAlgorithmVersion": long_text::CHUNK_ALGORITHM_VERSION,
        "model": snapshot.model,
        "promptHash": prompt_hash,
        "serviceId": snapshot.input.dispatch.service_id,
        "policyVersion": snapshot.input.dispatch.policy_version,
        "dispatchVersion": snapshot.input.dispatch.dispatch_version,
        "validatorVersion": VALIDATOR_VERSION,
    }))
    .map_err(|error| format!("无法生成 Map 缓存键：{error}"))?;
    Ok((long_text::source_fingerprint(&identity), prompt_hash))
}

fn map_cache_path(jobs_root: &Path, cache_key: &str) -> PathBuf {
    jobs_root
        .join(MAP_CACHE_DIR)
        .join(format!("{cache_key}.json"))
}

fn read_map_cache(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    prompt: &str,
    documents: &HashMap<String, String>,
) -> Result<Option<String>, String> {
    let (cache_key, prompt_hash) = map_cache_identity(snapshot, prompt)?;
    let path = map_cache_path(jobs_root, &cache_key);
    let Ok(metadata) = fs::metadata(&path) else {
        return Ok(None);
    };
    if !metadata.is_file() || metadata.len() > 16 * 1024 * 1024 {
        let _ = fs::remove_file(path);
        return Ok(None);
    }
    let valid = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<MapCacheEntry>(&bytes).ok())
        .filter(|entry| {
            entry.schema_version == MAP_CACHE_SCHEMA_VERSION
                && entry.cache_key == cache_key
                && entry.worker_version == WORKER_VERSION
                && entry.prompt_version == PROMPT_VERSION
                && entry.output_schema_version == OUTPUT_SCHEMA_VERSION
                && entry.model == snapshot.model
                && entry.prompt_hash == prompt_hash
                && !entry.content.trim().is_empty()
                && long_text::source_fingerprint(&entry.content) == entry.content_hash
                && entry.validation_status == "accepted"
                && entry.validator_version == VALIDATOR_VERSION
                && !revoked_result(jobs_root, &cache_key, &entry.content_hash, entry.created_at)
                && validate_stage_output("cache", &entry.content, documents).is_ok()
        })
        .map(|entry| entry.content);
    if valid.is_none() {
        let _ = fs::remove_file(path);
    }
    Ok(valid)
}

fn prune_map_cache(jobs_root: &Path) -> Result<(), String> {
    let directory = jobs_root.join(MAP_CACHE_DIR);
    let Ok(entries) = fs::read_dir(&directory) else {
        return Ok(());
    };
    let mut files = entries
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
                && entry
                    .path()
                    .extension()
                    .is_some_and(|value| value == "json")
        })
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect::<Vec<_>>();
    if files.len() <= MAX_MAP_CACHE_ENTRIES {
        return Ok(());
    }
    files.sort_by_key(|(modified, _)| *modified);
    let remove_count = files.len() - MAX_MAP_CACHE_ENTRIES;
    for (_, path) in files.into_iter().take(remove_count) {
        fs::remove_file(path).map_err(|error| format!("无法清理过期 Map 缓存：{error}"))?;
    }
    Ok(())
}

fn revoked_result(jobs_root: &Path, key: &str, hash: &str, created: u64) -> bool {
    if !valid_fingerprint(key) || !valid_fingerprint(hash) {
        return true;
    }
    let path = jobs_root
        .join("_revoked")
        .join(format!("{key}-{hash}.json"));
    if !path.exists() {
        return false;
    }
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| value["createdAt"].as_u64())
        .is_none_or(|time| created <= time)
}

fn checkpoint_revoked(jobs_root: &Path, entry: &WorkerCheckpoint) -> bool {
    let Some(key) = &entry.cache_key else {
        return false;
    };
    revoked_result(jobs_root, key, &entry.content_hash, entry.created_at)
}

fn revoke_result(jobs_root: &Path, key: &str, hash: &str) -> Result<(), String> {
    if !valid_fingerprint(key) || !valid_fingerprint(hash) {
        return Err("缓存作废标识无效".into());
    }
    write_json(
        &jobs_root
            .join("_revoked")
            .join(format!("{key}-{hash}.json")),
        &json!({"cacheKey": key, "contentHash": hash, "status": "rejected", "createdAt": now_ms()}),
        "缓存作废记录",
    )?;
    remove_if_exists(&map_cache_path(jobs_root, key))?;
    Ok(())
}

fn persist_map_cache(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    prompt: &str,
    content: &str,
) -> Result<(), String> {
    let (cache_key, prompt_hash) = map_cache_identity(snapshot, prompt)?;
    let entry = MapCacheEntry {
        schema_version: MAP_CACHE_SCHEMA_VERSION.into(),
        cache_key: cache_key.clone(),
        worker_version: WORKER_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        output_schema_version: OUTPUT_SCHEMA_VERSION.into(),
        model: snapshot.model.clone(),
        prompt_hash,
        content_hash: long_text::source_fingerprint(content),
        content: content.into(),
        created_at: now_ms(),
        validation_status: "accepted".into(),
        validator_version: VALIDATOR_VERSION.into(),
    };
    write_json(&map_cache_path(jobs_root, &cache_key), &entry, " Map 缓存")?;
    prune_map_cache(jobs_root)
}

fn empty_checkpoint_manifest(snapshot: &LongTextWorkerSnapshot) -> WorkerCheckpointManifest {
    WorkerCheckpointManifest {
        schema_version: CHECKPOINT_SCHEMA_VERSION.into(),
        compatibility_key: snapshot.compatibility_key.clone(),
        updated_at: now_ms(),
        entries: Vec::new(),
    }
}

fn load_checkpoint_manifest(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
) -> WorkerCheckpointManifest {
    let path = artifact_path(jobs_root, &snapshot.input.job_id, CHECKPOINTS_NAME);
    let Ok(bytes) = fs::read(path) else {
        return empty_checkpoint_manifest(snapshot);
    };
    let Ok(manifest) = serde_json::from_slice::<WorkerCheckpointManifest>(&bytes) else {
        return empty_checkpoint_manifest(snapshot);
    };
    if manifest.schema_version != CHECKPOINT_SCHEMA_VERSION
        || manifest.compatibility_key != snapshot.compatibility_key
    {
        return empty_checkpoint_manifest(snapshot);
    }
    manifest
}

fn is_model_checkpoint_artifact(name: &str) -> bool {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return false;
    }
    if ["chapter-", "volume-", "summary-"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
        && name.ends_with(".md")
    {
        return true;
    }
    if name == "analysis.md" {
        return true;
    }
    if let Some(value) = name
        .strip_prefix("summary-")
        .and_then(|value| value.strip_suffix(".md"))
    {
        return !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit());
    }
    let Some(value) = name
        .strip_prefix("reduce-")
        .and_then(|value| value.strip_suffix(".md"))
    else {
        return false;
    };
    let mut parts = value.split('-');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(level), Some(index), None)
            if !level.is_empty()
                && !index.is_empty()
                && level.bytes().all(|byte| byte.is_ascii_digit())
                && index.bytes().all(|byte| byte.is_ascii_digit())
    )
}

fn prune_checkpoint_manifest(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    manifest: &mut WorkerCheckpointManifest,
) -> Result<(), String> {
    manifest.entries.retain(|entry| {
        is_model_checkpoint_artifact(&entry.artifact)
            && !checkpoint_revoked(jobs_root, entry)
            && read_cached_text(&artifact_path(
                jobs_root,
                &snapshot.input.job_id,
                &entry.artifact,
            ))
            .is_some_and(|content| long_text::source_fingerprint(&content) == entry.content_hash)
    });
    loop {
        let hashes = manifest
            .entries
            .iter()
            .map(|entry| (entry.artifact.clone(), entry.content_hash.clone()))
            .collect::<HashMap<_, _>>();
        let previous_len = manifest.entries.len();
        manifest.entries.retain(|entry| {
            entry.dependencies.iter().all(|dependency| {
                hashes.get(dependency.artifact.as_str()) == Some(&dependency.content_hash)
            })
        });
        if manifest.entries.len() == previous_len {
            break;
        }
    }
    let retained = manifest
        .entries
        .iter()
        .map(|entry| entry.artifact.as_str())
        .collect::<HashSet<_>>();
    let job_root = jobs_root.join(&snapshot.input.job_id);
    for entry in
        fs::read_dir(&job_root).map_err(|error| format!("无法扫描 Worker 检查点目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取 Worker 检查点目录项：{error}"))?;
        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if is_model_checkpoint_artifact(&name) && !retained.contains(name.as_str()) {
            fs::remove_file(entry.path())
                .map_err(|error| format!("无法清理失配 Worker 检查点 {name}：{error}"))?;
        }
    }
    manifest.updated_at = now_ms();
    write_json(
        &artifact_path(jobs_root, &snapshot.input.job_id, CHECKPOINTS_NAME),
        manifest,
        " Worker 检查点清单",
    )
}

fn checkpoint_text(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    manifest: &WorkerCheckpointManifest,
    artifact: &str,
    stage: &str,
    source_id: Option<&str>,
    source_fingerprint: Option<&str>,
    dependencies: &[CheckpointDependency],
    documents: &HashMap<String, String>,
) -> Option<String> {
    let entry = manifest.entries.iter().find(|entry| {
        entry.artifact == artifact
            && entry.stage == stage
            && entry.source_id.as_deref() == source_id
            && entry.source_fingerprint.as_deref() == source_fingerprint
            && entry.dependencies == dependencies
    })?;
    if checkpoint_revoked(jobs_root, entry) {
        return None;
    }
    let content = read_cached_text(&artifact_path(jobs_root, &snapshot.input.job_id, artifact))?;
    (long_text::source_fingerprint(&content) == entry.content_hash
        && validate_stage_output(stage, &content, documents).is_ok())
    .then_some(content)
}

fn persist_text_checkpoint(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    manifest: &mut WorkerCheckpointManifest,
    artifact: &str,
    stage: &str,
    source_id: Option<&str>,
    source_fingerprint: Option<&str>,
    dependencies: Vec<CheckpointDependency>,
    content: &str,
) -> Result<String, String> {
    write_atomic(
        &artifact_path(jobs_root, &snapshot.input.job_id, artifact),
        content.as_bytes(),
    )?;
    let content_hash = long_text::source_fingerprint(content);
    manifest.entries.retain(|entry| entry.artifact != artifact);
    manifest.entries.push(WorkerCheckpoint {
        artifact: artifact.into(),
        stage: stage.into(),
        source_id: source_id.map(str::to_string),
        source_fingerprint: source_fingerprint.map(str::to_string),
        dependencies,
        content_hash: content_hash.clone(),
        created_at: now_ms(),
        cache_key: None,
    });
    manifest.updated_at = now_ms();
    write_json(
        &artifact_path(jobs_root, &snapshot.input.job_id, CHECKPOINTS_NAME),
        manifest,
        " Worker 检查点清单",
    )?;
    Ok(content_hash)
}

fn checkpoint_matches_step(entry: &WorkerCheckpoint, step_id: &str) -> bool {
    match step_id {
        "chunking" | "map" => entry.stage == "map",
        "synthesis" | "chapter" | "volume" => entry.stage == step_id,
        "evidence" => false,
        _ => step_id
            .strip_prefix("reduce-")
            .and_then(|level| level.parse::<usize>().ok())
            .is_some_and(|level| {
                level > 0 && entry.artifact.starts_with(&format!("reduce-{level}-"))
            }),
    }
}

fn remove_if_exists(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_file(path).map_err(|error| format!("无法删除 Worker 检查点：{error}"))?;
    Ok(true)
}

fn invalidate_checkpoint_step(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    step_id: &str,
) -> Result<Vec<String>, String> {
    if !matches!(
        step_id,
        "chunking" | "map" | "chapter" | "volume" | "synthesis" | "evidence"
    ) && step_id
        .strip_prefix("reduce-")
        .and_then(|level| level.parse::<usize>().ok())
        .is_none_or(|level| level == 0)
    {
        return Err("Worker 重试步骤 ID 无效".into());
    }
    let mut manifest = load_checkpoint_manifest(jobs_root, snapshot);
    prune_checkpoint_manifest(jobs_root, snapshot, &mut manifest)?;
    let mut removed = manifest
        .entries
        .iter()
        .filter(|entry| checkpoint_matches_step(entry, step_id))
        .map(|entry| entry.artifact.clone())
        .collect::<HashSet<_>>();
    loop {
        let previous_len = removed.len();
        for entry in &manifest.entries {
            if entry
                .dependencies
                .iter()
                .any(|dependency| removed.contains(&dependency.artifact))
            {
                removed.insert(entry.artifact.clone());
            }
        }
        if removed.len() == previous_len {
            break;
        }
    }
    let mut removed_artifacts = removed.iter().cloned().collect::<Vec<_>>();
    for entry in manifest
        .entries
        .iter()
        .filter(|entry| removed.contains(&entry.artifact))
    {
        if let Some(key) = &entry.cache_key {
            revoke_result(jobs_root, key, &entry.content_hash)?;
        }
    }
    for artifact in &removed_artifacts {
        remove_if_exists(&artifact_path(jobs_root, &snapshot.input.job_id, artifact))?;
    }
    manifest
        .entries
        .retain(|entry| !removed.contains(&entry.artifact));

    if step_id == "chunking" {
        let job_root = jobs_root.join(&snapshot.input.job_id);
        for entry in fs::read_dir(&job_root)
            .map_err(|error| format!("无法扫描 Worker 分块检查点：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法读取 Worker 分块检查点：{error}"))?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("manifest-") && name.ends_with(".json") {
                fs::remove_file(entry.path())
                    .map_err(|error| format!("无法删除 Worker 分块检查点 {name}：{error}"))?;
                removed_artifacts.push(name);
            }
        }
    }
    for artifact in [OUTPUT_NAME, "job.json", "job-failed.json", "evidence.json"] {
        if remove_if_exists(&artifact_path(jobs_root, &snapshot.input.job_id, artifact))? {
            removed_artifacts.push(artifact.into());
        }
    }
    manifest.updated_at = now_ms();
    write_json(
        &artifact_path(jobs_root, &snapshot.input.job_id, CHECKPOINTS_NAME),
        &manifest,
        " Worker 检查点清单",
    )?;
    removed_artifacts.sort();
    removed_artifacts.dedup();
    Ok(removed_artifacts)
}

fn analysis_input_budget(context_window: u32) -> usize {
    let context_window = context_window as usize;
    let output_reserve = 4_096.min(1_024.max(context_window / 5));
    let safety_reserve = 512.max(context_window / 10);
    MIN_CHUNK_TOKENS.max(context_window.saturating_sub(output_reserve + safety_reserve + 256))
}

fn batch_budget(context_window: u32) -> usize {
    MIN_CHUNK_TOKENS.max(analysis_input_budget(context_window) * 7 / 10)
}

fn effective_document_index(input: &StartLongTextWorkerInput) -> Option<String> {
    input.document_index.as_deref().map(|value| {
        clip_to_tokens(
            value,
            (analysis_input_budget(input.context_window) / 4).max(64),
        )
    })
}

fn summary_clip_limit(input: &StartLongTextWorkerInput) -> usize {
    let index_tokens = effective_document_index(input)
        .as_deref()
        .map(long_text::estimate_tokens)
        .unwrap_or(0);
    (batch_budget(input.context_window)
        .saturating_sub(index_tokens)
        .saturating_sub(64)
        / 2)
    .max(64)
}

fn clip_to_tokens(value: &str, limit: usize) -> String {
    if long_text::estimate_tokens(value) <= limit {
        return value.to_string();
    }
    const MARKER: &str = "\n[该阶段摘要已按上下文预算截断]";
    let characters = value.chars().collect::<Vec<_>>();
    let (mut low, mut high) = (0usize, characters.len());
    while low < high {
        let middle = (low + high + 1) / 2;
        let candidate = format!(
            "{}{}",
            characters[..middle].iter().collect::<String>().trim(),
            MARKER
        );
        if long_text::estimate_tokens(&candidate) <= limit {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    format!(
        "{}{}",
        characters[..low].iter().collect::<String>().trim(),
        MARKER
    )
}

fn contains_any(instruction: &str, values: &[&str]) -> bool {
    values.iter().any(|value| instruction.contains(value))
}

fn is_creative_task(instruction: &str) -> bool {
    contains_any(
        instruction,
        &["续写", "改写", "润色", "校对", "修改", "创作", "生成"],
    )
}

fn is_relationship_task(instruction: &str) -> bool {
    contains_any(
        instruction,
        &[
            "关系",
            "关联",
            "联系",
            "冲突",
            "合作",
            "感情",
            "亲属关系",
            "是什么关系",
            "有何关系",
            "关系如何",
            "如何联系",
            "是否有关联",
        ],
    )
}

fn is_continuity_task(instruction: &str) -> bool {
    contains_any(
        instruction,
        &[
            "连续性",
            "连贯性",
            "前后矛盾",
            "设定冲突",
            "设定矛盾",
            "时间线冲突",
            "时间矛盾",
            "人物状态冲突",
            "人物状态矛盾",
            "伏笔检查",
            "伏笔审校",
            "伏笔回收",
            "吃书",
            "穿帮",
        ],
    )
}

fn chunk_task_guidance(instruction: &str) -> &'static str {
    if is_continuity_task(instruction) {
        "这是连续性审校任务。请提取当前分块中可核验的事实断言：人物状态、时间、地点、物品、世界规则、已埋设或已回收的伏笔，并保留叙述视角和不确定性。当前阶段只收集证据，不要仅凭信息缺失判定冲突。"
    } else if is_creative_task(instruction) {
        "这是创作或改写任务。请提取与任务相关的原文片段、人物状态、语气风格、连续性约束和可执行素材，暂不脱离证据完成最终创作。"
    } else {
        "请为后续汇总提取可核验的事实，不要臆测未出现的内容。"
    }
}

fn final_task_guidance(instruction: &str) -> &'static str {
    if is_continuity_task(instruction) {
        "请输出连续性审校报告。先给结论和覆盖范围，再按严重程度列出明确冲突、疑似冲突和待补证项。每个问题必须同时列出相互冲突或需要核对的事实、对应来源证据、影响范围和最小修改建议；证据不足时标记“待补证”，不得把未提及的信息当作矛盾。最后单列已检查但未发现冲突的关键设定与伏笔。"
    } else if is_creative_task(instruction) {
        "请根据这些阶段摘要完成用户的创作或改写任务，遵循原文人物、语气和连续性约束；不要把摘要过程本身当作回答。"
    } else if is_relationship_task(instruction) {
        "请先直接回答用户询问的人物关系，再说明关系性质、发展变化和关键事件；每个判断都保留来源分块标记或原文证据。若文档没有足够依据，明确标注未知，不要臆测。"
    } else {
        "请直接完成用户任务，并按任务相关的章节、阶段或主题组织回答；不要机械补充无关的文档概览。关键结论必须保留来源分块标记或原文证据，证据不足时明确标注未知。"
    }
}

fn chunk_prompt(input: &StartLongTextWorkerInput, chunk: &long_text::TextChunk) -> String {
    let index = effective_document_index(input)
        .as_deref()
        .map(|value| format!("{value}\n\n"))
        .unwrap_or_default();
    let heading = chunk
        .heading
        .as_deref()
        .map(|value| format!("章节/标题：{value}\n"))
        .unwrap_or_default();
    format!(
        "你是长文本任务 Agent 的局部 Map Skill。只依据下面这个原文分块处理用户任务。\n\n{index}用户任务：{}\n{heading}来源：{}，行 {}-{}\n\n<chunk id=\"{}\">\n{}\n</chunk>\n\n{}\n请输出简洁的结构化要点：内容概要、事件/冲突、人物及其目标或变化、线索/伏笔、可引用的原文证据，以及与用户任务直接相关的素材。每条证据必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote=\"原文短引\"]。",
        input.instruction, chunk.source_id, chunk.line_start, chunk.line_end, chunk.id, chunk.text, chunk_task_guidance(&input.instruction)
    )
}

fn summary_material(record: &SummaryRecord) -> String {
    let citations = record
        .evidence
        .iter()
        .filter(|item| item.verified)
        .take(2)
        .map(|item| {
            format!(
                "[source: {}{} lines={}-{} quote=\"{}\"]",
                item.source_id,
                item.chunk_id
                    .as_ref()
                    .map(|id| format!(" chunk={id}"))
                    .unwrap_or_default(),
                item.line_start,
                item.line_end,
                item.quote
                    .as_deref()
                    .unwrap_or("")
                    .chars()
                    .take(80)
                    .collect::<String>()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("{}\n{}", record.text, citations)
}

fn summary_prompt(
    input: &StartLongTextWorkerInput,
    records: &[SummaryRecord],
    final_stage: bool,
) -> String {
    let material = records
        .iter()
        .map(|record| {
            format!(
                "[{} {}{}]\n{}",
                record.source_id,
                record.chunk_id,
                record
                    .heading
                    .as_deref()
                    .map(|value| format!(" · {value}"))
                    .unwrap_or_default(),
                summary_material(record)
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let index = effective_document_index(input)
        .as_deref()
        .map(|value| format!("{value}\n"))
        .unwrap_or_default();
    let role = if final_stage {
        "你是长文本任务 Agent 的最终 Synthesis Skill。"
    } else {
        "你是长文本任务 Agent 的阶段 Reduce Skill。"
    };
    let guidance = if final_stage {
        final_task_guidance(&input.instruction)
    } else {
        "请压缩为更高层级的摘要，保留故事阶段、人物变化、因果关系、伏笔、任务相关素材和来源标记。"
    };
    format!("{role}\n{index}用户任务：{}\n\n以下是已经由局部 Map Skill 生成的摘要。它们不是原文，请合并重复事实并标记不确定或相互矛盾之处，不要补写没有依据的情节。\n\n{material}\n\n{guidance}\n\n最终回答中的每个关键结论都必须附来源标记，格式为 [source: 相对路径 chunk=块ID lines=起始行-结束行 quote=\"原文短引\"]；无法核验的结论标记为“未找到证据”。", input.instruction)
}

fn batch_summaries(
    records: &[SummaryRecord],
    input: &StartLongTextWorkerInput,
) -> Vec<Vec<SummaryRecord>> {
    let index_tokens = effective_document_index(input)
        .as_deref()
        .map(long_text::estimate_tokens)
        .unwrap_or(0);
    let limit =
        MIN_CHUNK_TOKENS.max(batch_budget(input.context_window).saturating_sub(index_tokens));
    let (mut batches, mut current, mut used) = (Vec::new(), Vec::new(), 0usize);
    for record in records {
        let cost = long_text::estimate_tokens(&summary_material(record)) + 32;
        if !current.is_empty() && used + cost > limit {
            batches.push(current);
            current = Vec::new();
            used = 0;
        }
        current.push(record.clone());
        used += cost;
    }
    if !current.is_empty() {
        batches.push(current);
    }
    if batches.len() == records.len() && records.len() > 1 {
        return records.chunks(2).map(|values| values.to_vec()).collect();
    }
    batches
}

fn parse_evidence(value: &str) -> Vec<EvidenceReference> {
    let Ok(pattern) = Regex::new(
        r#"\[source:\s*([^\]\n]+?)(?:\s+chunk=([^\]\s]+))?\s+lines=(\d+)-(\d+)(?:\s+quote=\"([^\"]*)\")?\]"#,
    ) else {
        return Vec::new();
    };
    pattern
        .captures_iter(value)
        .filter_map(|captures| {
            Some(EvidenceReference {
                source_id: captures.get(1)?.as_str().to_string(),
                chunk_id: captures.get(2).map(|value| value.as_str().to_string()),
                line_start: captures.get(3)?.as_str().parse().ok()?,
                line_end: captures.get(4)?.as_str().parse().ok()?,
                start_char: None,
                end_char: None,
                quote: captures.get(5).map(|value| value.as_str().to_string()),
                verified: false,
                verification_error: None,
            })
        })
        .collect()
}

fn verify_evidence(
    references: Vec<EvidenceReference>,
    documents: &HashMap<String, String>,
) -> Vec<EvidenceReference> {
    references
        .into_iter()
        .map(|mut reference| {
            let Some(document) = documents.get(&reference.source_id) else {
                reference.verification_error = Some("来源文件不在本次分析快照中".into());
                return reference;
            };
            let lines = document.split('\n').collect::<Vec<_>>();
            if reference.line_start < 1
                || reference.line_end < reference.line_start
                || reference.line_end > lines.len()
            {
                reference.verification_error = Some("行号超出来源文件范围".into());
                return reference;
            }
            if let Some(quote) = reference
                .quote
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                if !lines[reference.line_start - 1..reference.line_end]
                    .join("\n")
                    .contains(quote)
                {
                    reference.verification_error = Some("引用原文与来源行不一致".into());
                    return reference;
                }
            } else {
                reference.verification_error = Some("来源引用缺少非空原文短引".into());
                return reference;
            }
            reference.verified = true;
            reference.verification_error = None;
            reference
        })
        .collect()
}

fn deduplicate_evidence(references: Vec<EvidenceReference>) -> Vec<EvidenceReference> {
    let mut seen = HashSet::new();
    references
        .into_iter()
        .filter(|reference| {
            seen.insert((
                reference.source_id.clone(),
                reference.line_start,
                reference.line_end,
                reference.quote.clone(),
            ))
        })
        .collect()
}

fn validate_stage_output(
    stage: &str,
    content: &str,
    documents: &HashMap<String, String>,
) -> Result<Vec<EvidenceReference>, String> {
    if content.trim().is_empty() {
        return Err(format!("模型输出为空：{stage}"));
    }
    if content.trim() == NO_EVIDENCE {
        return Ok(Vec::new());
    }
    let evidence = verify_evidence(parse_evidence(content), documents);
    if content.matches("[source:").count() != evidence.len()
        || content.matches("```").count() % 2 != 0
    {
        return Err(format!("模型输出结构不完整：{stage}"));
    }
    if evidence.is_empty() {
        return Err(format!("模型输出缺少可验证来源引用：{stage}"));
    }
    if evidence.iter().any(|reference| !reference.verified) {
        return Err(format!("模型输出包含未通过校验的来源引用：{stage}"));
    }
    Ok(evidence)
}

fn validate_cached_output(
    workspace: &Workspace,
    snapshot: &LongTextWorkerSnapshot,
    output: &LongTextWorkerOutput,
) -> Result<(), String> {
    if output.content.trim().is_empty() {
        return Err("Worker 完整输出为空".into());
    }
    let expected_fingerprints = snapshot
        .input
        .documents
        .iter()
        .map(|document| (document.path.clone(), document.source_fingerprint.clone()))
        .collect::<HashMap<_, _>>();
    if output.source_fingerprints != expected_fingerprints {
        return Err("Worker 完整输出的源文档指纹不匹配".into());
    }
    let mut documents = HashMap::new();
    for source in &snapshot.input.documents {
        let document = read_document_at(workspace, &source.path)?;
        if long_text::source_fingerprint(&document.content) != source.source_fingerprint {
            return Err(format!("Worker 完整输出的源文档已变化：{}", source.path));
        }
        documents.insert(source.path.clone(), document.content);
    }
    validate_stage_output("synthesis", &output.content, &documents)?;
    if verify_evidence(output.evidence.clone(), &documents)
        .iter()
        .any(|reference| !reference.verified)
    {
        return Err("Worker 完整输出包含未通过校验的证据".into());
    }
    Ok(())
}

async fn model_text(
    jobs_root: &Path,
    runtime: &WorkerRuntimeState,
    app: &AppHandle,
    input: &StartLongTextWorkerInput,
    snapshot: &LongTextWorkerSnapshot,
    database: &database::DatabaseState,
    control: &WorkerControl,
    prompt: String,
    stage: &str,
    documents: &HashMap<String, String>,
    attempts: &mut usize,
) -> Result<String, String> {
    for attempt in 1..=MAX_MODEL_ATTEMPTS {
        wait_for_control(control).await?;
        *attempts += 1;
        let result = models::complete_worker_chat(
            &input.profile_id,
            vec![models::RequestMessage {
                role: "user".into(),
                content: format!("{}\n\n输出合同：每条事实保留来源路径、行号和非空原文短引。不要返回残缺标记或未闭合代码块。没有相关证据时，只返回：{}", prompt, NO_EVIDENCE),
            }],
            database,
            &snapshot.model,
            &control.cancel,
        )
        .await
        .and_then(|content| {
            if let Err(reason) = validate_stage_output(stage, &content, documents) {
                let name = format!("quarantine-{}.json", uuid::Uuid::new_v4());
                write_json(&artifact_path(jobs_root, &input.job_id, &name),
                    &json!({"status": "quarantined", "stage": stage, "reason": reason,
                        "validatorVersion": VALIDATOR_VERSION, "content": content, "createdAt": now_ms()}), "隔离结果")?;
                let mut event = worker_event(&input.job_id, stage, "running", control.completed.load(Ordering::Relaxed), control.total.load(Ordering::Relaxed), "返回结果未通过来源校验，已隔离，正在重试");
                event.artifact = Some(name);
                event.cache_source = Some("quarantined".into());
                publish(jobs_root, runtime, app, event)?;
                return Err(reason);
            }
            Ok(content)
        });
        match result {
            Ok(content) => return Ok(content),
            Err(message) if attempt < MAX_MODEL_ATTEMPTS && retryable_model_error(&message) => {
                wait_for_control(control).await?;
                let progress = control.snapshot();
                let step_id = progress
                    .step_id
                    .as_deref()
                    .ok_or_else(|| "Worker 重试缺少步骤身份".to_string())?;
                let retry_after_ms = 500 * u64::from(attempt);
                job_service::record_retry(
                    jobs_root,
                    &input.job_id,
                    step_id,
                    &message,
                    retry_after_ms,
                )?;
                publish(
                    jobs_root,
                    runtime,
                    app,
                    worker_event(
                        &input.job_id,
                        &progress.stage,
                        "running",
                        progress.completed,
                        progress.total,
                        format!(
                            "模型调用失败，{retry_after_ms} ms 后进行第 {}/{} 次尝试",
                            attempt + 1,
                            MAX_MODEL_ATTEMPTS
                        ),
                    ),
                )?;
                tokio::time::sleep(std::time::Duration::from_millis(retry_after_ms)).await;
            }
            Err(message) => return Err(message),
        }
    }
    Err("模型调用超过最大重试次数".into())
}

fn retryable_model_error(message: &str) -> bool {
    [
        "模型请求失败",
        "模型请求超时",
        "模型响应超时",
        "模型响应连接中断",
        "读取模型响应失败",
        "模型流响应格式无效",
        "模型没有返回可用内容",
        "模型输出为空",
        "模型输出结构不完整",
        "模型输出缺少可验证来源引用",
        "模型输出包含未通过校验的来源引用",
        "HTTP 408",
        "HTTP 429",
        "HTTP 500",
        "HTTP 502",
        "HTTP 503",
        "HTTP 504",
    ]
    .iter()
    .any(|value| message.contains(value))
}

#[derive(Default)]
struct PipelineCounts {
    requests: usize,
    shared: usize,
    map_shared: usize,
    checkpoints: usize,
}

struct StageRunner<'a> {
    jobs_root: &'a Path,
    snapshot: &'a LongTextWorkerSnapshot,
    runtime: &'a WorkerRuntimeState,
    app: &'a AppHandle,
    database: &'a database::DatabaseState,
    control: &'a WorkerControl,
    checkpoints: &'a mut WorkerCheckpointManifest,
    counts: &'a mut PipelineCounts,
}

impl StageRunner<'_> {
    async fn execute(
        &mut self,
        stage: &str,
        name: &str,
        prompt: String,
        dependencies: Vec<CheckpointDependency>,
        scope: &HashMap<String, String>,
    ) -> Result<(String, String), String> {
        wait_for_control(self.control).await?;
        let identity = serde_json::to_string(&json!({
            "stage": stage, "prompt": prompt,
            "children": dependencies.iter().map(|item| &item.content_hash).collect::<Vec<_>>(),
        }))
        .map_err(|error| error.to_string())?;
        let (key, _) = map_cache_identity(self.snapshot, &identity)?;
        let matches_key = self
            .checkpoints
            .entries
            .iter()
            .any(|entry| entry.artifact == name && entry.cache_key.as_ref() == Some(&key));
        let checkpoint = if matches_key {
            checkpoint_text(
                self.jobs_root,
                self.snapshot,
                self.checkpoints,
                name,
                stage,
                None,
                None,
                &dependencies,
                scope,
            )
        } else {
            None
        };
        let (text, origin) = if let Some(text) = checkpoint {
            self.counts.checkpoints += 1;
            (text, "checkpoint")
        } else if let Some(text) = read_map_cache(self.jobs_root, self.snapshot, &identity, scope)?
        {
            self.counts.shared += 1;
            if stage == "map" {
                self.counts.map_shared += 1;
            }
            (text, "shared")
        } else {
            let text = model_text(
                self.jobs_root,
                self.runtime,
                self.app,
                &self.snapshot.input,
                self.snapshot,
                self.database,
                self.control,
                prompt,
                stage,
                scope,
                &mut self.counts.requests,
            )
            .await?;
            persist_map_cache(self.jobs_root, self.snapshot, &identity, &text)?;
            (text, "model")
        };
        let hash = persist_text_checkpoint(
            self.jobs_root,
            self.snapshot,
            self.checkpoints,
            name,
            stage,
            None,
            None,
            dependencies,
            &text,
        )?;
        if let Some(entry) = self
            .checkpoints
            .entries
            .iter_mut()
            .find(|entry| entry.artifact == name)
        {
            entry.cache_key = Some(key);
        }
        write_json(
            &artifact_path(
                self.jobs_root,
                &self.snapshot.input.job_id,
                CHECKPOINTS_NAME,
            ),
            self.checkpoints,
            "检查点清单",
        )?;
        let progress = self.control.snapshot();
        let mut event = worker_event(
            &self.snapshot.input.job_id,
            stage,
            "running",
            progress.completed + 1,
            progress.total,
            if text.trim() == NO_EVIDENCE {
                "未找到相关证据，已保存覆盖记录"
            } else {
                "来源引用校验通过，已保存产物"
            },
        );
        event.artifact = Some(name.into());
        event.cache_source = Some(origin.into());
        publish(self.jobs_root, self.runtime, self.app, event)?;
        Ok((text, hash))
    }

    async fn summarize(
        &mut self,
        stage: &str,
        label: &str,
        records: Vec<SummaryRecord>,
        documents: &HashMap<String, String>,
    ) -> Result<SummaryRecord, String> {
        let first = records.first().ok_or("汇总节点为空")?.clone();
        let scope = scope_for_records(&records, documents);
        let mut input = self.snapshot.input.clone();
        input.document_index = None;
        let mut current = records;
        let mut round = 0;
        loop {
            let batches = batch_summaries(&current, &input);
            let mut next = Vec::new();
            for (index, batch) in batches.iter().enumerate() {
                let identity =
                    long_text::source_fingerprint(&format!("{stage}:{label}:{round}:{index}"));
                let name = format!("{stage}-{}.md", &identity[..24]);
                let deps = batch
                    .iter()
                    .map(|item| CheckpointDependency {
                        artifact: item.artifact.clone(),
                        content_hash: item.content_hash.clone(),
                    })
                    .collect();
                let prompt = format!(
                    "汇总层级：{stage}；范围：{label}\n{}",
                    summary_prompt(&input, batch, false)
                );
                let (text, hash) = self.execute(stage, &name, prompt, deps, &scope).await?;
                next.push(SummaryRecord {
                    source_id: first.source_id.clone(),
                    chunk_id: label.into(),
                    heading: first.heading.clone(),
                    volume: first.volume.clone(),
                    evidence: verify_evidence(parse_evidence(&text), &scope),
                    text: clip_to_tokens(&text, summary_clip_limit(&input)),
                    artifact: name,
                    content_hash: hash,
                });
            }
            if next.len() == 1 {
                return Ok(next.remove(0));
            }
            current = next;
            round += 1;
        }
    }
}

// Preserve original line numbers while limiting validation to the material the stage actually saw.
fn scope_for_records(
    records: &[SummaryRecord],
    documents: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut scope = HashMap::new();
    for record in records {
        for reference in &record.evidence {
            if !reference.verified {
                continue;
            }
            if let Some(document) = documents.get(&reference.source_id) {
                let lines = document.split('\n').collect::<Vec<_>>();
                let target = scope
                    .entry(reference.source_id.clone())
                    .or_insert_with(|| vec![String::new(); lines.len()]);
                for index in
                    reference.line_start.saturating_sub(1)..reference.line_end.min(lines.len())
                {
                    target[index] = lines[index].into();
                }
            }
        }
    }
    scope
        .into_iter()
        .map(|(path, lines)| (path, lines.join("\n")))
        .collect()
}

fn chunk_scope(chunk: &long_text::TextChunk) -> HashMap<String, String> {
    HashMap::from([(
        chunk.source_id.clone(),
        format!(
            "{}{}",
            "\n".repeat(chunk.line_start.saturating_sub(1)),
            chunk.text
        ),
    )])
}

fn volume_at(document: &str, line: usize, path: &str) -> String {
    let mut volume = Path::new(path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_else(|| "全书".into());
    for text in document.lines().take(line) {
        let text = text.trim().trim_start_matches('#').trim();
        if text.starts_with('第') && text.contains('卷') && text.chars().count() <= 100 {
            volume = text.into();
        }
    }
    volume
}

fn update_step(
    jobs_root: &Path,
    job_id: &str,
    step_id: &str,
    kind: Option<&str>,
    status: &str,
    checkpoint: Option<String>,
    event_type: &str,
    fields: Value,
) -> Result<job_service::TaskJob, String> {
    job_service::update(
        jobs_root,
        job_service::UpdateTaskJobInput {
            task_id: job_id.into(),
            status: None,
            step_id: Some(step_id.into()),
            step_kind: kind.map(str::to_string),
            step_status: Some(status.into()),
            checkpoint,
            error: None,
            event_type: Some(event_type.into()),
            event_fields: event_fields(fields),
        },
    )
}

async fn run_pipeline_worker(
    jobs_root: PathBuf,
    workspace: Workspace,
    database: database::DatabaseState,
    snapshot: LongTextWorkerSnapshot,
    control: Arc<WorkerControl>,
    runtime: WorkerRuntimeState,
    app: AppHandle,
) -> Result<(), String> {
    let input = &snapshot.input;
    let pipeline_started_at = now_ms();
    if let Some(output) = read_output_at(&jobs_root, &input.job_id).unwrap_or(None) {
        if output.worker_version != WORKER_VERSION
            || output.prompt_version != PROMPT_VERSION
            || output.output_schema_version != OUTPUT_SCHEMA_VERSION
            || output.compatibility_key != snapshot.compatibility_key
            || output.workspace_id != workspace.id
            || !output.pipeline_completed
        {
            return Err("Worker 缓存与当前输入或模型不兼容".into());
        }
        if validate_cached_output(&workspace, &snapshot, &output).is_err() {
            remove_if_exists(&artifact_path(&jobs_root, &input.job_id, OUTPUT_NAME))?;
            remove_if_exists(&artifact_path(&jobs_root, &input.job_id, "job.json"))?;
            remove_if_exists(&artifact_path(&jobs_root, &input.job_id, "evidence.json"))?;
        } else {
            job_service::update(
                &jobs_root,
                job_service::UpdateTaskJobInput {
                    task_id: input.job_id.clone(),
                    status: Some("completed".into()),
                    step_id: None,
                    step_kind: None,
                    step_status: None,
                    checkpoint: None,
                    error: None,
                    event_type: Some("worker.cache_recovered".into()),
                    event_fields: event_fields(
                        json!({ "compatibilityKey": snapshot.compatibility_key }),
                    ),
                },
            )?;
            publish(
                &jobs_root,
                &runtime,
                &app,
                worker_event(
                    &input.job_id,
                    "lifecycle",
                    "completed",
                    output.chunk_count,
                    output.chunk_count,
                    "已复用完整 Rust Worker 输出",
                ),
            )?;
            return Ok(());
        }
    }

    let mut checkpoint_manifest = load_checkpoint_manifest(&jobs_root, &snapshot);
    prune_checkpoint_manifest(&jobs_root, &snapshot, &mut checkpoint_manifest)?;

    control.set_phase(
        "chunking",
        Some("chunking".into()),
        0,
        input.documents.len(),
    );
    update_step(
        &jobs_root,
        &input.job_id,
        "chunking",
        Some("chunking"),
        "running",
        Some(INPUT_NAME.into()),
        "worker.started",
        json!({
            "workerVersion": WORKER_VERSION, "promptVersion": PROMPT_VERSION,
            "compatibilityKey": snapshot.compatibility_key, "documentCount": input.documents.len(),
            "executionOwner": "rust-worker"
        }),
    )?;
    publish(
        &jobs_root,
        &runtime,
        &app,
        worker_event(
            &input.job_id,
            "chunking",
            "running",
            0,
            input.documents.len(),
            "Rust Worker 正在校验输入快照并准备分块",
        ),
    )?;

    let mut manifests = Vec::with_capacity(input.documents.len());
    let mut documents = HashMap::new();
    for (index, source) in input.documents.iter().enumerate() {
        wait_for_control(&control).await?;
        let manifest_name = format!("manifest-{:03}.json", index + 1);
        let (generated, document_content) =
            load_and_chunk_document(&workspace, source, input.max_tokens, input.overlap_tokens)?;
        let manifest = read_cached_manifest(&jobs_root, input, index, source)
            .filter(|cached| {
                serde_json::to_value(cached).ok() == serde_json::to_value(&generated).ok()
            })
            .unwrap_or(generated);
        write_json(
            &artifact_path(
                &jobs_root,
                &input.job_id,
                &manifest_name,
            ),
            &manifest,
            " Worker 分块",
        )?;
        documents.insert(source.path.clone(), document_content);
        manifests.push(manifest);
        control.set_completed(index + 1);
        let mut event = worker_event(
            &input.job_id,
            "chunking",
            "running",
            index + 1,
            input.documents.len(),
            format!("Rust Worker 已校验并完成分块：{}", source.path),
        );
        event.artifact = Some(manifest_name);
        publish(&jobs_root, &runtime, &app, event)?;
    }
    let chunks = manifests
        .iter()
        .flat_map(|manifest| manifest.chunks.iter())
        .cloned()
        .collect::<Vec<_>>();
    update_step(
        &jobs_root,
        &input.job_id,
        "chunking",
        None,
        "completed",
        Some(format!("manifests:{}", manifests.len())),
        "step.completed",
        json!({ "chunkCount": chunks.len(), "executionOwner": "rust-worker" }),
    )?;
    publish(
        &jobs_root,
        &runtime,
        &app,
        worker_event(
            &input.job_id,
            "chunking",
            "completed",
            manifests.len(),
            manifests.len(),
            format!("Rust Worker 已生成 {} 个文本分块", chunks.len()),
        ),
    )?;

    control.set_phase("map", Some("map".into()), 0, chunks.len());
    update_step(
        &jobs_root,
        &input.job_id,
        "map",
        Some("map"),
        "running",
        None,
        "step.started",
        json!({ "chunkCount": chunks.len(), "compatibilityKey": snapshot.compatibility_key }),
    )?;
    publish(
        &jobs_root,
        &runtime,
        &app,
        worker_event(
            &input.job_id,
            "map",
            "running",
            0,
            chunks.len(),
            format!("Rust Map Worker 正在分析 {} 个分块", chunks.len()),
        ),
    )?;
    let mut counts = PipelineCounts::default();
    let mut runner = StageRunner {
        jobs_root: &jobs_root,
        snapshot: &snapshot,
        runtime: &runtime,
        app: &app,
        database: &database,
        control: &control,
        checkpoints: &mut checkpoint_manifest,
        counts: &mut counts,
    };
    let mut summaries = Vec::with_capacity(chunks.len());
    let mut local_input = input.clone();
    local_input.document_index = None;
    for (index, chunk) in chunks.iter().enumerate() {
        let node = long_text::source_fingerprint(&chunk.id);
        let name = format!("summary-{}.md", &node[..24]);
        let scope = chunk_scope(chunk);
        let (text, content_hash) = runner
            .execute(
                "map",
                &name,
                chunk_prompt(&local_input, chunk),
                Vec::new(),
                &scope,
            )
            .await?;
        summaries.push(SummaryRecord {
            source_id: chunk.source_id.clone(),
            chunk_id: chunk.id.clone(),
            heading: chunk.heading.clone(),
            volume: volume_at(
                &documents[&chunk.source_id],
                chunk.line_start,
                &chunk.source_id,
            ),
            evidence: verify_evidence(parse_evidence(&text), &scope),
            text: clip_to_tokens(&text, summary_clip_limit(&local_input)),
            artifact: name,
            content_hash,
        });
        control.set_completed(index + 1);
    }
    if summaries.is_empty() {
        return Err("没有可分析的正文分块".into());
    }
    let map_summary_count = summaries.len();
    update_step(
        &jobs_root,
        &input.job_id,
        "map",
        None,
        "completed",
        Some(CHECKPOINTS_NAME.into()),
        "step.completed",
        json!({"summaryCount": summaries.len()}),
    )?;

    // Nodes have stable source/heading identities. A change only invalidates dependent ancestors.
    let mut current = summaries;
    for stage in ["chapter", "volume"] {
        let mut groups: Vec<(String, Vec<SummaryRecord>)> = Vec::new();
        for record in current {
            let label = if stage == "chapter" {
                format!(
                    "{} / {} / {}",
                    record.source_id,
                    record.volume,
                    record.heading.as_deref().unwrap_or("正文")
                )
            } else {
                record.volume.clone()
            };
            if let Some((_, records)) = groups.iter_mut().find(|(key, _)| key == &label) {
                records.push(record);
            } else {
                groups.push((label, vec![record]));
            }
        }
        control.set_phase(stage, Some(stage.into()), 0, groups.len());
        update_step(
            &jobs_root,
            &input.job_id,
            stage,
            Some("reduce"),
            "running",
            None,
            "step.started",
            json!({"nodeCount": groups.len()}),
        )?;
        publish(
            &jobs_root,
            &runtime,
            &app,
            worker_event(
                &input.job_id,
                stage,
                "running",
                0,
                groups.len(),
                if stage == "chapter" {
                    "正在汇总章节"
                } else {
                    "正在汇总卷级内容"
                },
            ),
        )?;
        current = Vec::new();
        for (index, (label, records)) in groups.into_iter().enumerate() {
            current.push(runner.summarize(stage, &label, records, &documents).await?);
            control.set_completed(index + 1);
        }
        update_step(
            &jobs_root,
            &input.job_id,
            stage,
            None,
            "completed",
            Some(CHECKPOINTS_NAME.into()),
            "step.completed",
            json!({"nodeCount": current.len()}),
        )?;
    }

    let mut level = 0;
    while batch_summaries(&current, &local_input).len() > 1 {
        level += 1;
        let step = format!("reduce-{level}");
        let batches = batch_summaries(&current, &local_input);
        control.set_phase("reduce", Some(step.clone()), 0, batches.len());
        update_step(
            &jobs_root,
            &input.job_id,
            &step,
            Some("reduce"),
            "running",
            None,
            "step.started",
            json!({}),
        )?;
        let mut next = Vec::new();
        for (index, batch) in batches.into_iter().enumerate() {
            next.push(
                runner
                    .summarize(
                        &step,
                        &format!("全书阶段 {level} / {index}"),
                        batch,
                        &documents,
                    )
                    .await?,
            );
            control.set_completed(index + 1);
        }
        current = next;
        update_step(
            &jobs_root,
            &input.job_id,
            &step,
            None,
            "completed",
            Some(CHECKPOINTS_NAME.into()),
            "step.completed",
            json!({}),
        )?;
    }
    control.set_phase("synthesis", Some("synthesis".into()), 0, 1);
    update_step(
        &jobs_root,
        &input.job_id,
        "synthesis",
        Some("synthesis"),
        "running",
        None,
        "step.started",
        json!({}),
    )?;
    publish(
        &jobs_root,
        &runtime,
        &app,
        worker_event(
            &input.job_id,
            "synthesis",
            "running",
            0,
            1,
            "正在完成全书综合",
        ),
    )?;
    let dependencies = current
        .iter()
        .map(|record| CheckpointDependency {
            artifact: record.artifact.clone(),
            content_hash: record.content_hash.clone(),
        })
        .collect();
    let scope = scope_for_records(&current, &documents);
    let (content, _) = runner
        .execute(
            "synthesis",
            "analysis.md",
            summary_prompt(input, &current, true),
            dependencies,
            &scope,
        )
        .await?;
    let model_invocation_count = counts.requests;
    let map_cache_hits = counts.map_shared;
    let job_checkpoint_hits = counts.checkpoints;
    let stage_cache_hits = counts.shared;
    control.set_completed(1);
    update_step(
        &jobs_root,
        &input.job_id,
        "synthesis",
        None,
        "completed",
        Some("analysis.md".into()),
        "step.completed",
        json!({}),
    )?;

    control.set_phase("evidence", Some("evidence".into()), 0, 1);
    update_step(
        &jobs_root,
        &input.job_id,
        "evidence",
        Some("evidence"),
        "running",
        None,
        "step.started",
        json!({}),
    )?;
    let evidence = deduplicate_evidence(
        verify_evidence(parse_evidence(&content), &documents)
            .into_iter()
            .chain(current.iter().flat_map(|record| record.evidence.clone()))
            .collect(),
    );
    write_json(
        &artifact_path(&jobs_root, &input.job_id, "evidence.json"),
        &evidence,
        "证据结果",
    )?;
    update_step(
        &jobs_root,
        &input.job_id,
        "evidence",
        None,
        "completed",
        Some("evidence.json".into()),
        "step.completed",
        json!({
            "evidenceCount": evidence.len(), "verifiedCount": evidence.iter().filter(|item| item.verified).count()
        }),
    )?;
    control.set_completed(1);
    let mut evidence_event = worker_event(
        &input.job_id,
        "evidence",
        "completed",
        1,
        1,
        format!("Rust Evidence Worker 已校验 {} 条来源引用", evidence.len()),
    );
    evidence_event.artifact = Some("evidence.json".into());
    publish(&jobs_root, &runtime, &app, evidence_event)?;

    let completed_at = now_ms();
    let duration_ms = completed_at.saturating_sub(pipeline_started_at);
    let source_fingerprints = input
        .documents
        .iter()
        .map(|document| (document.path.clone(), document.source_fingerprint.clone()))
        .collect::<HashMap<_, _>>();
    write_json(
        &artifact_path(&jobs_root, &input.job_id, "job.json"),
        &json!({
            "jobId": input.job_id, "workspaceId": workspace.id, "instruction": input.instruction,
            "status": "completed", "createdAt": snapshot.created_at, "updatedAt": completed_at,
            "documentCount": input.documents.len() + input.excluded_documents.len(),
            "supportedDocumentCount": input.documents.len(), "excludedDocuments": input.excluded_documents,
            "sourceFingerprints": source_fingerprints, "chunkCount": chunks.len(),
            "summaryCount": map_summary_count, "evidenceCount": evidence.iter().filter(|item| item.verified).count(),
            "modelInvocationCount": model_invocation_count, "mapCacheHits": map_cache_hits,
            "stageCacheHits": stage_cache_hits,
            "jobCheckpointHits": job_checkpoint_hits, "durationMs": duration_ms, "error": null
        }),
        "分析任务结果",
    )?;
    let output = LongTextWorkerOutput {
        worker_version: WORKER_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        output_schema_version: OUTPUT_SCHEMA_VERSION.into(),
        compatibility_key: snapshot.compatibility_key.clone(),
        pipeline_completed: true,
        job_id: input.job_id.clone(),
        workspace_id: workspace.id,
        source_fingerprints,
        manifests: Vec::new(),
        content,
        evidence,
        chunk_count: chunks.len(),
        summary_count: map_summary_count,
        model_invocation_count,
        map_cache_hits,
        stage_cache_hits,
        job_checkpoint_hits,
        duration_ms,
        completed_at,
    };
    write_json(
        &artifact_path(&jobs_root, &input.job_id, OUTPUT_NAME),
        &output,
        " Worker 输出",
    )?;
    job_service::update(
        &jobs_root,
        job_service::UpdateTaskJobInput {
            task_id: input.job_id.clone(),
            status: Some("completed".into()),
            step_id: None,
            step_kind: None,
            step_status: None,
            checkpoint: None,
            error: None,
            event_type: Some("task.completed".into()),
            event_fields: event_fields(json!({
                "chunkCount": chunks.len(), "summaryCount": map_summary_count,
                "evidenceCount": output.evidence.len(), "compatibilityKey": snapshot.compatibility_key,
                "modelInvocationCount": model_invocation_count, "mapCacheHits": map_cache_hits,
                "stageCacheHits": stage_cache_hits,
                "jobCheckpointHits": job_checkpoint_hits, "durationMs": duration_ms
            })),
        },
    )?;
    publish(
        &jobs_root,
        &runtime,
        &app,
        worker_event(
            &input.job_id,
            "lifecycle",
            "completed",
            1,
            1,
            "Rust 长文本 Pipeline 已完成",
        ),
    )?;
    Ok(())
}

fn fail_worker(
    jobs_root: &Path,
    snapshot: &LongTextWorkerSnapshot,
    control: &WorkerControl,
    runtime: &WorkerRuntimeState,
    app: &AppHandle,
    message: String,
) {
    let progress = control.snapshot();
    if control.cancel.load(Ordering::Relaxed) {
        let _ = publish(
            jobs_root,
            runtime,
            app,
            worker_event(
                &snapshot.input.job_id,
                &progress.stage,
                "cancelled",
                progress.completed,
                progress.total,
                "Rust Worker 已取消",
            ),
        );
        return;
    }
    let failed_job = job_service::update(
        jobs_root,
        job_service::UpdateTaskJobInput {
            task_id: snapshot.input.job_id.clone(),
            status: Some("failed".into()),
            step_id: progress.step_id.clone(),
            step_kind: progress.step_id.as_ref().map(|_| progress.stage.clone()),
            step_status: progress.step_id.as_ref().map(|_| "failed".into()),
            checkpoint: None,
            error: Some(message.chars().take(2_000).collect()),
            event_type: Some("worker.failed".into()),
            event_fields: event_fields(
                json!({ "stage": progress.stage, "compatibilityKey": snapshot.compatibility_key }),
            ),
        },
    )
    .ok();
    let timestamp = now_ms();
    let source_fingerprints = snapshot
        .input
        .documents
        .iter()
        .map(|document| (document.path.clone(), document.source_fingerprint.clone()))
        .collect::<HashMap<_, _>>();
    let _ = write_json(
        &artifact_path(jobs_root, &snapshot.input.job_id, "job-failed.json"),
        &json!({
            "jobId": snapshot.input.job_id, "workspaceId": snapshot.workspace_id,
            "instruction": snapshot.input.instruction, "status": "failed",
            "createdAt": snapshot.created_at, "updatedAt": timestamp,
            "documentCount": snapshot.input.documents.len() + snapshot.input.excluded_documents.len(),
            "supportedDocumentCount": snapshot.input.documents.len(),
            "excludedDocuments": snapshot.input.excluded_documents,
            "sourceFingerprints": source_fingerprints, "error": message,
            "failure": failed_job.and_then(|job| job.failure)
        }),
        " Worker 失败清单",
    );
    let _ = publish(
        jobs_root,
        runtime,
        app,
        worker_event(
            &snapshot.input.job_id,
            &progress.stage,
            "failed",
            progress.completed,
            progress.total,
            message,
        ),
    );
}

pub fn start(
    jobs_root: &Path,
    workspace: &Workspace,
    database: &database::DatabaseState,
    input: StartLongTextWorkerInput,
    runtime: WorkerRuntimeState,
    app: AppHandle,
) -> Result<job_service::TaskJob, String> {
    validate(&input)?;
    if input.dispatch.workspace_id != workspace.id {
        return Err("Worker Dispatch 属于其他工作区".into());
    }
    let model = models::worker_model_compatibility(&input.profile_id, database)?;
    if input.context_window != model.context_window {
        return Err("Worker 上下文窗口与当前模型配置不一致".into());
    }
    let snapshot = persist_snapshot(jobs_root, workspace, &input, &model)?;
    let mut controls = runtime
        .controls
        .lock()
        .map_err(|_| "Worker 运行状态不可用".to_string())?;
    if controls.contains_key(&input.job_id) {
        return job_service::get(jobs_root, &input.job_id);
    }
    let job = job_service::start(
        jobs_root,
        &workspace.id,
        job_service::StartTaskJobInput {
            task_id: input.job_id.clone(),
            task_type: "long-text-analysis".into(),
            instruction_hash: input.instruction_hash.clone(),
            source_fingerprints: input
                .documents
                .iter()
                .map(|document| (document.path.clone(), document.source_fingerprint.clone()))
                .collect(),
        },
    )?;
    persist_start_manifest(jobs_root, workspace, &input)?;
    let control = Arc::new(WorkerControl::default());
    controls.insert(input.job_id.clone(), control.clone());
    drop(controls);

    let jobs_root = jobs_root.to_path_buf();
    let workspace = workspace.clone();
    let database = database.clone();
    let job_id = input.job_id.clone();
    let runtime_for_task = runtime.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_pipeline_worker(
            jobs_root.clone(),
            workspace,
            database,
            snapshot.clone(),
            control.clone(),
            runtime_for_task.clone(),
            app.clone(),
        )
        .await;
        if let Err(message) = result {
            fail_worker(
                &jobs_root,
                &snapshot,
                &control,
                &runtime_for_task,
                &app,
                message,
            );
        }
        if let Ok(mut values) = runtime_for_task.controls.lock() {
            values.remove(&job_id);
        }
    });
    Ok(job)
}

pub fn output(jobs_root: &Path, job_id: &str) -> Result<Option<LongTextWorkerOutput>, String> {
    if !valid_id(job_id) {
        return Err("Worker Job ID 无效".into());
    }
    if job_service::get(jobs_root, job_id)?.status != "completed" {
        return Ok(None);
    }
    read_output_at(jobs_root, job_id)
}

pub fn events(
    jobs_root: &Path,
    job_id: &str,
    after_sequence: Option<u64>,
) -> Result<Vec<TaskWorkerEvent>, String> {
    if !valid_id(job_id) {
        return Err("Worker Job ID 无效".into());
    }
    let after = after_sequence.unwrap_or(0);
    Ok(read_events_at(jobs_root, job_id)?
        .into_iter()
        .filter(|event| event.sequence > after)
        .collect())
}

pub fn pause(
    jobs_root: &Path,
    job_id: &str,
    runtime: &WorkerRuntimeState,
    app: &AppHandle,
) -> Result<job_service::TaskJob, String> {
    let control = runtime
        .controls
        .lock()
        .map_err(|_| "Worker 运行状态不可用".to_string())?
        .get(job_id)
        .cloned();
    if let Some(control) = &control {
        control.pause.store(true, Ordering::Relaxed);
    }
    let job = job_service::update(
        jobs_root,
        job_service::UpdateTaskJobInput {
            task_id: job_id.into(),
            status: Some("paused".into()),
            step_id: None,
            step_kind: None,
            step_status: None,
            checkpoint: None,
            error: None,
            event_type: Some("worker.paused".into()),
            event_fields: Map::new(),
        },
    )?;
    if let Some(control) = control {
        let progress = control.snapshot();
        publish(
            jobs_root,
            runtime,
            app,
            worker_event(
                job_id,
                &progress.stage,
                "paused",
                progress.completed,
                progress.total,
                "Rust Worker 已暂停",
            ),
        )?;
    }
    Ok(job)
}

pub fn resume(
    jobs_root: &Path,
    workspace: &Workspace,
    database: &database::DatabaseState,
    job_id: &str,
    runtime: WorkerRuntimeState,
    app: AppHandle,
) -> Result<job_service::TaskJob, String> {
    let control = runtime
        .controls
        .lock()
        .map_err(|_| "Worker 运行状态不可用".to_string())?
        .get(job_id)
        .cloned();
    if let Some(control) = control {
        control.pause.store(false, Ordering::Relaxed);
        let job = job_service::update(
            jobs_root,
            job_service::UpdateTaskJobInput {
                task_id: job_id.into(),
                status: Some("running".into()),
                step_id: None,
                step_kind: None,
                step_status: None,
                checkpoint: None,
                error: None,
                event_type: Some("worker.resumed".into()),
                event_fields: Map::new(),
            },
        )?;
        let progress = control.snapshot();
        publish(
            jobs_root,
            &runtime,
            &app,
            worker_event(
                job_id,
                &progress.stage,
                "running",
                progress.completed,
                progress.total,
                "Rust Worker 已继续",
            ),
        )?;
        return Ok(job);
    }
    let snapshot = read_snapshot(jobs_root, job_id)?;
    if snapshot.workspace_id != workspace.id {
        return Err("Worker 任务属于其他工作区".into());
    }
    start(jobs_root, workspace, database, snapshot.input, runtime, app)
}

pub fn retry_step(
    jobs_root: &Path,
    workspace: &Workspace,
    database: &database::DatabaseState,
    job_id: &str,
    step_id: &str,
    runtime: WorkerRuntimeState,
    app: AppHandle,
) -> Result<job_service::TaskJob, String> {
    let job = job_service::get(jobs_root, job_id)?;
    if job.status != "failed" {
        return Err("只有失败的 Worker 任务可以指定步骤重跑".into());
    }
    if job.task_type != "long-text-analysis" || !job.steps.iter().any(|step| step.id == step_id) {
        return Err("找不到待重跑的 Worker 步骤".into());
    }
    if runtime
        .controls
        .lock()
        .map_err(|_| "Worker 运行状态不可用".to_string())?
        .contains_key(job_id)
    {
        return Err("Worker 仍在退出，请稍后重试".into());
    }

    let snapshot = read_snapshot(jobs_root, job_id)?;
    validate(&snapshot.input)?;
    if snapshot.workspace_id != workspace.id
        || snapshot.input.dispatch.workspace_id != workspace.id
        || snapshot.input.job_id != job_id
    {
        return Err("Worker 重跑请求与当前工作区或 Job 不匹配".into());
    }
    if snapshot.worker_version != WORKER_VERSION
        || snapshot.prompt_version != PROMPT_VERSION
        || snapshot.output_schema_version != OUTPUT_SCHEMA_VERSION
    {
        return Err("Worker 输入快照版本已过期，不能重跑".into());
    }
    let current_model = models::worker_model_compatibility(&snapshot.input.profile_id, database)?;
    let current_key = compatibility_key(&snapshot.input, &current_model)?;
    if snapshot.input.context_window != current_model.context_window
        || snapshot.model != current_model
        || snapshot.compatibility_key != current_key
    {
        return Err("Worker 当前模型或兼容键已变化，不能重跑".into());
    }

    let removed_artifacts = invalidate_checkpoint_step(jobs_root, &snapshot, step_id)?;
    job_service::record_step_retry_request(jobs_root, job_id, step_id, &removed_artifacts)?;
    start(jobs_root, workspace, database, snapshot.input, runtime, app)
}

pub fn signal_cancel(job_id: &str, runtime: &WorkerRuntimeState) -> Result<(), String> {
    if let Some(control) = runtime
        .controls
        .lock()
        .map_err(|_| "Worker 运行状态不可用".to_string())?
        .get(job_id)
    {
        control.cancel.store(true, Ordering::Relaxed);
        control.pause.store(false, Ordering::Relaxed);
    }
    Ok(())
}

fn running_worker_job_ids(jobs_root: &Path) -> Result<Vec<String>, String> {
    if !jobs_root.exists() {
        return Ok(Vec::new());
    }
    let mut job_ids = Vec::new();
    for entry in
        fs::read_dir(jobs_root).map_err(|error| format!("无法扫描 Worker 恢复目录：{error}"))?
    {
        let Ok(entry) = entry else { continue };
        if !entry
            .file_type()
            .map(|value| value.is_dir())
            .unwrap_or(false)
        {
            continue;
        }
        let job_id = entry.file_name().to_string_lossy().to_string();
        if !valid_id(&job_id) || !entry.path().join(INPUT_NAME).is_file() {
            continue;
        }
        let Ok(job) = job_service::get(jobs_root, &job_id) else {
            continue;
        };
        if job.status == "running" {
            job_ids.push(job_id);
        }
    }
    job_ids.sort();
    Ok(job_ids)
}

pub fn restore_running(
    jobs_root: &Path,
    workspace: &Workspace,
    database: &database::DatabaseState,
    runtime: WorkerRuntimeState,
    app: AppHandle,
) -> Result<usize, String> {
    let mut restored = 0usize;
    for job_id in running_worker_job_ids(jobs_root)? {
        let result = read_snapshot(jobs_root, &job_id).and_then(|snapshot| {
            start(
                jobs_root,
                workspace,
                database,
                snapshot.input,
                runtime.clone(),
                app.clone(),
            )
            .map(|_| ())
        });
        match result {
            Ok(()) => restored += 1,
            Err(message) => {
                let _ = job_service::update(
                    jobs_root,
                    job_service::UpdateTaskJobInput {
                        task_id: job_id.clone(),
                        status: Some("failed".into()),
                        step_id: None,
                        step_kind: None,
                        step_status: None,
                        checkpoint: None,
                        error: Some(message.chars().take(2_000).collect()),
                        event_type: Some("worker.restore_failed".into()),
                        event_fields: Map::new(),
                    },
                );
                let _ = publish(
                    jobs_root,
                    &runtime,
                    &app,
                    worker_event(&job_id, "lifecycle", "failed", 0, 0, message),
                );
            }
        }
    }
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> StartLongTextWorkerInput {
        let instruction = "分析全文".to_string();
        StartLongTextWorkerInput {
            job_id: "job-1".into(),
            instruction_hash: long_text::source_fingerprint(&instruction),
            instruction,
            profile_id: "local-model".into(),
            context_window: 32_768,
            source_policy: "local-chunks".into(),
            max_tokens: 2_048,
            overlap_tokens: 128,
            dispatch: task_runtime::WorkerDispatchIdentity {
                job_id: "job-1".into(),
                workspace_id: "workspace-1".into(),
                policy_version: "task-policy-1".into(),
                dispatch_version: "service-dispatch-1".into(),
                service_id: "long-text-analysis".into(),
                execution_owner: "rust-worker".into(),
            },
            document_index: Some("<document-index />".into()),
            documents: vec![WorkerDocumentInput {
                path: "chapter.md".into(),
                source_fingerprint: long_text::source_fingerprint("正文"),
            }],
            excluded_documents: Vec::new(),
        }
    }

    fn model() -> models::WorkerModelCompatibility {
        models::WorkerModelCompatibility {
            profile_id: "local-model".into(),
            provider_kind: "ollama".into(),
            base_url: "http://127.0.0.1:11434".into(),
            model: "qwen".into(),
            context_window: 32_768,
        }
    }

    #[test]
    fn validates_the_worker_contract() {
        assert!(validate(&input()).is_ok());
        let mut invalid = input();
        invalid.source_policy = "metadata-only".into();
        assert!(validate(&invalid).is_err());
    }

    #[test]
    fn compatibility_key_changes_with_model_or_prompt_inputs() {
        let original = compatibility_key(&input(), &model()).unwrap();
        let mut changed_model = model();
        changed_model.model = "another-model".into();
        assert_ne!(
            original,
            compatibility_key(&input(), &changed_model).unwrap()
        );
        let mut changed_index = input();
        changed_index.document_index = Some("changed".into());
        assert_ne!(
            original,
            compatibility_key(&changed_index, &model()).unwrap()
        );
    }

    #[test]
    fn reuses_map_cache_across_jobs_for_the_exact_prompt_and_model() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let first = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        let mut second_input = input();
        second_input.job_id = "job-2".into();
        second_input.dispatch.job_id = "job-2".into();
        let second =
            persist_snapshot(directory.path(), &workspace, &second_input, &model()).unwrap();
        let prompt = "Map prompt with exact source content";

        persist_map_cache(directory.path(), &first, prompt, NO_EVIDENCE).unwrap();

        assert_eq!(
            read_map_cache(directory.path(), &second, prompt, &HashMap::new())
                .unwrap()
                .as_deref(),
            Some(NO_EVIDENCE)
        );
    }

    #[test]
    fn map_cache_misses_when_the_prompt_or_model_changes() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let snapshot = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        persist_map_cache(directory.path(), &snapshot, "original prompt", "summary").unwrap();

        assert!(read_map_cache(
            directory.path(),
            &snapshot,
            "changed prompt",
            &HashMap::new()
        )
        .unwrap()
        .is_none());

        let mut changed_model = snapshot.clone();
        changed_model.model.model = "another-model".into();
        assert!(read_map_cache(
            directory.path(),
            &changed_model,
            "original prompt",
            &HashMap::new()
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn removes_a_corrupted_map_cache_entry() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let snapshot = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        let prompt = "stable prompt";
        persist_map_cache(directory.path(), &snapshot, prompt, "summary").unwrap();
        let (cache_key, _) = map_cache_identity(&snapshot, prompt).unwrap();
        let path = map_cache_path(directory.path(), &cache_key);
        fs::write(&path, b"not-json").unwrap();

        assert!(
            read_map_cache(directory.path(), &snapshot, prompt, &HashMap::new())
                .unwrap()
                .is_none()
        );
        assert!(!path.exists());
    }

    #[test]
    fn rejects_changed_instruction_and_duplicate_documents() {
        let mut changed = input();
        changed.instruction = "另一任务".into();
        assert!(validate(&changed).is_err());
        let mut duplicate = input();
        duplicate.documents.push(duplicate.documents[0].clone());
        assert!(validate(&duplicate).is_err());
    }

    #[test]
    fn rejects_resume_when_the_worker_snapshot_changes() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let original = input();
        persist_snapshot(directory.path(), &workspace, &original, &model()).unwrap();
        persist_snapshot(directory.path(), &workspace, &original, &model()).unwrap();
        let mut changed = original;
        changed.max_tokens = 1_024;
        assert!(persist_snapshot(directory.path(), &workspace, &changed, &model()).is_err());
    }

    #[test]
    fn prunes_a_changed_map_checkpoint_and_its_reduce_descendants() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let snapshot = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        let mut manifest = empty_checkpoint_manifest(&snapshot);
        let first_hash = persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "summary-00001.md",
            "map",
            Some("chapter.md"),
            Some("source-1"),
            Vec::new(),
            "first",
        )
        .unwrap();
        let second_hash = persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "summary-00002.md",
            "map",
            Some("other.md"),
            Some("source-2"),
            Vec::new(),
            "second\n[source: other.md lines=1-1 quote=\"second\"]",
        )
        .unwrap();
        persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "reduce-1-0001.md",
            "reduce",
            None,
            None,
            vec![
                CheckpointDependency {
                    artifact: "summary-00001.md".into(),
                    content_hash: first_hash,
                },
                CheckpointDependency {
                    artifact: "summary-00002.md".into(),
                    content_hash: second_hash.clone(),
                },
            ],
            "reduced",
        )
        .unwrap();
        write_atomic(
            &artifact_path(directory.path(), "job-1", "summary-00001.md"),
            b"tampered",
        )
        .unwrap();

        prune_checkpoint_manifest(directory.path(), &snapshot, &mut manifest).unwrap();

        assert_eq!(
            manifest
                .entries
                .iter()
                .map(|entry| entry.artifact.as_str())
                .collect::<Vec<_>>(),
            vec!["summary-00002.md"]
        );
        assert!(!artifact_path(directory.path(), "job-1", "summary-00001.md").exists());
        assert!(!artifact_path(directory.path(), "job-1", "reduce-1-0001.md").exists());
        let documents = HashMap::from([(String::from("other.md"), String::from("second"))]);
        assert_eq!(
            checkpoint_text(
                directory.path(),
                &snapshot,
                &manifest,
                "summary-00002.md",
                "map",
                Some("other.md"),
                Some("source-2"),
                &[],
                &documents,
            )
            .as_deref(),
            Some("second\n[source: other.md lines=1-1 quote=\"second\"]")
        );
    }

    #[test]
    fn retrying_a_reduce_level_preserves_earlier_checkpoints() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let snapshot = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        let mut manifest = empty_checkpoint_manifest(&snapshot);
        let map_hash = persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "summary-00001.md",
            "map",
            Some("chapter.md"),
            Some("source-1"),
            Vec::new(),
            "map",
        )
        .unwrap();
        let reduce_one_hash = persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "reduce-1-0001.md",
            "reduce",
            None,
            None,
            vec![CheckpointDependency {
                artifact: "summary-00001.md".into(),
                content_hash: map_hash,
            }],
            "reduce one",
        )
        .unwrap();
        let reduce_two_hash = persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "reduce-2-0001.md",
            "reduce",
            None,
            None,
            vec![CheckpointDependency {
                artifact: "reduce-1-0001.md".into(),
                content_hash: reduce_one_hash,
            }],
            "reduce two",
        )
        .unwrap();
        persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "analysis.md",
            "synthesis",
            None,
            None,
            vec![CheckpointDependency {
                artifact: "reduce-2-0001.md".into(),
                content_hash: reduce_two_hash,
            }],
            "analysis",
        )
        .unwrap();

        let removed = invalidate_checkpoint_step(directory.path(), &snapshot, "reduce-2").unwrap();
        let retained = load_checkpoint_manifest(directory.path(), &snapshot)
            .entries
            .into_iter()
            .map(|entry| entry.artifact)
            .collect::<Vec<_>>();

        assert_eq!(retained, vec!["summary-00001.md", "reduce-1-0001.md"]);
        assert!(removed.contains(&"reduce-2-0001.md".to_string()));
        assert!(removed.contains(&"analysis.md".to_string()));
        assert!(artifact_path(directory.path(), "job-1", "summary-00001.md").exists());
        assert!(artifact_path(directory.path(), "job-1", "reduce-1-0001.md").exists());
    }

    #[test]
    fn retrying_evidence_preserves_the_synthesis_checkpoint() {
        let directory = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let snapshot = persist_snapshot(directory.path(), &workspace, &input(), &model()).unwrap();
        let mut manifest = empty_checkpoint_manifest(&snapshot);
        persist_text_checkpoint(
            directory.path(),
            &snapshot,
            &mut manifest,
            "analysis.md",
            "synthesis",
            None,
            None,
            Vec::new(),
            "analysis",
        )
        .unwrap();
        for artifact in ["evidence.json", OUTPUT_NAME, "job.json", "job-failed.json"] {
            write_atomic(
                &artifact_path(directory.path(), "job-1", artifact),
                b"stale",
            )
            .unwrap();
        }

        let removed = invalidate_checkpoint_step(directory.path(), &snapshot, "evidence").unwrap();

        assert!(artifact_path(directory.path(), "job-1", "analysis.md").exists());
        assert!(load_checkpoint_manifest(directory.path(), &snapshot)
            .entries
            .iter()
            .any(|entry| entry.artifact == "analysis.md"));
        assert!(!removed.contains(&"analysis.md".to_string()));
        assert!(removed.contains(&"evidence.json".to_string()));
        assert!(!artifact_path(directory.path(), "job-1", "evidence.json").exists());
        assert!(!artifact_path(directory.path(), "job-1", OUTPUT_NAME).exists());
    }

    #[test]
    fn rejects_a_document_changed_after_intake() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("chapter.md"), "已变化的正文").unwrap();
        let workspace = Workspace {
            id: "workspace-1".into(),
            name: "Test".into(),
            root: directory.path().to_path_buf(),
        };
        let source = input().documents.remove(0);
        assert!(load_and_chunk_document(&workspace, &source, 2_048, 128)
            .unwrap_err()
            .contains("源文档已变化"));
    }

    #[test]
    fn verifies_and_rejects_evidence_against_the_source_snapshot() {
        let documents = HashMap::from([("chapter.md".into(), "第一行\n关键证据\n第三行".into())]);
        let valid = parse_evidence("[source: chapter.md chunk=c1 lines=2-2 quote=\"关键证据\"]");
        assert!(verify_evidence(valid, &documents)[0].verified);
        let invalid = parse_evidence("[source: chapter.md chunk=c1 lines=1-1 quote=\"不存在\"]");
        assert!(!verify_evidence(invalid, &documents)[0].verified);
    }

    #[test]
    fn summary_batches_always_converge_with_a_large_document_index() {
        let mut worker_input = input();
        worker_input.context_window = 2_048;
        worker_input.document_index = Some("索引".repeat(4_000));
        let records = (0..3)
            .map(|index| SummaryRecord {
                source_id: "chapter.md".into(),
                chunk_id: format!("chunk-{index}"),
                heading: None,
                volume: "全书".into(),
                text: clip_to_tokens(&"摘要".repeat(2_000), summary_clip_limit(&worker_input)),
                evidence: Vec::new(),
                artifact: format!("summary-{index:05}.md"),
                content_hash: long_text::source_fingerprint(&format!("summary-{index}")),
            })
            .collect::<Vec<_>>();

        assert!(
            long_text::estimate_tokens(effective_document_index(&worker_input).as_deref().unwrap())
                <= analysis_input_budget(worker_input.context_window) / 4
        );
        assert!(records
            .iter()
            .all(|record| long_text::estimate_tokens(&record.text)
                <= summary_clip_limit(&worker_input)));
        let batches = batch_summaries(&records, &worker_input);
        assert_eq!(batches.len(), 2);
        assert_eq!(batches.iter().map(Vec::len).sum::<usize>(), records.len());
    }

    #[test]
    fn persists_replays_and_trims_worker_events() {
        let directory = tempfile::tempdir().unwrap();
        let first = persist_event(
            directory.path(),
            worker_event("job-1", "map", "running", 0, 2, "开始"),
        )
        .unwrap();
        let second = persist_event(
            directory.path(),
            worker_event("job-1", "map", "running", 1, 2, "继续"),
        )
        .unwrap();
        assert_eq!((first.sequence, second.sequence), (1, 2));
        assert_eq!(events(directory.path(), "job-1", Some(1)).unwrap().len(), 1);

        let seeded = (1..=MAX_WORKER_EVENTS)
            .map(|sequence| TaskWorkerEvent {
                sequence: sequence as u64,
                artifact: None,
                cache_source: None,
                timestamp: sequence as u64,
                job_id: "job-1".into(),
                stage: "map".into(),
                status: "running".into(),
                completed: sequence,
                total: MAX_WORKER_EVENTS + 1,
                message: "进度".into(),
            })
            .collect::<Vec<_>>();
        write_json(
            &artifact_path(directory.path(), "job-1", EVENTS_NAME),
            &seeded,
            "测试事件",
        )
        .unwrap();
        let appended = persist_event(
            directory.path(),
            worker_event("job-1", "map", "completed", 1, 1, "完成"),
        )
        .unwrap();
        let retained = read_events_at(directory.path(), "job-1").unwrap();
        assert_eq!(appended.sequence, (MAX_WORKER_EVENTS + 1) as u64);
        assert_eq!(retained.len(), MAX_WORKER_EVENTS);
        assert_eq!(retained.first().unwrap().sequence, 2);
        assert_eq!(retained.last().unwrap().sequence, appended.sequence);
    }

    #[test]
    fn startup_recovery_selects_running_jobs_but_not_paused_jobs() {
        let directory = tempfile::tempdir().unwrap();
        for job_id in ["job-running", "job-paused"] {
            let mut task_input = input();
            task_input.job_id = job_id.into();
            job_service::start(
                directory.path(),
                "workspace-1",
                job_service::StartTaskJobInput {
                    task_id: job_id.into(),
                    task_type: "long-text-analysis".into(),
                    instruction_hash: task_input.instruction_hash,
                    source_fingerprints: task_input
                        .documents
                        .into_iter()
                        .map(|document| (document.path, document.source_fingerprint))
                        .collect(),
                },
            )
            .unwrap();
            fs::write(
                artifact_path(directory.path(), job_id, INPUT_NAME),
                b"snapshot",
            )
            .unwrap();
        }
        job_service::update(
            directory.path(),
            job_service::UpdateTaskJobInput {
                task_id: "job-paused".into(),
                status: Some("paused".into()),
                step_id: None,
                step_kind: None,
                step_status: None,
                checkpoint: None,
                error: None,
                event_type: Some("worker.paused".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();

        assert_eq!(
            running_worker_job_ids(directory.path()).unwrap(),
            vec!["job-running".to_string()]
        );
    }

    #[test]
    fn retries_only_transient_model_failures() {
        assert!(retryable_model_error("模型请求超时：300 秒"));
        assert!(retryable_model_error("模型服务返回 HTTP 503：busy"));
        assert!(retryable_model_error("模型没有返回可用内容"));
        assert!(!retryable_model_error(
            "模型配置已变化，不能复用当前 Worker 检查点"
        ));
        assert!(!retryable_model_error("Worker 模型输出超过 16 MB 限制"));
        assert!(!retryable_model_error("请求已停止"));
    }

    #[tokio::test]
    async fn cancellation_releases_a_paused_worker() {
        let runtime = WorkerRuntimeState::default();
        let control = Arc::new(WorkerControl {
            pause: AtomicBool::new(true),
            ..WorkerControl::default()
        });
        runtime
            .controls
            .lock()
            .unwrap()
            .insert("job-1".into(), control.clone());
        signal_cancel("job-1", &runtime).unwrap();
        assert!(control.cancel.load(Ordering::Relaxed));
        assert!(!control.pause.load(Ordering::Relaxed));
        assert_eq!(wait_for_control(&control).await.unwrap_err(), "请求已停止");
    }
}
