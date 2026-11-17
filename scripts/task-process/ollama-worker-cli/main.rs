#![allow(dead_code)]
//! W4-TASK-E / UI-ACC-LOGS-001 real-Ollama CLI driver.
//!
//! Evidence boundary (must be preserved in the acceptance report):
//! * This binary compiles the **production** `worker_service.rs` pipeline and
//!   persistence code verbatim via `include!`, so every artifact written under
//!   `.vinkey/analysis/jobs/<jobId>/` is produced by production code.
//! * Only two transport layers are replaced: the desktop WebView emitter
//!   (`AppHandle` / `Emitter`) and the model transport (`models::complete_worker_chat`).
//!   The latter calls a **real local Ollama HTTP endpoint**; it is not a stub.
//! * The analysis is started from the CLI, **not** from the Vinkey desktop UI.
//!   It does not prove desktop pause/resume, stop confirmation, folding,
//!   follow-mode, preview or restart-recovery behaviour. Those remain human
//!   review items in the master plan §8.5.

extern crate self as tauri;

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::Duration,
};

// ---------------------------------------------------------------------------
// Desktop transport replacement (no WebView, no IPC).
// ---------------------------------------------------------------------------
#[derive(Clone, Default)]
pub struct AppHandle;

pub trait Emitter {
    fn emit<T: serde::Serialize>(&self, _: &str, _: T) -> Result<(), String> {
        Ok(())
    }
}
impl Emitter for AppHandle {}

pub mod async_runtime {
    pub use tokio::spawn;
}

#[derive(Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
}

pub struct Document {
    pub path: String,
    pub content: String,
    pub kind: &'static str,
}

pub fn read_document_at(workspace: &Workspace, path: &str) -> Result<Document, String> {
    let content = std::fs::read_to_string(workspace.root.join(path))
        .map_err(|error| format!("无法读取工作区文档 {path}：{error}"))?;
    Ok(Document {
        path: path.into(),
        content,
        kind: "markdown",
    })
}

#[derive(Clone, Debug)]
pub struct ModelConfig {
    pub profile_id: String,
    pub base_url: String,
    pub model: String,
    pub context_window: u32,
    pub request_timeout: Duration,
}

static CONFIG: OnceLock<ModelConfig> = OnceLock::new();
fn config() -> &'static ModelConfig {
    CONFIG.get().expect("模型配置未初始化")
}

pub mod database {
    #[derive(Clone, Default)]
    pub struct DatabaseState;
}

pub mod task_runtime {
    #[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
    #[serde(rename_all = "camelCase")]
    pub struct WorkerDispatchIdentity {
        pub job_id: String,
        pub workspace_id: String,
        pub service_id: String,
        pub policy_version: String,
        pub dispatch_version: String,
        pub execution_owner: String,
    }
    pub fn validate_worker_identity(value: &WorkerDispatchIdentity) -> Result<(), String> {
        if value.service_id != "long-text-analysis" || value.execution_owner != "rust-worker" {
            Err("invalid dispatch".into())
        } else {
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Model transport replacement: real Ollama /api/chat, no stub responses.
// ---------------------------------------------------------------------------
pub mod models {
    use super::*;

    #[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
    #[serde(rename_all = "camelCase")]
    pub struct WorkerModelCompatibility {
        pub profile_id: String,
        pub provider_kind: String,
        pub base_url: String,
        pub model: String,
        pub context_window: u32,
    }

    #[derive(Clone, Debug)]
    pub struct RequestMessage {
        pub role: String,
        pub content: String,
    }

    pub fn worker_model_compatibility(
        id: &str,
        _: &database::DatabaseState,
    ) -> Result<WorkerModelCompatibility, String> {
        let current = config();
        Ok(WorkerModelCompatibility {
            profile_id: id.into(),
            provider_kind: "ollama".into(),
            base_url: current.base_url.clone(),
            model: current.model.clone(),
            context_window: current.context_window,
        })
    }

    pub async fn complete_worker_chat(
        profile_id: &str,
        messages: Vec<RequestMessage>,
        database: &database::DatabaseState,
        expected: &WorkerModelCompatibility,
        cancel: &AtomicBool,
    ) -> Result<String, String> {
        // Mirrors the production guard against reusing checkpoints after a
        // model configuration change.
        if worker_model_compatibility(profile_id, database)? != *expected {
            return Err("模型配置已变化，不能复用当前 Worker 检查点".into());
        }
        let prompt = messages
            .first()
            .map(|message| message.content.as_str())
            .unwrap_or_default()
            .to_string();
        let current = config();
        let client = reqwest::Client::builder()
            .timeout(current.request_timeout)
            .build()
            .map_err(|error| format!("模型请求失败：{error}"))?;
        // Same payload shape as the production Ollama stream request
        // (models.rs::run_stream_with), except stream=false, because the CLI
        // does not need incremental WebView events.
        let body = serde_json::json!({
            "model": current.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": false,
            "think": false,
            "options": {"num_ctx": current.context_window}
        });
        let endpoint = format!("{}/api/chat", current.base_url.trim_end_matches('/'));
        let response = client
            .post(&endpoint)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("模型请求失败：{error}"))?;
        if cancel.load(Ordering::Relaxed) {
            return Err("请求已停止".into());
        }
        if !response.status().is_success() {
            return Err(format!("模型请求失败：HTTP {}", response.status()));
        }
        let payload: serde_json::Value = response
            .json()
            .await
            .map_err(|error| format!("模型响应解析失败：{error}"))?;
        let content = payload
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        crate::model_output::strip_thinking_sections(&content)
    }
}

#[path = "../../../src-tauri/src/clock.rs"]
mod clock;
#[path = "../../../src-tauri/src/conversation_activity.rs"]
mod conversation_activity;
#[path = "../../../src-tauri/src/job_service.rs"]
mod job_service;
#[path = "../../../src-tauri/src/long_text.rs"]
mod long_text;
#[path = "../../../src-tauri/src/model_output.rs"]
mod model_output;
mod worker_service {
    include!("../../../src-tauri/src/worker_service.rs");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const SAMPLE_DOCUMENT: &str = "# 灯塔记录\n\
清晨，松岚推开木窗，看见远处的灯塔仍然亮着。\n\
守夜人在航海日志里写下：东北风三级，海面平静。\n\
阿澄把日志抄进账册，并在页角写下已核对原文。\n\
收束时账册最后一行写着：一切记录以原文为准。\n";

#[derive(Debug)]
struct Options {
    workspace: PathBuf,
    document: String,
    instruction: String,
    job_id: String,
    profile_id: String,
    base_url: String,
    model: String,
    context_window: u32,
    max_tokens: usize,
    overlap_tokens: usize,
    timeout_secs: u64,
    request_timeout_secs: u64,
    write_sample: bool,
}

fn default_job_id() -> String {
    format!(
        "cli-ollama-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    )
}

fn parse_u32(value: &str, flag: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .map_err(|_| format!("{flag} 需要正整数，实际为 {value}"))
}

fn parse_usize(value: &str, flag: &str) -> Result<usize, String> {
    value
        .parse::<usize>()
        .map_err(|_| format!("{flag} 需要正整数，实际为 {value}"))
}

fn parse_u64(value: &str, flag: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("{flag} 需要正整数，实际为 {value}"))
}

fn usage() -> &'static str {
    "Vinkey 长文本 Worker 真实 Ollama CLI 驱动（W4-TASK-E / UI-ACC-LOGS-001 前置）

用法：
  cargo run --manifest-path scripts/task-process/ollama-worker-cli/Cargo.toml -- [选项]

参数：
  --workspace <dir>       工作区根目录；产物写入 <dir>/.vinkey/analysis/jobs/<jobId>/
  --document <name>       工作区内的源文档相对路径，默认 sample.md
  --write-sample          当源文档不存在时写入一份确定性样本文稿
  --instruction <text>    分析任务指令
  --job-id <id>           任务 ID，默认 cli-ollama-<毫秒时间戳>
  --profile-id <id>       模型 profile ID（建议传真实 SQLite 的 activeModelId）
  --base-url <url>        Ollama 服务地址，默认 http://localhost:11434
  --model <name>          Ollama 模型名，默认 qwen3:8b
  --context-window <n>    上下文窗口，默认 16384（须与真实模型配置一致）
  --max-tokens <n>        分块预算，默认 512
  --overlap-tokens <n>    分块重叠，默认 32
  --timeout-secs <n>      整任务等待上限，默认 900
  --request-timeout-secs <n> 单次模型请求超时，默认 180
  -h, --help              显示帮助

证据边界：复用生产 worker_service.rs pipeline 与持久化代码，仅替换桌面事件
传输与模型传输；模型传输为真实 Ollama HTTP，非 stub。分析由 CLI 发起，
不是桌面 UI 发起，不证明桌面暂停/停止/折叠/预览/重启恢复行为。"
}

fn parse_options() -> Result<Option<Options>, String> {
    let mut options = Options {
        workspace: PathBuf::new(),
        document: "sample.md".into(),
        instruction: "概括正文中的关键事实，并逐条保留原文证据。".into(),
        job_id: default_job_id(),
        profile_id: "cli-ollama-profile".into(),
        base_url: "http://localhost:11434".into(),
        model: "qwen3:8b".into(),
        context_window: 16_384,
        max_tokens: 512,
        overlap_tokens: 32,
        timeout_secs: 900,
        request_timeout_secs: 180,
        write_sample: false,
    };
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mut index = 0;
    while index < arguments.len() {
        let flag = arguments[index].as_str();
        if flag == "-h" || flag == "--help" {
            return Ok(None);
        }
        if flag == "--write-sample" {
            options.write_sample = true;
            index += 1;
            continue;
        }
        let value = arguments
            .get(index + 1)
            .ok_or_else(|| format!("参数 {flag} 缺少值。"))?;
        match flag {
            "--workspace" => options.workspace = PathBuf::from(value),
            "--document" => options.document = value.clone(),
            "--instruction" => options.instruction = value.clone(),
            "--job-id" => options.job_id = value.clone(),
            "--profile-id" => options.profile_id = value.clone(),
            "--base-url" => options.base_url = value.clone(),
            "--model" => options.model = value.clone(),
            "--context-window" => options.context_window = parse_u32(value, flag)?,
            "--max-tokens" => options.max_tokens = parse_usize(value, flag)?,
            "--overlap-tokens" => options.overlap_tokens = parse_usize(value, flag)?,
            "--timeout-secs" => options.timeout_secs = parse_u64(value, flag)?,
            "--request-timeout-secs" => options.request_timeout_secs = parse_u64(value, flag)?,
            _ => return Err(format!("未知参数 {flag}。")),
        }
        index += 2;
    }
    if options.workspace.as_os_str().is_empty() {
        return Err("必须提供 --workspace <dir>。".into());
    }
    Ok(Some(options))
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

async fn run() -> Result<serde_json::Value, String> {
    let options = parse_options()?
        .ok_or_else(|| "__HELP__".to_string())?;
    let workspace_root = options.workspace.canonicalize().unwrap_or_else(|_| {
        // A non-existent workspace is created below, then canonicalized.
        options.workspace.clone()
    });
    std::fs::create_dir_all(&workspace_root)
        .map_err(|error| format!("无法创建工作区：{error}"))?;
    let workspace_root = workspace_root
        .canonicalize()
        .map_err(|error| format!("无法解析工作区路径：{error}"))?;
    let document_path = workspace_root.join(&options.document);
    if !document_path.exists() {
        if !options.write_sample {
            return Err(format!(
                "源文档不存在：{}（如需自动生成样本文稿请加 --write-sample）",
                document_path.display()
            ));
        }
        if let Some(parent) = document_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建文档目录：{error}"))?;
        }
        std::fs::write(&document_path, SAMPLE_DOCUMENT)
            .map_err(|error| format!("无法写入样本文稿：{error}"))?;
    }
    let document_content = std::fs::read_to_string(&document_path)
        .map_err(|error| format!("无法读取源文档：{error}"))?;

    CONFIG
        .set(ModelConfig {
            profile_id: options.profile_id.clone(),
            base_url: options.base_url.clone(),
            model: options.model.clone(),
            context_window: options.context_window,
            request_timeout: Duration::from_secs(options.request_timeout_secs),
        })
        .map_err(|_| "模型配置重复初始化".to_string())?;

    let jobs_root = workspace_root.join(".vinkey").join("analysis").join("jobs");
    std::fs::create_dir_all(jobs_root.join(&options.job_id))
        .map_err(|error| format!("无法创建任务目录：{error}"))?;

    let workspace = Workspace {
        id: "cli-ollama-workspace".into(),
        name: "长任务 CLI 验收工作区".into(),
        root: workspace_root.clone(),
    };
    let dispatch = task_runtime::WorkerDispatchIdentity {
        job_id: options.job_id.clone(),
        workspace_id: workspace.id.clone(),
        service_id: "long-text-analysis".into(),
        policy_version: "1".into(),
        dispatch_version: "1".into(),
        execution_owner: "rust-worker".into(),
    };
    let input = worker_service::StartLongTextWorkerInput {
        job_id: options.job_id.clone(),
        instruction: options.instruction.clone(),
        instruction_hash: long_text::source_fingerprint(&options.instruction),
        profile_id: options.profile_id.clone(),
        context_window: options.context_window,
        source_policy: "local-chunks".into(),
        max_tokens: options.max_tokens,
        overlap_tokens: options.overlap_tokens,
        dispatch,
        document_index: None,
        documents: vec![worker_service::WorkerDocumentInput {
            path: options.document.clone(),
            source_fingerprint: long_text::source_fingerprint(&document_content),
        }],
        excluded_documents: Vec::new(),
        display_title: None,
        conversation_id: None,
        source_message_id: None,
        workspace_name_snapshot: None,
        conversation_title_snapshot: None,
        model_name_snapshot: None,
        connection_name_snapshot: None,
    };

    let runtime = worker_service::WorkerRuntimeState::default();
    worker_service::start(
        &jobs_root,
        &workspace,
        &database::DatabaseState::default(),
        input,
        runtime.clone(),
        AppHandle::default(),
    )?;

    let job_root = jobs_root.join(&options.job_id);
    let completed_file = job_root.join("job.json");
    let failed_file = job_root.join("job-failed.json");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(options.timeout_secs);
    let mut terminal: Option<(&str, serde_json::Value)> = None;
    // `start()` spawns the production pipeline and removes the runtime control
    // only after run_pipeline_worker / fail_worker have returned. Waiting for
    // that removal (not merely for job.json) guarantees all atomic writes,
    // including worker-output.json, have landed before we read the evidence.
    while tokio::time::Instant::now() < deadline {
        if !runtime.has_workers() {
            if let Some(value) = read_json(&completed_file) {
                terminal = Some(("completed", value));
                break;
            }
            if let Some(value) = read_json(&failed_file) {
                terminal = Some(("failed", value));
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }

    let (status, terminal_doc) = terminal.ok_or_else(|| {
        format!(
            "任务在 {} 秒内未完成 pipeline 或未产生终态文件（runtime 仍在运行：{}）",
            options.timeout_secs,
            runtime.has_workers()
        )
    })?;
    let output = read_json(&job_root.join("worker-output.json")).unwrap_or(serde_json::Value::Null);
    let events = read_json(&job_root.join("worker-events.json"));
    let event_count = events
        .as_ref()
        .and_then(|value| value.as_array())
        .map(|values| values.len())
        .unwrap_or(0);
    let artifact_names = std::fs::read_dir(&job_root)
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.path().is_file())
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .filter(|name| !name.starts_with('.'))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let required_artifacts: Vec<&str> = vec![
        "job-start.json",
        "worker-input.json",
        "worker-events.json",
        "worker-checkpoints.json",
        "worker-output.json",
    ];
    let required_artifacts_present = required_artifacts
        .iter()
        .all(|name| job_root.join(name).exists());

    let summary = serde_json::json!({
        "driver": "vinkey-ollama-worker-cli",
        "driverVersion": 1,
        "evidenceBoundary": "CLI 驱动 + 生产 pipeline + 真实 Ollama 模型；非桌面 UI 发起，不证明桌面交互行为",
        "productionPipeline": "src-tauri/src/worker_service.rs (include!)",
        "modelTransport": {
            "protocol": "ollama",
            "endpoint": format!("{}/api/chat", options.base_url.trim_end_matches('/')),
            "model": options.model,
            "profileId": options.profile_id,
            "contextWindow": options.context_window,
            "stream": false,
            "note": "CLI 使用非流式请求；生产桌面端为流式传输，提示词与产物校验由生产代码执行"
        },
        "workspace": workspace_root.to_string_lossy(),
        "document": options.document,
        "instruction": options.instruction,
        "jobId": options.job_id,
        "jobRoot": job_root.to_string_lossy(),
        "jobsRoot": jobs_root.to_string_lossy(),
        "status": status,
        "terminalStatusSource": if status == "completed" { "job.json" } else { "job-failed.json" },
        "terminal": terminal_doc,
        "workerOutput": {
            "pipelineCompleted": output.get("pipelineCompleted").and_then(|v| v.as_bool()),
            "modelInvocationCount": output.get("modelInvocationCount").and_then(|v| v.as_u64()),
            "chunkCount": output.get("chunkCount").and_then(|v| v.as_u64()),
            "summaryCount": output.get("summaryCount").and_then(|v| v.as_u64()),
            "durationMs": output.get("durationMs").and_then(|v| v.as_u64()),
            "contentLength": output.get("content").and_then(|v| v.as_str()).map(|v| v.len()),
        },
        "eventCount": event_count,
        "artifactNames": artifact_names,
        "requiredArtifacts": required_artifacts,
        "requiredArtifactsPresent": required_artifacts_present,
    });
    if status != "completed" {
        return Err(format!(
            "任务终态为 {status}：{}",
            serde_json::to_string_pretty(&summary).unwrap_or_default()
        ));
    }
    if !required_artifacts_present {
        return Err(format!(
            "任务已完成但必需产物缺失：{}",
            serde_json::to_string_pretty(&summary).unwrap_or_default()
        ));
    }
    Ok(summary)
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    match run().await {
        Ok(summary) => {
            println!("{}", serde_json::to_string_pretty(&summary).unwrap_or_default());
        }
        Err(message) if message == "__HELP__" => {
            println!("{}", usage());
        }
        Err(message) => {
            eprintln!("长任务 CLI 驱动失败：{message}");
            std::process::exit(2);
        }
    }
}
