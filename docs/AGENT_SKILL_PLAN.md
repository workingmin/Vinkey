# Vinkey Agent 与 Skill 建设计划

- 状态：持续实施中
- 适用版本：Vinkey 本地 AI 文学创作工作台
- 目标：在现有 Tauri 2 + React + Rust + SQLite MVP 上，建立可审核、可恢复、适配本地模型能力的文学创作 Agent/Skill 系统。
- 相关文档：[开发框架与技术选型](DEVELOPMENT_FRAMEWORK.md)、[GitHub 同类项目调研与功能取舍](GITHUB_REFERENCE.md)、[对话页设计](UI_DESIGN_CHAT.md)、[文件与编辑器设计](UI_DESIGN_EDITOR.md)

## 1. 设计边界

### 1.1 Agent 与 Skill 的定义

- **Agent**：面向一个用户目标的任务协调者。负责理解意图、拆解步骤、选择 Skill、处理模型响应、汇总结果和请求用户确认。
- **Skill**：一个可复用的原子能力。必须有明确输入输出、允许使用的工具、上下文范围和副作用等级。
- **Runtime**：负责路由、任务状态、模型调用、预算、取消、恢复、日志脱敏和权限，不由单个 Agent 自行实现。

Agent 不应拥有通用文件系统权限。所有文件写入、设定变更和长期记忆更新都通过受限 Skill 生成 Proposal，再由用户确认后提交。

### 1.2 Tool 的定义

- **Tool**：Runtime 暴露给 Skill 的最小可执行接口，例如 `read_document`、`chunk_document`、`search_workspace` 和 `stream_chat`。
- Tool 不负责理解用户意图，也不自行编排多个步骤；它只执行一个受权限、超时、取消和审计约束的动作。
- Skill 可以组合多个 Tool；Agent 只能通过 Skill 或受控 Runtime 调用 Tool，不能拼接任意 Tauri command。

每个 Tool 至少声明：

```text
name
input_schema
output_schema
permission
side_effects
timeout
cancellable
audit_fields
```

现有代码中的 Tauri command 是 Tool 的第一批实现，但在 Tool Registry 建立前仍属于受控的底层接口。

### 1.3 副作用等级

| 等级 | 含义 | 默认策略 |
| --- | --- | --- |
| `read` | 读取文件、会话或已确认设定 | 自动执行 |
| `draft` | 生成回答、报告、草稿或候选结构 | 自动执行，标记为未确认 |
| `proposal` | 生成文件 diff、章节切分、canon 或记忆变更 | 必须预览，可逐项接受 |
| `write` | 提交用户已确认的文件或结构化数据 | 只能由 Runtime 执行 |
| `network` | 访问外部检索或模型服务 | 单独授权，默认关闭研究能力 |

## 2. 用户入口模型

所有入口最后统一成以下任务描述：

```text
intent       用户意图
scope        选中文本 / 当前文档 / 当前章节 / 当前作品 / 全部工作区
target       目标文件、章节或作品 ID
operation    分析 / 规划 / 写作 / 修改 / 导入 / 导出 / 聊天
side_effect  read / draft / proposal / write / network
confidence   路由置信度
```

推荐入口包括：

1. **聊天框**：灵感、问答、写作请求、日常聊天。
2. **文件树右键**：分析文本、拆分章节、生成摘要、导入设定。
3. **编辑器选中文本菜单**：解释、压缩、扩写、润色、改写、生成对话。
4. **编辑器工具栏**：续写、改稿、连续性检查。
5. **项目/大纲页**：完善想法、创建人物、构建世界、生成大纲。
6. **命令面板**：执行跨页面任务并查看任务进度。

低置信度输入先由日常聊天 Agent 回答，或只提出一个澄清问题；不能因为出现“故事”“人物”等词就自动修改作品数据。

### 2.1 分析模式与项目锚定

面向用户的分析模式统一命名为：

- **概览分析（Overview Analysis）**：默认模式。回答“这个项目是什么”“分析这个项目”“有哪些文件/人物”等全局问题，只使用工作区清单、结构化元数据、索引状态和已有分析摘要，不在本次请求中读取正文。
- **深度分析（Deep Analysis）**：用户显式选择或使用“详细、深入、逐章”等表达时启用。正文仅由受控分析 Worker 按块读取并执行 Map-Reduce，主对话 Agent 只接收阶段摘要、证据引用和覆盖报告。

“概览”表示观察层级，适合作为模式名；“概要”表示一种输出格式，保留用于“内容概要”“摘要”等分析产物，不用作工作模式名。“深度”只表示允许进入正文证据链，不等于自动完整通读。

任务描述必须将以下四个维度分开建模：

```text
scope         workspace / active-document / selected-documents
mode          overview / deep
coverage      index-only / targeted / exhaustive
sourcePolicy  metadata-only / local-chunks
```

| 模式 | 默认覆盖 | 数据来源 | 典型请求 |
| --- | --- | --- | --- |
| `overview` | `index-only` | `metadata-only` | “介绍这个项目”“分析这个项目”“这个项目有哪些角色” |
| `deep` | `targeted` | `local-chunks` | “深入分析这个项目的人物关系”“详细分析这篇文档” |
| `deep` | `exhaustive` | `local-chunks` | “完整通读当前项目并逐章分析，不要遗漏” |

路由遵守以下不变量：

1. “这个项目”“当前项目”“工作区”等表达先锚定 `scope=workspace`，不能因为没有显式文件名而退化为普通聊天。
2. 未出现深度要求时，“分析这个项目”仍为概览分析；“分析”是任务操作，不是读取全文的授权。
3. 只有用户显式选择深度模式或使用“详细、深入、逐章”等词，才允许从 `overview` 升级为 `deep`。
4. 只有“完整、全量、全部、通读、不遗漏”等明确覆盖要求，才设置 `coverage=exhaustive`；否则深度模式使用 `targeted`。
5. Runtime、模型路由器和 Skill 均不得静默把 `metadata-only` 升级为 `local-chunks`。
6. `exhaustive` 是覆盖要求，不是单次投喂许可；单个文件乃至全项目正文都禁止一次性放入模型请求，必须逐块处理。

概览链路使用轻量 Service/Tool，而不是把正文伪装成“上下文”：

```text
get_workspace_profile   → 工作区 ID/名称、目录数、文件数、类型分布、索引状态
list_document_profiles  → 相对路径、类型、字节数、修改时间、标题层级、指纹
get_document_digest     → 已缓存且带版本/来源的文档摘要；无缓存则返回 unavailable
get_project_digest      → 已缓存且带覆盖率/版本的项目摘要；无缓存则返回 unavailable
```

上述 Tool 的输出 schema 禁止出现 `content`、`text`、`chunk`、`preview`、`quote` 等正文字段。确定性元数据不能从首段或正文前缀生成“摘要”；语义摘要只能来自独立的、可失效的分析产物。

深度链路统一为：

```text
目标解析 → 本地清单/过滤 → 按 ID 读取 → 结构化分块 → Map 局部分析
        → Reduce 分层汇总 → Synthesis → 证据与覆盖报告 → 主对话回答
```

每次结果必须报告 `mode`、`coverage`、目标文档数、已处理/排除文档数、分块数、源指纹和摘要版本。原始块只在本地分析 Worker 与获授权的模型端点之间短暂存在；主聊天消息、运行日志、概览索引和 Tool 调用记录均不得保存正文。原始块默认只允许发送到本机或回环模型端点；远程模型处理正文需要后续单独授权，不能继承普通聊天的联网配置。

## 3. Agent 计划

### 3.1 P0：必须完成的核心 Agent

| Agent | 主要入口 | 责任边界 | 主要输出 |
| --- | --- | --- | --- |
| `IntentRouter` | 所有入口 | 判断意图、范围、副作用和目标 Agent；不生成正文 | `TaskPlan` |
| `GeneralConversation` | 普通问题、创作陪伴、低置信度输入 | 日常聊天、写作建议、轻量头脑风暴；不写文件、不更新 canon | 普通回答 |
| `IdeaDevelopment` | “完善这个想法”“给几个故事方向” | 将灵感发展为题材、主题、冲突、人物目标和完整故事梗概 | `ConceptDraft` |
| `DocumentTriage` | 指定文件或选中文本 | 判断文件类型、文学体裁、语言、长度和可分析性 | `DocumentClassification` |
| `StoryDeconstruction` | “分析这篇小说”“提取主线和人物线” | 编排长文本分析、章节摘要、主线、人物线、伏笔和结构提取 | `AnalysisReport` |
| `StructureSegmentation` | “拆分章节/场景” | 识别章节和场景边界，在项目目录生成粗略拆分文件，不覆盖原文 | `ChapterSplitResult`（文件路径和边界元数据） |
| `OutlineArchitect` | “规划三卷大纲”“拆章” | 作品、卷、章、场景的层级规划和重规划 | `OutlineDraft` |
| `ScenePlanner` | 生成正文前、重写场景前 | 明确场景目标、冲突、转折、视角和角色意图 | `SceneBrief` |
| `DraftWriter` | 续写、按章纲写正文 | 仅生成草稿或文本插入提案，不直接覆盖正文 | `Draft` / `DiffProposal` |
| `RevisionEditor` | 改写、润色、压缩、扩写 | 按用户约束局部修改，并输出可审核 diff | `DiffProposal` |
| `ContinuityReviewer` | 连贯性、设定、伏笔检查 | 检查人物状态、时间线、事实、读者信息差和伏笔状态 | `ReviewReport` |
| `CanonIngestion` | 从已有文本导入作品设定 | 将人物、地点、事件、关系和伏笔转为待确认结构化候选 | `CanonProposal` |
| `MemoryKeeper` | 章节确认后、任务完成后 | 只维护已确认的事实、摘要、角色状态和线索状态 | `MemoryUpdateProposal` |

### 3.2 P1：通用创作场景 Agent

| Agent | 责任 |
| --- | --- |
| `WorldCharacterCurator` | 创建和维护人物卡、世界书、地点、势力、物品和关系图 |
| `DialogueAgent` | 角色对话、角色扮演、人物语气保持 |
| `CopywriterAgent` | 书名、章节名、简介、宣传语和投稿文案 |
| `ReaderExperienceReviewer` | 检查开篇吸引力、节奏、悬念、情绪曲线和章节结尾 |
| `ResearchAgent` | 外部资料检索、事实核查和来源整理；默认关闭，单独显示联网范围 |
| `BatchProductionAgent` | 批量摘要、批量审校、批量生成、暂停、重试和限速 |
| `TranslationAgent` | 翻译和本地化，保留人物语气和专有名词表 |
| `PublishingAgent` | 目录整理、格式检查、Markdown/EPUB/DOCX 导出 |

### 3.3 P2：可选扩展 Agent

- `StyleCoach`：分析写作风格、句式、节奏和视角；不默认模仿特定在世作者。
- `GenreMarketAnalyst`：题材趋势、读者预期和作品定位。
- 漫画、短剧、视觉小说等衍生内容 Agent。

## 4. Skill 计划

### 4.1 Runtime、安全和上下文 Skill

- `workspace-guard`：授权目录、相对路径、`..`、符号链接和外部文件校验。
- `document-read-normalize`：编码、BOM、换行、行号、字符偏移和段落切片。
- `context-budget`：token 估算、输入/输出预留、上下文预览和超限处理。
- `context-assemble`：按作品、卷、章、场景、人物状态和用户选中文本组装上下文。
- `model-router`：按任务选择模型，支持规划/写作/审校的不同配置。
- `task-checkpoint`：步骤状态、事件记录、暂停、恢复、取消、重试和幂等。
- `provenance-trace`：记录回答或分析结论的文档、章节、行号和片段来源。
- `privacy-redaction`：日志和错误中脱敏正文、API Key 和完整 Prompt。

### 4.2 文件和审核 Skill

- `file-read`：读取授权范围内的文件。
- `workspace-search`：全文搜索和结构定位。
- `file-write-proposal`：生成文件新增、替换、移动和拆分提案。
- `diff-review`：逐块接受、拒绝、合并、撤销和冲突检测。
- `external-change-guard`：检测外部修改，避免静默覆盖。
- `analysis-report-render`：将结构化分析渲染为 Markdown 或 UI 报告。
- `markdown-import-export`、`epub-docx-export`、`backup-restore`。

### 4.3 文学结构和知识 Skill

- `document-classify`：文档类型和文学体裁识别。
- `chapter-boundary-detect`：章节边界识别。
- `scene-boundary-detect`：场景切换识别。
- `chapter-summary`：章节摘要和多级摘要压缩。
- `plot-line-extraction`：主线、支线、剧情阶段和冲突链。
- `character-arc-extraction`：人物目标、关系、变化和人物弧光。
- `timeline-extraction`：事件、时间、地点和先后约束。
- `foreshadowing-extraction`：伏笔、悬念、线索和回收状态。
- `canon-entity`：人物、地点、组织、物品、规则和事件 CRUD。
- `relationship-graph`：关系抽取和关系图数据生成。
- `outline-tree`：作品、卷、章、场景层级树操作。
- `canon-import-proposal`：将分析结果转为待确认的设定变更。

### 4.4 写作和质量 Skill

- `scene-brief`：场景目标、冲突、转折、视角、角色意图。
- `draft-generation`：正文或续写草稿生成。
- `dialogue-generation`：角色对话和语气约束。
- `rewrite-with-diff`：结构化改写提案。
- `style-analysis`、`style-lint`：风格分析和语言问题检查。
- `continuity-check`：设定、事实、时间线、人物状态和伏笔一致性。
- `reader-experience-check`：节奏、悬念、信息披露和章节结尾。
- `fact-extraction`：从已确认正文抽取事实和实体候选。
- `memory-update-proposal`：生成记忆更新提案，不直接写入正式记忆。

## 5. Skill 合同

每个 Skill 必须有版本化合同：

```text
name
version
input_schema
output_schema
allowed_tools
context_scope
side_effects
approval_policy
model_requirements
failure_and_retry
evaluation_cases
```

结构化输出必须经过 JSON Schema 校验。模型输出无法解析时，Runtime 应保留原始响应、允许重试或降级为纯文本回答，不能部分提交数据。

## 6. Service 架构

Agent 不直接处理长文本，也不自行管理重试、缓存和文件写入。长文本能力由 Rust 进程内 Service 提供统一接口；只有需要独立运行时的 embedding、OCR 或第三方库才允许使用可选 sidecar。

### 6.1 Service 职责

| Service | 职责 | 关键产物 |
| --- | --- | --- |
| `DocumentIngestionService` | 读取、编码和换行规范化、文档哈希、行号/字符偏移 | `DocumentRevision` |
| `StructureParserService` | 识别作品、卷、章、段落、场景和标题 | `DocumentStructure` |
| `ChunkService` | 结构切分、句子切分、预算切分、overlap 和来源元数据 | `ChunkManifest` |
| `TokenBudgetService` | 按模型能力计算安全输入、输出预留和汇总层级 | `BudgetDecision` |
| `SummaryCompressionService` | 局部、章节、卷级和全书摘要压缩 | `SummaryNode` |
| `LongTextAnalysisService` | Map-Reduce 编排人物、事件、主线、伏笔和设定提取 | `AnalysisArtifact` |
| `ArtifactCacheService` | 按文档/算法/模型/Prompt/schema 版本缓存和增量失效 | 缓存记录 |
| `EvidenceService` | 将分析结果映射回原文位置 | `EvidenceReference` |
| `WorkspaceIntelligenceService` | 提供不含正文的工作区画像、文档画像和版本化摘要查询 | `WorkspaceProfile` / `DocumentProfile` / `DigestReference` |
| `ModelCapabilityService` | 测量有效上下文、速度、格式稳定性和长距离召回 | `ModelCapability` |
| `JobService` | 后台队列、进度、取消、暂停、恢复、重试和幂等 | `AnalysisJob` |

### 6.2 长文本流水线

```text
DocumentIngestion
  → StructureParser
  → ChunkService
  → TokenBudget
  → 局部分析/摘要
  → 章节汇总
  → 卷级汇总
  → 全书综合
  → Evidence 校验
  → AnalysisArtifact / Proposal
```

每个阶段完成一个最小持久化单元。模型不可用或速度过慢时，保留已完成结果，并允许从失败阶段恢复。

### 6.3 可替换分块后端

`ChunkService` 对外保持稳定接口，内部可以选择：

```text
RustStructureChunker       默认，标题/段落/句子/预算切分
MSchunkerCompatible        参考其确定性层级分块和元数据
ChonkieAdapter              可选，语义或 RAG 分块
ModelAssistedChunker        仅处理模糊的场景边界
```

第三方库不能成为核心导入路径的强依赖，也不能替代原文章节切分的人工预览和确认。

结构拆分采用本地优先策略：显式章节标题、Markdown 层级、场景分隔线和段落边界由确定性解析器直接生成 `ChapterSplitResult` 并写入拆分文件，不要求配置模型。对无显式标记、置信度较低的场景边界，才允许按用户选择调用 `ModelAssistedChunker` 复核；模型不可用时仍完成首轮粗分。

首轮“拆分章节”实施会直接在源文档同级创建可见目录 `<源文件名>-章节拆分/`，保留源文件扩展名；文件命名为 `001-章节-<标题>.<ext>`，无标题时使用 `未命名章节-<序号>`，场景-only 结果使用 `001-场景-<序号>.<ext>`。目录和文件均通过 WorkspaceGuard/文件写入 Tool 创建，禁止覆盖源文档或同名既有文件。消息流只报告已写入的路径，不把全文或拆分提案作为最终结果返回。

本地输出完成后，消息流询问是否需要“重新梳理章节结构”。用户确认后才进入 `structure-enhancement`/`StoryDeconstruction` 的模型增强链路，用于隐含场景边界、章节命名和剧情阶段归纳；增强结果默认仍是草稿或二次提案，不自动覆盖首轮拆分文件。

### 6.4 长文本持久化产物

建议增加以下 SQLite 表或等价存储：

```text
document_revisions
document_structures
text_chunks
chunk_artifacts
summary_nodes
analysis_jobs
analysis_steps
evidence_references
model_capabilities
```

`summary_nodes` 保存父子摘要关系；`text_chunks` 保存原文位置和切分原因；所有模型结果保存模型、Prompt、schema 和算法版本，便于回归与增量失效。

运行态文件不写入工作区 `tmp`。项目级中间目录固定为隐藏的 `.vinkey/`：`chunks/<cache-key>.json` 保存可复用的本地分块 manifest，`analysis/jobs/<job-id>/` 保存一次分析任务的 manifest、分块摘要和最终报告。分块缓存键使用 SHA-256，由源文档相对路径、原文内容指纹、分块算法版本及 token 配置组成；命中时校验指纹、配置、块边界和 token 估算，校验失败则重新切分。章节拆分产生的用户交付文件仍位于源文档同级的 `<源文件名>-章节拆分/`。

## 7. 文本处理与模型能力适配

### 7.1 不把模型名当作真实能力

以 `glm4-9b-1m-q4km` 为例，名称中的 `1m` 可以作为标称上下文能力的线索，但实际可用能力还受以下因素影响：

- Ollama 或其他推理引擎是否真正启用对应上下文长度。
- GPU/CPU 内存、KV Cache 和量化方式。
- 长上下文下的注意力衰减和“中间内容遗忘”。
- 中文 token 化比例和文档格式。
- 输出长度、采样参数和并发请求数量。
- 9B 模型对复杂结构归纳、跨章节关系和长距离引用的准确率。

因此，模型配置不能只保存 `contextWindow`，还应保存实测能力：

```text
advertised_context_window
effective_context_window
safe_input_tokens
reserved_output_tokens
recommended_chunk_tokens
recommended_summary_tokens
max_parallel_jobs
supports_json_schema
supports_long_range_recall
quality_profile
```

### 7.2 分块策略

采用分层 Map-Reduce，而不是把整本书一次塞给模型：

```text
原文
  → 文档切片
  → 每片局部摘要/事实/人物/事件提取
  → 章节级汇总
  → 卷级汇总
  → 全书主线、人物线和伏笔汇总
```

切片原则：

1. 优先按标题、段落、场景和语义边界切分，不在句子中间截断。
2. 保留 `document_path`、行号、字符偏移和章节 ID。
3. 每个块保留少量前后文重叠，但不重复写入摘要。
4. 每一层摘要都保存来源块，支持从结论回溯原文。
5. 长任务必须可暂停和恢复，不能因为一次请求失败而丢失全部结果。

初始默认值只作为待验证假设，不作为永久配置：

| 参数 | 初始假设 | 调整依据 |
| --- | ---: | --- |
| 局部分析块 | 4k～8k tokens | JSON 完整率、事实召回率和响应耗时 |
| 块摘要 | 400～1,000 tokens | 信息覆盖率和汇总压缩比 |
| 汇总输入 | 4k～16k tokens | 跨块主线和人物关系准确率 |
| 输出预留 | 上下文窗口的 15%～25% | 是否截断、是否能完成结构化输出 |
| 本地并发 | 默认 1 | 内存占用、吞吐和错误率 |

如果实测模型能稳定处理更大的上下文，可以放大块大小；如果长文召回或结构化输出明显下降，应减少单块长度并增加汇总层级，而不是盲目使用标称 1M 上下文。

### 7.3 汇总策略

- **摘要任务**：局部摘要 → 章节摘要 → 卷摘要 → 全书摘要。
- **主线任务**：先提取事件和目标，再按时间排序和因果关系汇总。
- **人物线任务**：按人物聚合出场片段和状态变化，不能只依赖章节摘要。
- **伏笔任务**：保存首次出现、相关线索、预期回收和实际回收证据。
- **风格任务**：使用代表性片段采样，避免把整本正文作为单一 Prompt。

## 8. 模型能力评测计划

在建设复杂 Agent 前，先实现一个离线模型评测命令。至少测试：

1. 2k、8k、32k、128k 及更高输入长度的响应成功率。
2. JSON Schema 输出完整率和字段类型错误率。
3. 中文章节边界识别准确率。
4. 章节摘要的事实覆盖率和幻觉率。
5. 跨章节人物状态和时间线一致性。
6. 主线、人物线、伏笔提取的人工评分。
7. 首 token 延迟、tokens/s、总耗时和内存占用。
8. 取消、重试和断点恢复后的结果一致性。

评测结果写入本地模型能力注册表，供 `model-router` 和 `context-budget` 使用。没有评测数据时，只启用短上下文、低并发和人工确认流程。

## 9. 分阶段实施计划

### 9.0 当前阶段版本目标（人物关系分析）

本阶段以单部作品为容量基线：支持 **2,000～5,000 个人物实体、数百万关系候选、数千万条关系证据记录**，并通过离线基准测试验证人物查询、关系邻居查询和有限深度路径查询的延迟。这里的“关系候选”允许尚未确认的模型提案；“证据记录”必须能回溯到文档版本、章节/场景、字符范围或行号。

容量目标不等于对所有人物对做全量模型判断。关系抽取应先按场景共同出场生成候选，再进行实体消歧、关系分类、置信度审核和证据归并。第一阶段以 SQLite 作为规范化事实存储，第二阶段在 Rust 进程内加载作品子图进行度数、连通分量和有限深度遍历等离线计算；只有基准测试显示 SQLite + 图算法库无法满足交互需求时，才评估嵌入式或服务型图数据库。

阶段验收门槛：

- 关系数据采用人物、别名、出场、关系边和证据分表，不能以单一 JSON 图 blob 持久化。
- 人物名、别名和证据文本可通过 FTS5 检索；关系边按源/目标人物、类型和作品建立组合索引。
- 支持增量写入和按文档版本失效，不因单个章节重算而重建整部作品。
- 基准数据覆盖 2,000 和 5,000 人物两档，并记录导入耗时、数据库大小、邻居查询、1～3 跳路径查询的 p50/p95 延迟。

### 9.1 人物资产提取链路（研究确认）

#### 设计结论

初期人物提取可以不依赖大模型，但输出必须定义为“人物候选”和“人物提及”，不能直接视为已确认人物资产。确定性层负责低成本、高召回的候选生成：章节/人物设定标题、显式姓名模式、对话说话人格式、重复出现的专名、已有别名词典和场景共同出场。候选必须携带来源文档版本、章节/场景、字符范围、行号、原文短引、提取规则版本和初始置信度。

模型作为校验器和提案器按需参与，而不是替代整本书的初筛：

1. 校验候选是否为人物，区分人物、地点、组织、物品和普通名词。
2. 对规范化名称相同、标题/称谓不同或代词指向不明确的候选做别名消歧和合并/拆分建议。
3. 只向模型提供候选及其证据窗口，校验索引文本中的人物身份、属性和出场位置；不要求每次重新读取全文。
4. 先由场景共同出场、说话人和动作谓词生成关系候选，再由模型判断关系类型、方向、极性、时间有效性和语义强度。共同出现本身只记录为共现，不自动升级为语义关系。
5. 低置信度、冲突合并和高影响关系进入用户审核；模型结果只能形成 `proposed`，不能绕过确认直接写入 `confirmed` canon。

#### 业务状态和链路

```text
导入/指纹
  → 章节/场景切分
  → 确定性人物候选与提及抽取
  → 名称规范化/词典匹配/候选聚类
  → 人物候选审核（可选模型校验）
  → 人物卡确认 + 提及证据索引
  → 场景级共现/谓词候选关系生成
  → 模型关系语义校验（可选）
  → 关系提案与证据审核
  → 已确认人物图、统计和查询
  → 仅重算变更文档版本，旧结果标记 stale
```

资产状态至少包括 `mention_candidate`、`entity_candidate`、`entity_confirmed`、`relation_candidate`、`relation_confirmed`、`rejected` 和 `stale`。别名消歧优先使用精确匹配和规范化匹配；只有多候选冲突才调用模型或请求用户确认。

业务判断与自动化边界：

| 业务问题 | 默认处理 | 是否允许自动确认 |
| --- | --- | --- |
| 人名/称谓/对话说话人识别 | 规则、词典、章节标题和重复提及产生候选 | 仅高置信且无冲突的候选可自动确认为 `entity_candidate`，不能直接成为 canon |
| 人物与地点/组织/物品同名 | 模型分类或用户选择，保留多个候选及证据 | 不允许自动合并 |
| 姓名、昵称、官职、亲属称谓、化名 | 精确/规范化匹配优先，模型只处理冲突簇 | 唯一匹配可提交别名提案，需确认后写入 |
| “他/她/对方”、省略主语和群体称谓 | 章节窗口内候选链 + 模型校验 | 不允许仅凭规则自动归属 |
| 两人同场但没有明确互动 | 记录共现事件和候选边 | 不得自动判定为语义关系 |
| 亲属、敌对、利用、曾经关系等语义 | 模型输出关系类型、方向、极性、时间和证据 | 形成 `relation_candidate`，高影响关系需确认 |
| 关系随剧情变化或叙述者认知不可靠 | 按章节/场景保存有效区间、叙述视角和置信度 | 不覆盖历史关系，使用新版本或时间片 |
| 文档修改后旧证据失配 | 以源文件指纹和字符范围校验，标记 `stale` | 不自动保留旧证据为有效事实 |

人物资产的最小可交付单元不是一张人物卡，而是“规范化实体 + 别名集合 + 提及集合 + 可核验证据 + 状态/置信度”。关系资产则是“有向/无向关系边 + 关系类型/极性/时间区间 + 至少一条证据”。这样既支持用户先看候选，也支持后续模型只校验高价值或有冲突的局部文本。

#### 外部方案对比与取舍

- [StorySphere](https://github.com/willim9313/storysphere) 将流程拆成“段落级实体抽取 → 实体链接/去重 → 章节级关系与事件抽取”，默认使用 NetworkX，SQLite 保存任务/缓存，并把 Neo4j 作为规模升级选项。其实体链接采用精确名、别名和规范化匹配，适合作为 Vinkey 的分层参考。
- [graphify-novel](https://github.com/Anshler/graphify-novel) 采用章节批处理、SHA 缓存、review 提案和 update 写回；review 不直接修改 bible，确认后再更新图。底层 [graphify](https://github.com/safishamsi/graphify) 使用本地图 JSON 和缓存，Neo4j 只是导出选项，说明初期不需要图数据库。
- [NLP-Characters-Relationships](https://github.com/isthatyoung/NLP-Characters-Relationships) 展示了命名实体、主客体和词向量共现的传统 NLP 路线，但关系语义和别名消歧能力有限，适合作为候选生成而非最终资产确认。
- 商用写作工具 [Novelcrafter Codex](https://www.novelcrafter.com/features) 把人物卡、别名/昵称、正文提及、可选字段和 AI 排除范围作为独立资产；[Sudowrite Story Bible](https://www.sudowrite.com/) 更偏向模型引导的创作流程。两者共同点是结构化 story bible 与正文引用分离，而不是把模型输出直接当作正文事实。

因此 Vinkey 采用“确定性初筛 + 证据索引 + 模型按需校验 + 人工确认 + 增量图更新”的混合链路；不采用“整本小说一次模型抽取并自动提交”，也不把图数据库作为初期依赖。

### 阶段 A：合同和运行时底座

- 定义 `TaskPlan`、`TaskStep`、`TaskEvent`、`Proposal`、`EvidenceReference`。
- 实现 Agent 路由、步骤状态、取消、恢复和统一错误模型。
- 实现 Skill 注册表和 JSON Schema 校验。
- 将所有文件修改统一改为 diff proposal。

### 阶段 B：两个主要入口

- 完成 `IdeaDevelopment`：灵感 → 多个方向 → 故事梗概 → 用户确认。
- 完成 `DocumentTriage` 和 `StoryDeconstruction`：文件 → 分类 → 分析报告。
- 完成 `StructureSegmentation`：章节切分预览 → 用户确认 → 写入章节索引。
- 增加分析报告的来源行号和字符范围。

### 阶段 C：作品结构和写作闭环

- 增加作品、卷、章、场景、人物、世界、事件和伏笔数据模型。
- 完成 `OutlineArchitect`、`ScenePlanner`、`DraftWriter` 和 `RevisionEditor`。
- 完成逐块 diff 审核和 Proposal 提交。

### 阶段 D：长篇记忆和连续性

- 完成 `CanonIngestion` 和 `MemoryKeeper`。
- 加入章节摘要、人物状态、时间线和伏笔状态。
- 先使用 SQLite FTS 和结构化索引；embedding/RAG 在模型评测后再启用。

### 阶段 E：批处理和通用能力

- 增加连续性审校、读者体验审校、角色对话、批量生产和导出。
- 增加研究和翻译能力，并对联网请求单独授权。
- 增加模型能力注册表和回归评测集。

## 10. 验收门槛

- 普通聊天不会修改文件、正式大纲或长期记忆。
- 灵感任务能输出完整梗概，并允许用户选择方向后再生成大纲。
- 指定文学文本能输出分类、概要、主线、人物线、章节结构和伏笔报告。
- 拆章不会覆盖原文；显式执行后直接生成同级拆分目录和编号文件，并支持从源文档重新生成或清理输出。
- 所有分析结论可回溯到原文位置。
- 超长文本任务可分块、暂停、恢复和重试。
- 模型能力变化只需更新模型注册表和策略，不需要重写 Agent。
- 未配置模型时，文件浏览、编辑、搜索和日常聊天仍可用。

## 11. 当前代码链路盘点

### 11.1 已实现

```text
文件树/编辑器
  → WorkspaceGuard
  → read_document / search_workspace
  → React 状态与编辑器

聊天输入
  → TaskRouter（指令 + 不含正文的文档清单，先判断 intent / scope / operation / side_effect / document_access）
  → Tool/Skill Registry（版本、权限、副作用、超时、可取消性和允许工具）
  ├─ StructureSegmentation → 本地 StructureParser/ChunkService → ChapterSplitResult + 输出文件
  ├─ 项目概览 → WorkspaceIntelligence（清单/结构元数据/缓存摘要）→ metadata-only 回答
  ├─ 项目深度分析 → WorkspaceInventory（敏感/类型/大小过滤）→ Chunk/Map/Reduce/Synthesis → 项目汇总 + evidence.json
  ├─ 文档深度分析 → LongTextAnalysis Service → Chunk/Map/Reduce/Synthesis → 获授权的本地模型 Provider
  ├─ 明确引用文档的创作请求 → context budget → 小文本 stream_chat / 超长文本 Chunk/Map/Reduce/Synthesis
  └─ 普通聊天 → 不读取所选文档正文 → stream_chat → Ollama/OpenAI-compatible Provider
       → SQLite 会话消息

指定文本分块（底层能力）
  → read_document
  → chunk_document
  → ChunkManifest

人物关系结构化底座（当前阶段）
  → SQLite characters / aliases / mentions / relationships / evidence
  → FTS5 人物检索
  → Rust petgraph 统计、连通分量和有限跳数路径
```

`chunk_document` 已实现 Rust 逻辑、Tauri 命令、前端类型和调用封装；当前新增的本地 `structureSegmentation` 服务会在模型请求前识别章节/场景候选，并通过文件写入 Tool 在源文档同级生成粗略拆分文件。项目级深度分析已增加确定性工作区清单、安全过滤、全项目长文本编排、内容指纹、任务阶段产物和证据行号校验；不支持或超限文件会进入排除清单，不会发送给模型。长文本任务现在会持久化任务清单，支持列出未完成任务、读取已有分块/摘要产物，并从已完成的 Map 阶段恢复进入 Reduce/Synthesis；恢复前会校验工作区、指令和源文档指纹。概览分析已实现正文零读取的工作区/文档画像，Tool Registry 按模式隔离读取能力；深度模型请求携带 `local-chunks`，并由前端与 Rust 服务层共同限制为回环模型端点。

### 11.2 尚未实现

1. 完整 Tool/Skill 执行注册表和 IntentRouter（当前已落地版本化的 Tool/Skill 描述、权限/副作用/超时合同，并由 TaskRouter 返回 Agent、Skill 和允许 Tool；尚未接入统一执行器、JSON Schema 运行时校验和动态路由）。
2. 完整 `AnalysisJob` 后台队列服务、跨重启暂停/恢复、取消/重试幂等，以及模型摘要产物的增量失效（当前已具备任务 JSON 产物、任务列表、产物读取和 Map 阶段恢复）。
3. 项目级检索层、`DocumentTriage`、`StoryDeconstruction` 和按目录/主题的持久化分层摘要。
4. 文档 `Proposal`/diff 审核以及完整结构化 canon；人物关系的 SQLite/FTS5/图算法底座已落地，实体抽取、别名消歧、模型提案审核和事件/时间线结构化仍未实现。
5. 模型能力注册表和本地模型基准测试。

后续业务实现必须将本地 `structureSegmentation` 输出提升为统一的 `StructureSegmentation` Service，并接入输出清理/重生成和章节索引；不能把全文直接组装进普通聊天，也不能在聊天组件中复制分块和汇总逻辑。
