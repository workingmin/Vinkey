use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

const POLICY_VERSION: &str = "task-policy-1";
const DISPATCH_VERSION: &str = "service-dispatch-1";
const WORKER_AUTHORIZATION_TTL_MS: u64 = 10 * 60 * 1_000;
const MAX_PENDING_WORKER_AUTHORIZATIONS: usize = 256;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskTarget {
    pub id: String,
    pub kind: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversationReference {
    pub conversation_id: Option<String>,
    pub previous_task_id: Option<String>,
    pub summary: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskRequest {
    pub entry_point: String,
    pub action_id: Option<String>,
    pub instruction: String,
    pub intent: Option<String>,
    pub scope: Option<String>,
    pub targets: Vec<TaskTarget>,
    #[serde(default)]
    pub user_constraints: Map<String, Value>,
    pub conversation_ref: ConversationReference,
    pub requested_effect: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionStrategy {
    pub current_mode: String,
    pub target_mode: String,
    pub workflow: Option<String>,
    pub agent_upgrade: String,
    pub required_capabilities: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskPlan {
    pub intent: String,
    pub agent: String,
    pub skill: String,
    pub allowed_tools: Vec<String>,
    pub operation: String,
    pub scope: String,
    pub side_effect: String,
    pub document_access: String,
    pub analysis_mode: Option<String>,
    pub analysis_coverage: String,
    pub source_policy: String,
    pub requires_model: bool,
    pub confidence: String,
    pub revision_strategy: Option<String>,
    pub execution: ExecutionStrategy,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecuteTaskInput {
    pub task_id: String,
    pub stage: String,
    pub resume_job_id: Option<String>,
    pub request: TaskRequest,
    pub plan: TaskPlan,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationRequest {
    pub code: &'static str,
    pub question: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskExecutionDispatch {
    pub task_id: String,
    pub workspace_id: Option<String>,
    pub policy_version: &'static str,
    pub dispatch_version: &'static str,
    pub accepted_at: u64,
    pub stage: String,
    pub execution_phase: &'static str,
    pub service_id: Option<&'static str>,
    pub execution_owner: &'static str,
    pub frontend_streaming_required: bool,
    pub background_eligible: bool,
    pub job_id: Option<String>,
    pub authorization_ticket: Option<String>,
    pub clarification: Option<ClarificationRequest>,
    pub plan: TaskPlan,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkerDispatchIdentity {
    pub job_id: String,
    pub workspace_id: String,
    pub policy_version: String,
    pub dispatch_version: String,
    pub service_id: String,
    pub execution_owner: String,
}

#[derive(Clone)]
struct WorkerDispatchAuthorization {
    identity: WorkerDispatchIdentity,
    expires_at: u64,
}

#[derive(Clone, Default)]
pub struct TaskDispatchState(Arc<Mutex<HashMap<String, WorkerDispatchAuthorization>>>);

struct SkillPolicy {
    agent: &'static str,
    scopes: &'static [&'static str],
    side_effects: &'static [&'static str],
    tools: &'static [&'static str],
    requires_model: bool,
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

fn one_of(value: &str, allowed: &[&str]) -> bool {
    allowed.contains(&value)
}

fn skill_policy(skill: &str) -> Option<SkillPolicy> {
    let policy = match skill {
        "document-overview" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["selected-documents"],
            side_effects: &["draft"],
            tools: &[
                "list_document_profiles",
                "get_document_digest",
                "stream_chat",
            ],
            requires_model: true,
        },
        "workspace-overview" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["workspace"],
            side_effects: &["draft"],
            tools: &[
                "get_workspace_profile",
                "list_document_profiles",
                "get_project_digest",
            ],
            requires_model: false,
        },
        "workspace-focused-analysis" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["workspace"],
            side_effects: &["draft"],
            tools: &[
                "get_workspace_profile",
                "list_document_profiles",
                "get_project_digest",
                "read_document",
                "stream_chat",
                "search_project_memory",
            ],
            requires_model: true,
        },
        "general-conversation" => SkillPolicy {
            agent: "GeneralConversation",
            scopes: &["conversation"],
            side_effects: &["draft"],
            tools: &["stream_chat", "search_project_memory"],
            requires_model: true,
        },
        "chapter-boundary-detect" => SkillPolicy {
            agent: "StructureSegmentation",
            scopes: &["selected-documents"],
            side_effects: &["proposal"],
            tools: &["read_document", "create_directory", "create_document"],
            requires_model: false,
        },
        "structure-enhancement" => SkillPolicy {
            agent: "StructureSegmentation",
            scopes: &["selected-documents"],
            side_effects: &["draft"],
            tools: &["read_document", "stream_chat"],
            requires_model: true,
        },
        "long-text-analysis" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["selected-documents"],
            side_effects: &["draft"],
            tools: &[
                "read_document",
                "chunk_document",
                "stream_chat",
                "write_analysis_artifact",
                "read_analysis_artifact",
                "list_analysis_jobs",
                "search_project_memory",
            ],
            requires_model: true,
        },
        "character-arc-extraction" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["selected-documents"],
            side_effects: &["draft"],
            tools: &[
                "read_document",
                "chunk_document",
                "stream_chat",
                "write_analysis_artifact",
                "read_analysis_artifact",
                "list_analysis_jobs",
                "search_project_memory",
            ],
            requires_model: true,
        },
        "document-revision" => SkillPolicy {
            agent: "RevisionEditor",
            scopes: &["editor-selection", "selected-documents"],
            side_effects: &["draft"],
            tools: &[
                "read_document",
                "chunk_document",
                "stream_chat",
                "write_analysis_artifact",
                "read_analysis_artifact",
                "list_analysis_jobs",
                "search_project_memory",
            ],
            requires_model: true,
        },
        "continuity-review" => SkillPolicy {
            agent: "ContinuityReviewer",
            scopes: &["selected-documents", "workspace"],
            side_effects: &["draft"],
            tools: &[
                "read_document",
                "chunk_document",
                "stream_chat",
                "write_analysis_artifact",
                "read_analysis_artifact",
                "list_analysis_jobs",
                "search_project_memory",
            ],
            requires_model: true,
        },
        "workspace-analysis" => SkillPolicy {
            agent: "StoryDeconstruction",
            scopes: &["workspace"],
            side_effects: &["draft"],
            tools: &[
                "read_document",
                "chunk_document",
                "stream_chat",
                "write_analysis_artifact",
                "read_analysis_artifact",
                "list_analysis_jobs",
                "search_project_memory",
            ],
            requires_model: true,
        },
        _ => return None,
    };
    Some(policy)
}

fn intent_allows_skill(intent: &str, skill: &str) -> bool {
    match intent {
        "structure-segmentation" => skill == "chapter-boundary-detect",
        "structure-enhancement" => skill == "structure-enhancement",
        "document-analysis" => matches!(skill, "long-text-analysis" | "document-overview"),
        "document-revision" => skill == "document-revision",
        "character-analysis" => matches!(skill, "character-arc-extraction" | "document-overview"),
        "continuity-review" => skill == "continuity-review",
        "workspace-analysis" => matches!(
            skill,
            "workspace-overview" | "workspace-focused-analysis" | "workspace-analysis"
        ),
        "general-chat" => skill == "general-conversation",
        _ => false,
    }
}

fn validate_request(task_id: &str, request: &TaskRequest) -> Result<(), String> {
    if !valid_id(task_id) {
        return Err("任务 ID 无效".into());
    }
    if !one_of(
        &request.entry_point,
        &[
            "chat",
            "context-menu",
            "editor-selection",
            "toolbar",
            "project",
            "command-palette",
        ],
    ) {
        return Err("AI 任务入口无效".into());
    }
    if request.instruction.trim().is_empty() || request.instruction.chars().count() > 200_000 {
        return Err("任务指令为空或超过限制".into());
    }
    if request.targets.len() > 100 {
        return Err("任务目标数量超过限制".into());
    }
    let mut targets = HashSet::new();
    for target in &request.targets {
        if target.id.trim().is_empty()
            || target.id.len() > 600
            || target.id.contains('\0')
            || !one_of(&target.kind, &["document", "selection", "chapter", "work"])
            || !targets.insert((target.kind.as_str(), target.id.as_str()))
        {
            return Err("任务目标无效或重复".into());
        }
    }
    if !one_of(
        &request.requested_effect,
        &["read", "draft", "proposal", "write", "network"],
    ) {
        return Err("任务请求副作用无效".into());
    }
    let constraints = serde_json::to_vec(&request.user_constraints)
        .map_err(|error| format!("无法校验用户约束：{error}"))?;
    if constraints.len() > 16_384
        || request.user_constraints.values().any(|value| {
            !matches!(value, Value::String(_) | Value::Number(_) | Value::Bool(_))
                && !matches!(value, Value::Array(items) if items.iter().all(Value::is_string))
        })
    {
        return Err("用户约束格式无效或超过限制".into());
    }
    for value in [
        request.action_id.as_deref(),
        request.intent.as_deref(),
        request.scope.as_deref(),
        request.conversation_ref.conversation_id.as_deref(),
        request.conversation_ref.previous_task_id.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if value.is_empty() || value.len() > 120 || value.contains('\0') {
            return Err("任务引用字段无效".into());
        }
    }
    if let Some(summary) = request.conversation_ref.summary.as_deref() {
        if summary.len() > 64_000 {
            return Err("会话任务引用超过限制".into());
        }
        let reference: ConversationTaskReference =
            serde_json::from_str(summary).map_err(|_| "会话任务引用格式无效".to_string())?;
        if request.conversation_ref.previous_task_id.as_deref() != Some(reference.task_id.as_str())
        {
            return Err("会话任务引用身份不一致".into());
        }
        validate_conversation_task_reference(&reference)?;
    } else if request.conversation_ref.previous_task_id.is_some() {
        return Err("上一任务 ID 缺少对应引用".into());
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConversationTaskReference {
    task_id: String,
    intent: String,
    scope: String,
    action_id: Option<String>,
    targets: Vec<TaskTarget>,
    side_effect: String,
}

fn validate_conversation_task_reference(
    reference: &ConversationTaskReference,
) -> Result<(), String> {
    if !valid_id(&reference.task_id)
        || !one_of(
            &reference.intent,
            &[
                "structure-segmentation",
                "structure-enhancement",
                "document-analysis",
                "document-revision",
                "character-analysis",
                "continuity-review",
                "workspace-analysis",
                "general-chat",
            ],
        )
        || !one_of(
            &reference.scope,
            &[
                "editor-selection",
                "selected-documents",
                "current-document",
                "workspace",
                "conversation",
            ],
        )
        || !one_of(&reference.side_effect, &["read", "draft", "proposal"])
        || reference.targets.len() > 100
        || reference
            .action_id
            .as_ref()
            .map(|value| value.len() > 120 || value.contains('\0'))
            .unwrap_or(false)
    {
        return Err("会话任务引用内容无效".into());
    }
    for target in &reference.targets {
        if target.id.trim().is_empty()
            || target.id.len() > 600
            || target.id.contains('\0')
            || !one_of(&target.kind, &["document", "selection", "chapter", "work"])
        {
            return Err("会话任务引用目标无效".into());
        }
    }
    Ok(())
}

fn validate_execution(plan: &TaskPlan) -> Result<(), String> {
    let execution = &plan.execution;
    let reads_bodies = matches!(plan.document_access.as_str(), "selected" | "workspace");
    let (current, target, workflow, upgrade, capabilities): (
        &str,
        &str,
        Option<&str>,
        &str,
        &[&str],
    ) = if plan.intent == "structure-segmentation" {
        (
            "deterministic-service",
            "deterministic-service",
            Some("structure-segmentation"),
            "never",
            &["human-approval"],
        )
    } else if !plan.requires_model {
        (
            "deterministic-service",
            "deterministic-service",
            None,
            "never",
            &[],
        )
    } else if plan.analysis_mode.as_deref() == Some("focused") {
        (
            "fixed-workflow",
            "fixed-workflow",
            Some("focused-analysis"),
            "optional",
            &["model-streaming", "cancellation"],
        )
    } else if plan.source_policy == "local-chunks" && reads_bodies {
        let recommended = matches!(
            plan.intent.as_str(),
            "structure-enhancement"
                | "document-revision"
                | "character-analysis"
                | "continuity-review"
        );
        (
            "fixed-workflow",
            "hybrid-agent-workflow",
            Some("long-text-analysis"),
            if recommended {
                "recommended"
            } else {
                "optional"
            },
            if recommended {
                &[
                    "model-streaming",
                    "cancellation",
                    "checkpointing",
                    "evidence-validation",
                    "planning",
                    "tool-selection",
                    "structured-output",
                ]
            } else {
                &[
                    "model-streaming",
                    "cancellation",
                    "checkpointing",
                    "evidence-validation",
                ]
            },
        )
    } else {
        (
            "direct-model",
            "direct-model",
            None,
            "never",
            &["model-streaming", "cancellation"],
        )
    };
    if execution.current_mode != current
        || execution.target_mode != target
        || execution.workflow.as_deref() != workflow
        || execution.agent_upgrade != upgrade
        || execution.required_capabilities.len() != capabilities.len()
        || !capabilities.iter().all(|capability| {
            execution
                .required_capabilities
                .iter()
                .any(|item| item == capability)
        })
    {
        return Err("ExecutionStrategy 与任务策略不一致".into());
    }
    Ok(())
}

fn validate_plan_shape(plan: &TaskPlan) -> Result<(), String> {
    let deep = plan.analysis_mode.as_deref() == Some("deep")
        && matches!(plan.analysis_coverage.as_str(), "targeted" | "exhaustive")
        && plan.source_policy == "local-chunks";
    let valid = match plan.skill.as_str() {
        "general-conversation" => {
            plan.operation == "chat"
                && plan.scope == "conversation"
                && plan.document_access == "none"
                && plan.analysis_mode.is_none()
                && plan.analysis_coverage == "index-only"
                && plan.source_policy == "metadata-only"
                && plan.revision_strategy.is_none()
        }
        "chapter-boundary-detect" => {
            plan.operation == "segment"
                && plan.scope == "selected-documents"
                && plan.document_access == "selected"
                && plan.analysis_mode.is_none()
                && plan.analysis_coverage == "targeted"
                && plan.source_policy == "local-chunks"
                && plan.revision_strategy.is_none()
        }
        "structure-enhancement" => {
            plan.operation == "analyze"
                && plan.scope == "selected-documents"
                && plan.document_access == "selected"
                && deep
                && plan.revision_strategy.is_none()
        }
        "document-overview" => {
            plan.operation == "analyze"
                && plan.scope == "selected-documents"
                && plan.document_access == "selected-metadata"
                && plan.analysis_mode.as_deref() == Some("overview")
                && plan.analysis_coverage == "index-only"
                && plan.source_policy == "metadata-only"
                && plan.revision_strategy.is_none()
        }
        "long-text-analysis" | "character-arc-extraction" => {
            plan.operation == "analyze"
                && plan.scope == "selected-documents"
                && plan.document_access == "selected"
                && deep
                && plan.revision_strategy.is_none()
        }
        "document-revision" => {
            if plan.operation != "revise" || plan.document_access != "selected" {
                false
            } else {
                match plan.revision_strategy.as_deref() {
                    Some("direct") => {
                        plan.scope == "editor-selection"
                            && plan.analysis_mode.is_none()
                            && plan.analysis_coverage == "targeted"
                            && plan.source_policy == "local-excerpts"
                    }
                    Some("bounded") => {
                        plan.scope == "selected-documents"
                            && plan.analysis_mode.is_none()
                            && plan.analysis_coverage == "targeted"
                            && plan.source_policy == "local-excerpts"
                    }
                    Some("long") => plan.scope == "selected-documents" && deep,
                    None => plan.scope == "selected-documents" && deep,
                    _ => false,
                }
            }
        }
        "continuity-review" => {
            plan.operation == "review"
                && deep
                && plan.revision_strategy.is_none()
                && ((plan.scope == "selected-documents" && plan.document_access == "selected")
                    || (plan.scope == "workspace" && plan.document_access == "workspace"))
        }
        "workspace-overview" => {
            plan.operation == "analyze"
                && plan.scope == "workspace"
                && plan.document_access == "workspace-metadata"
                && plan.analysis_mode.as_deref() == Some("overview")
                && plan.analysis_coverage == "index-only"
                && plan.source_policy == "metadata-only"
                && plan.revision_strategy.is_none()
        }
        "workspace-focused-analysis" => {
            plan.operation == "analyze"
                && plan.scope == "workspace"
                && plan.document_access == "workspace-focused"
                && plan.analysis_mode.as_deref() == Some("focused")
                && plan.analysis_coverage == "targeted"
                && plan.source_policy == "local-excerpts"
                && plan.revision_strategy.is_none()
        }
        "workspace-analysis" => {
            plan.operation == "analyze"
                && plan.scope == "workspace"
                && plan.document_access == "workspace"
                && deep
                && plan.revision_strategy.is_none()
        }
        _ => false,
    };
    if !valid {
        return Err("TaskPlan 业务字段组合无效".into());
    }
    Ok(())
}

fn validate_plan(request: &TaskRequest, plan: &TaskPlan) -> Result<(), String> {
    if !intent_allows_skill(&plan.intent, &plan.skill) {
        return Err("任务 intent 与 Skill 不一致".into());
    }
    let policy = skill_policy(&plan.skill).ok_or_else(|| "未注册 Skill".to_string())?;
    if plan.agent != policy.agent
        || !policy.scopes.contains(&plan.scope.as_str())
        || !policy.side_effects.contains(&plan.side_effect.as_str())
        || plan.requires_model != policy.requires_model
    {
        return Err("Agent/Skill 能力合同不一致".into());
    }
    let unique_tools: HashSet<&str> = plan.allowed_tools.iter().map(String::as_str).collect();
    if unique_tools.len() != plan.allowed_tools.len()
        || unique_tools.len() != policy.tools.len()
        || !policy.tools.iter().all(|tool| unique_tools.contains(tool))
    {
        return Err("任务 Tool allowlist 与 Skill 合同不一致".into());
    }
    if !one_of(
        &plan.operation,
        &["segment", "analyze", "revise", "review", "chat"],
    ) || !one_of(
        &plan.document_access,
        &[
            "none",
            "selected-metadata",
            "selected",
            "workspace-metadata",
            "workspace-focused",
            "workspace",
        ],
    ) || !one_of(
        &plan.analysis_coverage,
        &["index-only", "targeted", "exhaustive"],
    ) || !one_of(
        &plan.source_policy,
        &["metadata-only", "local-excerpts", "local-chunks"],
    ) || !one_of(&plan.confidence, &["low", "medium", "high"])
        || plan
            .analysis_mode
            .as_deref()
            .map(|value| !one_of(value, &["overview", "focused", "deep"]))
            .unwrap_or(false)
        || plan
            .revision_strategy
            .as_deref()
            .map(|value| !one_of(value, &["direct", "bounded", "long"]))
            .unwrap_or(false)
    {
        return Err("TaskPlan 枚举字段无效".into());
    }
    if request
        .intent
        .as_deref()
        .is_some_and(|intent| intent != plan.intent)
        || request
            .scope
            .as_deref()
            .is_some_and(|scope| scope != plan.scope)
        || request.requested_effect != plan.side_effect
    {
        return Err("TaskRequest 与 TaskPlan 不一致".into());
    }
    if let Some(action_id) = request.action_id.as_deref() {
        let expected_intent = match action_id {
            "structure-segmentation" => "structure-segmentation",
            "structure-enhancement" => "structure-enhancement",
            "document-analysis" => "document-analysis",
            "document-revision" => "document-revision",
            "character-analysis" => "character-analysis",
            "continuity-review" => "continuity-review",
            "workspace-analysis" => "workspace-analysis",
            _ => return Err("未注册显式 AI action".into()),
        };
        if plan.intent != expected_intent {
            return Err("显式 AI action 与路由结果不一致".into());
        }
    }
    if plan.source_policy == "metadata-only"
        && (unique_tools.contains("read_document") || unique_tools.contains("chunk_document"))
    {
        return Err("metadata-only 任务不能读取正文".into());
    }
    if plan.requires_model != unique_tools.contains("stream_chat") {
        return Err("模型依赖与 Tool 能力不一致".into());
    }
    if matches!(
        plan.document_access.as_str(),
        "selected" | "selected-metadata"
    ) && !request
        .targets
        .iter()
        .any(|target| matches!(target.kind.as_str(), "document" | "selection"))
    {
        return Err("选中文档任务缺少文档目标".into());
    }
    if plan.scope == "editor-selection"
        && !request
            .targets
            .iter()
            .any(|target| target.kind == "selection")
    {
        return Err("编辑器选区任务缺少选区目标".into());
    }
    validate_plan_shape(plan)?;
    validate_execution(plan)
}

fn clarification_for(request: &TaskRequest, plan: &TaskPlan) -> Option<ClarificationRequest> {
    let reads_bodies = matches!(
        plan.document_access.as_str(),
        "selected" | "workspace-focused" | "workspace"
    );
    if plan.confidence != "low" || !reads_bodies || request.action_id.is_some() {
        return None;
    }
    let question = if plan.scope == "workspace" {
        "请明确选择：只查看项目结构，还是读取项目正文进行分析？"
    } else {
        "请明确选择：仅继续聊天，还是分析所选文档正文？"
    };
    Some(ClarificationRequest {
        code: "confirm-document-body-access",
        question,
    })
}

fn service_for(plan: &TaskPlan) -> &'static str {
    if plan.intent == "structure-segmentation" {
        "structure-segmentation"
    } else if plan.document_access == "workspace-metadata" {
        "workspace-overview"
    } else if plan.execution.workflow.as_deref() == Some("focused-analysis") {
        "focused-analysis"
    } else if plan.execution.workflow.as_deref() == Some("long-text-analysis") {
        "long-text-analysis"
    } else {
        "direct-model"
    }
}

pub fn execute(
    input: ExecuteTaskInput,
    workspace_id: Option<&str>,
) -> Result<TaskExecutionDispatch, String> {
    validate_request(&input.task_id, &input.request)?;
    validate_plan(&input.request, &input.plan)?;
    if !one_of(&input.stage, &["preflight", "final"]) {
        return Err("任务调度阶段无效".into());
    }
    if let Some(resume_job_id) = input.resume_job_id.as_deref() {
        if !valid_id(resume_job_id) {
            return Err("恢复任务 ID 无效".into());
        }
        if input.plan.execution.workflow.as_deref() != Some("long-text-analysis") {
            return Err("只有长文本任务可以请求恢复 Job".into());
        }
    }
    if input.plan.document_access != "none" && workspace_id.is_none() {
        return Err("该 AI 任务需要先打开工作区".into());
    }
    let clarification = if input.resume_job_id.is_some() {
        None
    } else {
        clarification_for(&input.request, &input.plan)
    };
    let service_id = clarification.is_none().then(|| service_for(&input.plan));
    let background_eligible = service_id == Some("long-text-analysis");
    let execution_owner = if background_eligible {
        "rust-worker"
    } else {
        "webview"
    };
    let job_id = background_eligible.then(|| {
        input
            .resume_job_id
            .clone()
            .unwrap_or_else(|| input.task_id.clone())
    });
    Ok(TaskExecutionDispatch {
        task_id: input.task_id,
        workspace_id: workspace_id.map(str::to_string),
        policy_version: POLICY_VERSION,
        dispatch_version: DISPATCH_VERSION,
        accepted_at: now_ms(),
        stage: input.stage,
        execution_phase: if clarification.is_some() {
            "clarification-required"
        } else {
            "ready"
        },
        service_id,
        execution_owner,
        frontend_streaming_required: clarification.is_none()
            && input.plan.requires_model
            && !background_eligible,
        background_eligible,
        job_id,
        authorization_ticket: None,
        clarification,
        plan: input.plan,
    })
}

pub fn issue(
    input: ExecuteTaskInput,
    workspace_id: Option<&str>,
    state: &TaskDispatchState,
) -> Result<TaskExecutionDispatch, String> {
    let is_final = input.stage == "final";
    let mut dispatch = execute(input, workspace_id)?;
    if !is_final || dispatch.execution_owner != "rust-worker" {
        return Ok(dispatch);
    }
    let identity = WorkerDispatchIdentity {
        job_id: dispatch
            .job_id
            .clone()
            .ok_or_else(|| "Rust Worker Dispatch 缺少 Job ID".to_string())?,
        workspace_id: dispatch
            .workspace_id
            .clone()
            .ok_or_else(|| "Rust Worker Dispatch 缺少工作区 ID".to_string())?,
        policy_version: dispatch.policy_version.into(),
        dispatch_version: dispatch.dispatch_version.into(),
        service_id: dispatch
            .service_id
            .ok_or_else(|| "Rust Worker Dispatch 缺少 Service".to_string())?
            .into(),
        execution_owner: dispatch.execution_owner.into(),
    };
    let ticket = uuid::Uuid::new_v4().to_string();
    let mut authorizations = state
        .0
        .lock()
        .map_err(|_| "任务 Dispatch 授权状态不可用".to_string())?;
    let timestamp = now_ms();
    authorizations.retain(|_, authorization| authorization.expires_at > timestamp);
    if authorizations.len() >= MAX_PENDING_WORKER_AUTHORIZATIONS {
        return Err("待启动的 Worker Dispatch 授权过多，请稍后重试".into());
    }
    authorizations.insert(
        ticket.clone(),
        WorkerDispatchAuthorization {
            identity,
            expires_at: timestamp.saturating_add(WORKER_AUTHORIZATION_TTL_MS),
        },
    );
    dispatch.authorization_ticket = Some(ticket);
    Ok(dispatch)
}

pub fn validate_worker_dispatch(
    ticket: &str,
    identity: &WorkerDispatchIdentity,
    state: &TaskDispatchState,
) -> Result<(), String> {
    if ticket.len() > 80 || uuid::Uuid::parse_str(ticket).is_err() {
        return Err("Worker Dispatch 授权票据无效".into());
    }
    validate_worker_identity(identity)?;
    let timestamp = now_ms();
    let mut authorizations = state
        .0
        .lock()
        .map_err(|_| "任务 Dispatch 授权状态不可用".to_string())?;
    authorizations.retain(|_, authorization| authorization.expires_at > timestamp);
    let authorization = authorizations
        .get(ticket)
        .ok_or_else(|| "Worker Dispatch 授权已失效，请重新执行任务准入".to_string())?;
    if authorization.identity != *identity {
        return Err("Worker Dispatch 授权与启动身份不匹配".into());
    }
    Ok(())
}

pub fn validate_worker_identity(identity: &WorkerDispatchIdentity) -> Result<(), String> {
    if identity.policy_version != POLICY_VERSION
        || identity.dispatch_version != DISPATCH_VERSION
        || identity.service_id != "long-text-analysis"
        || identity.execution_owner != "rust-worker"
        || !valid_id(&identity.job_id)
        || identity.workspace_id.is_empty()
    {
        return Err("Worker Dispatch 身份或版本无效".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request() -> TaskRequest {
        TaskRequest {
            entry_point: "chat".into(),
            action_id: None,
            instruction: "你好".into(),
            intent: None,
            scope: None,
            targets: Vec::new(),
            user_constraints: Map::new(),
            conversation_ref: ConversationReference {
                conversation_id: None,
                previous_task_id: None,
                summary: None,
            },
            requested_effect: "draft".into(),
        }
    }

    fn plan() -> TaskPlan {
        TaskPlan {
            intent: "general-chat".into(),
            agent: "GeneralConversation".into(),
            skill: "general-conversation".into(),
            allowed_tools: vec!["stream_chat".into(), "search_project_memory".into()],
            operation: "chat".into(),
            scope: "conversation".into(),
            side_effect: "draft".into(),
            document_access: "none".into(),
            analysis_mode: None,
            analysis_coverage: "index-only".into(),
            source_policy: "metadata-only".into(),
            requires_model: true,
            confidence: "low".into(),
            revision_strategy: None,
            execution: ExecutionStrategy {
                current_mode: "direct-model".into(),
                target_mode: "direct-model".into(),
                workflow: None,
                agent_upgrade: "never".into(),
                required_capabilities: vec!["model-streaming".into(), "cancellation".into()],
            },
        }
    }

    fn document_request() -> TaskRequest {
        TaskRequest {
            instruction: "根据这个文档继续".into(),
            targets: vec![TaskTarget {
                id: "chapter.md".into(),
                kind: "document".into(),
            }],
            ..request()
        }
    }

    fn document_plan(confidence: &str) -> TaskPlan {
        TaskPlan {
            intent: "document-analysis".into(),
            agent: "StoryDeconstruction".into(),
            skill: "long-text-analysis".into(),
            allowed_tools: vec![
                "read_document".into(),
                "chunk_document".into(),
                "stream_chat".into(),
                "write_analysis_artifact".into(),
                "read_analysis_artifact".into(),
                "list_analysis_jobs".into(),
                "search_project_memory".into(),
            ],
            operation: "analyze".into(),
            scope: "selected-documents".into(),
            side_effect: "draft".into(),
            document_access: "selected".into(),
            analysis_mode: Some("deep".into()),
            analysis_coverage: "targeted".into(),
            source_policy: "local-chunks".into(),
            requires_model: true,
            confidence: confidence.into(),
            revision_strategy: None,
            execution: ExecutionStrategy {
                current_mode: "fixed-workflow".into(),
                target_mode: "hybrid-agent-workflow".into(),
                workflow: Some("long-text-analysis".into()),
                agent_upgrade: "optional".into(),
                required_capabilities: vec![
                    "model-streaming".into(),
                    "cancellation".into(),
                    "checkpointing".into(),
                    "evidence-validation".into(),
                ],
            },
        }
    }

    #[test]
    fn admits_a_valid_task_without_workspace_when_no_document_is_read() {
        let admission = execute(
            ExecuteTaskInput {
                task_id: "task-1".into(),
                stage: "preflight".into(),
                resume_job_id: None,
                request: request(),
                plan: plan(),
            },
            None,
        )
        .unwrap();
        assert_eq!(admission.policy_version, POLICY_VERSION);
        assert_eq!(admission.service_id, Some("direct-model"));
        assert_eq!(admission.execution_phase, "ready");
    }

    #[test]
    fn rejects_tool_escalation_and_request_plan_mismatch() {
        let mut escalated = plan();
        escalated.allowed_tools.push("read_document".into());
        assert!(execute(
            ExecuteTaskInput {
                task_id: "task-2".into(),
                stage: "preflight".into(),
                resume_job_id: None,
                request: request(),
                plan: escalated,
            },
            None,
        )
        .is_err());

        let mut mismatched = request();
        mismatched.requested_effect = "proposal".into();
        assert!(execute(
            ExecuteTaskInput {
                task_id: "task-3".into(),
                stage: "preflight".into(),
                resume_job_id: None,
                request: mismatched,
                plan: plan(),
            },
            None,
        )
        .is_err());
    }

    #[test]
    fn admits_the_editor_selection_contract_serialized_by_typescript() {
        let input: ExecuteTaskInput = serde_json::from_value(json!({
            "taskId": "task-selection",
            "stage": "final",
            "resumeJobId": null,
            "request": {
                "entryPoint": "editor-selection",
                "actionId": "document-revision",
                "instruction": "润色选区",
                "intent": null,
                "scope": null,
                "targets": [{ "id": "chapter.md#2:8", "kind": "selection" }],
                "userConstraints": {},
                "conversationRef": { "conversationId": null, "previousTaskId": null, "summary": null },
                "requestedEffect": "draft"
            },
            "plan": {
                "intent": "document-revision",
                "agent": "RevisionEditor",
                "skill": "document-revision",
                "allowedTools": [
                    "read_document", "chunk_document", "stream_chat", "write_analysis_artifact",
                    "read_analysis_artifact", "list_analysis_jobs", "search_project_memory"
                ],
                "operation": "revise",
                "scope": "editor-selection",
                "sideEffect": "draft",
                "documentAccess": "selected",
                "analysisMode": null,
                "analysisCoverage": "targeted",
                "sourcePolicy": "local-excerpts",
                "requiresModel": true,
                "confidence": "high",
                "revisionStrategy": "direct",
                "execution": {
                    "currentMode": "direct-model",
                    "targetMode": "direct-model",
                    "workflow": null,
                    "agentUpgrade": "never",
                    "requiredCapabilities": ["model-streaming", "cancellation"]
                }
            }
        }))
        .unwrap();
        let admission = execute(input, Some("workspace-1")).unwrap();
        assert_eq!(admission.plan.revision_strategy.as_deref(), Some("direct"));
        assert_eq!(admission.service_id, Some("direct-model"));
    }

    #[test]
    fn clarifies_low_confidence_body_access_before_dispatch() {
        let dispatch = execute(
            ExecuteTaskInput {
                task_id: "task-ambiguous".into(),
                stage: "preflight".into(),
                resume_job_id: None,
                request: document_request(),
                plan: document_plan("low"),
            },
            Some("workspace-1"),
        )
        .unwrap();
        assert_eq!(dispatch.execution_phase, "clarification-required");
        assert_eq!(dispatch.service_id, None);
        assert_eq!(dispatch.job_id, None);
        assert!(!dispatch.frontend_streaming_required);
    }

    #[test]
    fn dispatches_long_text_to_the_rust_worker() {
        let dispatch = execute(
            ExecuteTaskInput {
                task_id: "task-long".into(),
                stage: "final".into(),
                resume_job_id: Some("existing-job".into()),
                request: document_request(),
                plan: document_plan("medium"),
            },
            Some("workspace-1"),
        )
        .unwrap();
        assert_eq!(dispatch.service_id, Some("long-text-analysis"));
        assert_eq!(dispatch.execution_owner, "rust-worker");
        assert!(!dispatch.frontend_streaming_required);
        assert!(dispatch.background_eligible);
        assert_eq!(dispatch.job_id.as_deref(), Some("existing-job"));
    }

    #[test]
    fn issues_and_validates_a_scoped_worker_authorization() {
        let state = TaskDispatchState::default();
        let dispatch = issue(
            ExecuteTaskInput {
                task_id: "task-long".into(),
                stage: "final".into(),
                resume_job_id: Some("existing-job".into()),
                request: document_request(),
                plan: document_plan("medium"),
            },
            Some("workspace-1"),
            &state,
        )
        .unwrap();
        let ticket = dispatch.authorization_ticket.unwrap();
        let identity = WorkerDispatchIdentity {
            job_id: dispatch.job_id.unwrap(),
            workspace_id: dispatch.workspace_id.unwrap(),
            policy_version: dispatch.policy_version.into(),
            dispatch_version: dispatch.dispatch_version.into(),
            service_id: dispatch.service_id.unwrap().into(),
            execution_owner: dispatch.execution_owner.into(),
        };
        validate_worker_dispatch(&ticket, &identity, &state).unwrap();

        let mut mismatched = identity;
        mismatched.job_id = "another-job".into();
        assert!(validate_worker_dispatch(&ticket, &mismatched, &state).is_err());
    }
}
