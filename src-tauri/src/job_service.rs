use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_EVENTS: usize = 500;
static JOB_WRITE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskJobInput {
    pub task_id: String,
    pub task_type: String,
    pub instruction_hash: String,
    #[serde(default)]
    pub source_fingerprints: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskJobInput {
    pub task_id: String,
    pub status: Option<String>,
    pub step_id: Option<String>,
    pub step_kind: Option<String>,
    pub step_status: Option<String>,
    pub checkpoint: Option<String>,
    pub error: Option<String>,
    pub event_type: Option<String>,
    #[serde(default)]
    pub event_fields: Map<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskJobStep {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub attempt: u32,
    pub checkpoint: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskJobEvent {
    pub sequence: u64,
    pub step_id: Option<String>,
    pub event_type: String,
    pub timestamp: u64,
    pub fields: Map<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskJobFailure {
    pub code: String,
    pub category: String,
    pub message: String,
    pub retryable: bool,
    pub step_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskJob {
    pub task_id: String,
    pub workspace_id: String,
    pub task_type: String,
    pub instruction_hash: String,
    pub status: String,
    pub cancel_requested: bool,
    pub source_fingerprints: HashMap<String, String>,
    pub steps: Vec<TaskJobStep>,
    pub events: Vec<TaskJobEvent>,
    pub error: Option<String>,
    #[serde(default)]
    pub failure: Option<TaskJobFailure>,
    pub created_at: u64,
    pub updated_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_id(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 120
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(format!("{label} 无效"));
    }
    Ok(())
}

fn validate_status(value: &str) -> Result<(), String> {
    if matches!(
        value,
        "planned" | "running" | "paused" | "completed" | "failed" | "cancelled"
    ) {
        Ok(())
    } else {
        Err("任务状态无效".into())
    }
}

fn validate_step_status(value: &str) -> Result<(), String> {
    if matches!(
        value,
        "pending" | "running" | "completed" | "failed" | "cancelled"
    ) {
        Ok(())
    } else {
        Err("任务步骤状态无效".into())
    }
}

fn transition_allowed(current: &str, next: &str) -> bool {
    current == next
        || matches!(
            (current, next),
            ("planned", "running" | "cancelled")
                | ("running", "paused" | "completed" | "failed" | "cancelled")
                | ("paused", "running" | "failed" | "cancelled")
                | ("failed", "running" | "cancelled")
        )
}

fn classify_failure(message: &str, step_id: Option<String>) -> TaskJobFailure {
    let (code, category, retryable) = if [
        "模型请求失败",
        "模型请求超时",
        "模型响应超时",
        "模型响应连接中断",
        "读取模型响应失败",
        "HTTP 408",
        "HTTP 429",
        "HTTP 500",
        "HTTP 502",
        "HTTP 503",
        "HTTP 504",
    ]
    .iter()
    .any(|value| message.contains(value))
    {
        ("model.transient_exhausted", "model", true)
    } else if message.contains("模型没有返回可用内容")
        || message.contains("模型流响应格式无效")
        || message.contains("模型输出")
    {
        ("model.output_invalid", "model", true)
    } else if message.contains("兼容")
        || message.contains("版本已过期")
        || message.contains("配置已变化")
        || message.contains("源文档已变化")
        || message.contains("指纹")
    {
        ("worker.compatibility_mismatch", "compatibility", false)
    } else if message.contains("Dispatch")
        || message.contains("授权")
        || message.contains("权限")
        || message.contains("策略")
        || message.contains("工作区")
    {
        ("policy.denied", "authorization", false)
    } else if message.contains("无效")
        || message.contains("缺少")
        || message.contains("不匹配")
        || message.contains("不支持")
    {
        ("worker.input_invalid", "validation", false)
    } else if message.contains("超过") || message.contains("上限") {
        ("worker.capacity_exceeded", "capacity", false)
    } else if message.contains("无法读取")
        || message.contains("无法写入")
        || message.contains("无法创建")
        || message.contains("无法删除")
        || message.contains("无法提交")
    {
        ("io.operation_failed", "io", true)
    } else {
        ("worker.failed", "internal", false)
    };
    TaskJobFailure {
        code: code.into(),
        category: category.into(),
        message: message.to_string(),
        retryable,
        step_id,
    }
}

fn task_path(root: &Path, task_id: &str) -> PathBuf {
    root.join(task_id).join("task.json")
}

fn write_atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "任务路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建任务目录：{error}"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("无法创建任务临时文件：{error}"))?;
    temporary
        .write_all(content)
        .map_err(|error| format!("无法写入任务临时文件：{error}"))?;
    temporary
        .flush()
        .map_err(|error| format!("无法刷新任务临时文件：{error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("无法同步任务临时文件：{error}"))?;
    #[cfg(not(unix))]
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法替换旧任务状态：{error}"))?;
    }
    temporary
        .persist(path)
        .map_err(|error| format!("无法提交任务状态：{}", error.error))?;
    Ok(())
}

fn save(root: &Path, job: &TaskJob) -> Result<(), String> {
    let encoded =
        serde_json::to_vec_pretty(job).map_err(|error| format!("无法序列化任务：{error}"))?;
    write_atomic(&task_path(root, &job.task_id), &encoded)
}

pub fn get(root: &Path, task_id: &str) -> Result<TaskJob, String> {
    validate_id(task_id, "任务 ID")?;
    let bytes =
        fs::read(task_path(root, task_id)).map_err(|error| format!("无法读取任务：{error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("任务状态损坏：{error}"))
}

pub fn start(root: &Path, workspace_id: &str, input: StartTaskJobInput) -> Result<TaskJob, String> {
    let _guard = JOB_WRITE_LOCK
        .lock()
        .map_err(|_| "任务写入状态不可用".to_string())?;
    validate_id(&input.task_id, "任务 ID")?;
    validate_id(&input.task_type, "任务类型")?;
    if input.instruction_hash.is_empty() || input.instruction_hash.len() > 128 {
        return Err("任务指令指纹无效".into());
    }
    let path = task_path(root, &input.task_id);
    if path.exists() {
        let mut existing = get(root, &input.task_id)?;
        if existing.workspace_id != workspace_id
            || existing.task_type != input.task_type
            || existing.instruction_hash != input.instruction_hash
            || existing.source_fingerprints != input.source_fingerprints
        {
            return Err("任务恢复参数与已有任务不一致".into());
        }
        if !transition_allowed(&existing.status, "running") {
            return Err("当前任务状态不能恢复".into());
        }
        existing.status = "running".into();
        existing.cancel_requested = false;
        existing.error = None;
        existing.failure = None;
        existing.updated_at = now_ms();
        append_event(&mut existing, None, "task.resumed", Map::new());
        save(root, &existing)?;
        return Ok(existing);
    }
    let timestamp = now_ms();
    let mut job = TaskJob {
        task_id: input.task_id,
        workspace_id: workspace_id.to_string(),
        task_type: input.task_type,
        instruction_hash: input.instruction_hash,
        status: "running".into(),
        cancel_requested: false,
        source_fingerprints: input.source_fingerprints,
        steps: Vec::new(),
        events: Vec::new(),
        error: None,
        failure: None,
        created_at: timestamp,
        updated_at: timestamp,
    };
    append_event(&mut job, None, "task.started", Map::new());
    save(root, &job)?;
    Ok(job)
}

fn append_event(
    job: &mut TaskJob,
    step_id: Option<String>,
    event_type: &str,
    fields: Map<String, Value>,
) {
    let sequence = job
        .events
        .last()
        .map(|event| event.sequence + 1)
        .unwrap_or(1);
    job.events.push(TaskJobEvent {
        sequence,
        step_id,
        event_type: event_type.to_string(),
        timestamp: now_ms(),
        fields,
    });
    if job.events.len() > MAX_EVENTS {
        job.events.drain(0..job.events.len() - MAX_EVENTS);
    }
}

pub fn update(root: &Path, input: UpdateTaskJobInput) -> Result<TaskJob, String> {
    let _guard = JOB_WRITE_LOCK
        .lock()
        .map_err(|_| "任务写入状态不可用".to_string())?;
    let mut job = get(root, &input.task_id)?;
    if let Some(status) = input.status.as_deref() {
        validate_status(status)?;
        if !transition_allowed(&job.status, status) {
            return Err(format!("任务状态不能从 {} 变更为 {status}", job.status));
        }
        job.status = status.to_string();
        if status != "failed" {
            job.error = None;
            job.failure = None;
        }
    }
    if let Some(error) = input.error {
        if error.chars().count() > 2_000 {
            return Err("任务错误信息超过限制".into());
        }
        job.failure = Some(classify_failure(&error, input.step_id.clone()));
        job.error = Some(error);
    }
    if let Some(step_id) = input.step_id.as_deref() {
        validate_id(step_id, "任务步骤 ID")?;
        let step_status = input.step_status.as_deref().unwrap_or("running");
        validate_step_status(step_status)?;
        let timestamp = now_ms();
        if let Some(step) = job.steps.iter_mut().find(|step| step.id == step_id) {
            if step.status != "running" && step_status == "running" {
                step.attempt += 1;
            }
            step.status = step_status.to_string();
            step.checkpoint = input.checkpoint.clone().or_else(|| step.checkpoint.clone());
            step.updated_at = timestamp;
        } else {
            let kind = input
                .step_kind
                .clone()
                .ok_or_else(|| "新任务步骤缺少类型".to_string())?;
            validate_id(&kind, "任务步骤类型")?;
            job.steps.push(TaskJobStep {
                id: step_id.to_string(),
                kind,
                status: step_status.to_string(),
                attempt: 1,
                checkpoint: input.checkpoint.clone(),
                updated_at: timestamp,
            });
        }
    }
    job.updated_at = now_ms();
    append_event(
        &mut job,
        input.step_id,
        input.event_type.as_deref().unwrap_or("task.updated"),
        input.event_fields,
    );
    save(root, &job)?;
    Ok(job)
}

pub fn record_retry(
    root: &Path,
    task_id: &str,
    step_id: &str,
    error: &str,
    retry_after_ms: u64,
) -> Result<TaskJob, String> {
    let _guard = JOB_WRITE_LOCK
        .lock()
        .map_err(|_| "任务写入状态不可用".to_string())?;
    validate_id(task_id, "任务 ID")?;
    validate_id(step_id, "任务步骤 ID")?;
    let mut job = get(root, task_id)?;
    if job.status != "running" {
        return Err("只有运行中的任务可以安排步骤重试".into());
    }
    let timestamp = now_ms();
    let attempt = {
        let step = job
            .steps
            .iter_mut()
            .find(|step| step.id == step_id)
            .ok_or_else(|| "找不到待重试的任务步骤".to_string())?;
        if step.status != "running" {
            return Err("只有运行中的任务步骤可以重试".into());
        }
        step.attempt = step.attempt.saturating_add(1);
        step.updated_at = timestamp;
        step.attempt
    };
    job.updated_at = timestamp;
    append_event(
        &mut job,
        Some(step_id.into()),
        "step.retry_scheduled",
        Map::from_iter([
            ("attempt".into(), Value::from(attempt)),
            ("retryAfterMs".into(), Value::from(retry_after_ms)),
            (
                "error".into(),
                Value::String(error.chars().take(500).collect()),
            ),
        ]),
    );
    save(root, &job)?;
    Ok(job)
}

pub fn record_step_retry_request(
    root: &Path,
    task_id: &str,
    step_id: &str,
    removed_artifacts: &[String],
) -> Result<TaskJob, String> {
    let _guard = JOB_WRITE_LOCK
        .lock()
        .map_err(|_| "任务写入状态不可用".to_string())?;
    validate_id(task_id, "任务 ID")?;
    validate_id(step_id, "任务步骤 ID")?;
    let mut job = get(root, task_id)?;
    if job.status != "failed" {
        return Err("只有失败的任务可以请求指定步骤重跑".into());
    }
    let next_attempt = job
        .steps
        .iter()
        .find(|step| step.id == step_id)
        .map(|step| step.attempt.saturating_add(1))
        .ok_or_else(|| "找不到待重跑的任务步骤".to_string())?;
    job.updated_at = now_ms();
    append_event(
        &mut job,
        Some(step_id.into()),
        "worker.step_retry_requested",
        Map::from_iter([
            ("nextAttempt".into(), Value::from(next_attempt)),
            (
                "removedArtifacts".into(),
                Value::Array(
                    removed_artifacts
                        .iter()
                        .cloned()
                        .map(Value::String)
                        .collect(),
                ),
            ),
        ]),
    );
    save(root, &job)?;
    Ok(job)
}

pub fn cancel(root: &Path, task_id: &str) -> Result<TaskJob, String> {
    let _guard = JOB_WRITE_LOCK
        .lock()
        .map_err(|_| "任务写入状态不可用".to_string())?;
    let mut job = get(root, task_id)?;
    if matches!(job.status.as_str(), "completed" | "cancelled") {
        return Ok(job);
    }
    job.status = "cancelled".into();
    job.cancel_requested = true;
    job.updated_at = now_ms();
    for step in job.steps.iter_mut().filter(|step| step.status == "running") {
        step.status = "cancelled".into();
        step.updated_at = job.updated_at;
    }
    append_event(&mut job, None, "task.cancelled", Map::new());
    save(root, &job)?;
    Ok(job)
}

pub fn list(root: &Path) -> Result<Vec<TaskJob>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut jobs = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| format!("无法读取任务目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取任务目录项：{error}"))?;
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        let path = entry.path().join("task.json");
        if let Ok(bytes) = fs::read(path) {
            if let Ok(job) = serde_json::from_slice::<TaskJob>(&bytes) {
                jobs.push(job);
            }
        }
    }
    jobs.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    jobs.truncate(50);
    Ok(jobs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(id: &str) -> StartTaskJobInput {
        StartTaskJobInput {
            task_id: id.into(),
            task_type: "long-text-analysis".into(),
            instruction_hash: "abc123".into(),
            source_fingerprints: HashMap::from([("chapter.md".into(), "source-1".into())]),
        }
    }

    #[test]
    fn persists_steps_events_and_resume() {
        let directory = tempfile::tempdir().unwrap();
        let started = start(directory.path(), "work", input("task-1")).unwrap();
        assert_eq!(started.status, "running");
        let updated = update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-1".into(),
                status: None,
                step_id: Some("map".into()),
                step_kind: Some("map".into()),
                step_status: Some("completed".into()),
                checkpoint: Some("summary-1".into()),
                error: None,
                event_type: Some("step.completed".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();
        assert_eq!(updated.steps[0].checkpoint.as_deref(), Some("summary-1"));
        let failed = update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-1".into(),
                status: Some("failed".into()),
                step_id: None,
                step_kind: None,
                step_status: None,
                checkpoint: None,
                error: Some("model failed".into()),
                event_type: Some("task.failed".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();
        assert_eq!(failed.status, "failed");
        let resumed = start(directory.path(), "work", input("task-1")).unwrap();
        assert_eq!(resumed.status, "running");
        assert_eq!(resumed.events.last().unwrap().event_type, "task.resumed");
    }

    #[test]
    fn rejects_invalid_transitions_and_resume_identity() {
        let directory = tempfile::tempdir().unwrap();
        start(directory.path(), "work", input("task-2")).unwrap();
        update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-2".into(),
                status: Some("completed".into()),
                step_id: None,
                step_kind: None,
                step_status: None,
                checkpoint: None,
                error: None,
                event_type: None,
                event_fields: Map::new(),
            },
        )
        .unwrap();
        let mut changed = input("task-2");
        changed.instruction_hash = "different".into();
        assert!(start(directory.path(), "work", changed).is_err());
        assert!(update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-2".into(),
                status: Some("running".into()),
                step_id: None,
                step_kind: None,
                step_status: None,
                checkpoint: None,
                error: None,
                event_type: None,
                event_fields: Map::new(),
            }
        )
        .is_err());
    }

    #[test]
    fn cancellation_is_persisted() {
        let directory = tempfile::tempdir().unwrap();
        start(directory.path(), "work", input("task-3")).unwrap();
        let cancelled = cancel(directory.path(), "task-3").unwrap();
        assert!(cancelled.cancel_requested);
        assert_eq!(get(directory.path(), "task-3").unwrap().status, "cancelled");
        assert_eq!(list(directory.path()).unwrap().len(), 1);
    }

    #[test]
    fn records_a_persisted_step_retry_attempt() {
        let directory = tempfile::tempdir().unwrap();
        start(directory.path(), "work", input("task-4")).unwrap();
        update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-4".into(),
                status: None,
                step_id: Some("map".into()),
                step_kind: Some("map".into()),
                step_status: Some("running".into()),
                checkpoint: None,
                error: None,
                event_type: Some("step.started".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();

        let retried = record_retry(directory.path(), "task-4", "map", "timeout", 500).unwrap();
        assert_eq!(retried.steps[0].attempt, 2);
        assert_eq!(
            retried.events.last().unwrap().event_type,
            "step.retry_scheduled"
        );
        assert_eq!(
            retried.events.last().unwrap().fields["retryAfterMs"],
            Value::from(500)
        );
    }

    #[test]
    fn records_a_manual_step_retry_only_for_a_failed_job() {
        let directory = tempfile::tempdir().unwrap();
        start(directory.path(), "workspace-1", input("task-5")).unwrap();
        update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-5".into(),
                status: Some("failed".into()),
                step_id: Some("reduce-2".into()),
                step_kind: Some("reduce".into()),
                step_status: Some("failed".into()),
                checkpoint: None,
                error: Some("model failed".into()),
                event_type: Some("worker.failed".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();

        let requested = record_step_retry_request(
            directory.path(),
            "task-5",
            "reduce-2",
            &["reduce-2-0001.md".into(), "analysis.md".into()],
        )
        .unwrap();

        assert_eq!(requested.status, "failed");
        assert_eq!(
            requested.events.last().unwrap().event_type,
            "worker.step_retry_requested"
        );
        assert_eq!(
            requested.events.last().unwrap().step_id.as_deref(),
            Some("reduce-2")
        );
        assert_eq!(
            requested.events.last().unwrap().fields["nextAttempt"],
            Value::from(2)
        );
        assert!(record_step_retry_request(directory.path(), "task-5", "missing", &[]).is_err());
    }

    #[test]
    fn persists_a_structured_failure_and_clears_it_on_resume() {
        let directory = tempfile::tempdir().unwrap();
        start(directory.path(), "workspace-1", input("task-6")).unwrap();

        let failed = update(
            directory.path(),
            UpdateTaskJobInput {
                task_id: "task-6".into(),
                status: Some("failed".into()),
                step_id: Some("map".into()),
                step_kind: Some("map".into()),
                step_status: Some("failed".into()),
                checkpoint: None,
                error: Some("模型服务返回 HTTP 503：busy".into()),
                event_type: Some("worker.failed".into()),
                event_fields: Map::new(),
            },
        )
        .unwrap();

        assert_eq!(
            failed.failure,
            Some(TaskJobFailure {
                code: "model.transient_exhausted".into(),
                category: "model".into(),
                message: "模型服务返回 HTTP 503：busy".into(),
                retryable: true,
                step_id: Some("map".into()),
            })
        );
        assert!(start(directory.path(), "workspace-1", input("task-6"))
            .unwrap()
            .failure
            .is_none());
    }

    #[test]
    fn reads_legacy_task_json_without_a_structured_failure() {
        let directory = tempfile::tempdir().unwrap();
        let job = start(directory.path(), "workspace-1", input("task-7")).unwrap();
        let mut legacy = serde_json::to_value(job).unwrap();
        legacy.as_object_mut().unwrap().remove("failure");
        write_atomic(
            &task_path(directory.path(), "task-7"),
            &serde_json::to_vec_pretty(&legacy).unwrap(),
        )
        .unwrap();

        assert_eq!(get(directory.path(), "task-7").unwrap().failure, None);
    }
}
