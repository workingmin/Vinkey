# Vinkey Agent 与 Skill 建设计划

- 状态：规划中
- 适用版本：Vinkey 本地 AI 文学创作工作台
- 目标：在现有 Tauri 2 + React + Rust + SQLite MVP 上，建立可审核、可恢复、适配本地模型能力的文学创作 Agent/Skill 系统。
- 相关文档：[开发框架与技术选型](DEVELOPMENT_FRAMEWORK.md)、[GitHub 同类项目调研与功能取舍](GITHUB_REFERENCE.md)、[对话页设计](UI_DESIGN_CHAT.md)、[文件与编辑器设计](UI_DESIGN_EDITOR.md)

## 1. 设计边界

### 1.1 Agent 与 Skill 的定义

- **Agent**：面向一个用户目标的任务协调者。负责理解意图、拆解步骤、选择 Skill、处理模型响应、汇总结果和请求用户确认。
- **Skill**：一个可复用的原子能力。必须有明确输入输出、允许使用的工具、上下文范围和副作用等级。
- **Runtime**：负责路由、任务状态、模型调用、预算、取消、恢复、日志脱敏和权限，不由单个 Agent 自行实现。

Agent 不应拥有通用文件系统权限。所有文件写入、设定变更和长期记忆更新都通过受限 Skill 生成 Proposal，再由用户确认后提交。

### 1.2 副作用等级

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

## 3. Agent 计划

### 3.1 P0：必须完成的核心 Agent

| Agent | 主要入口 | 责任边界 | 主要输出 |
| --- | --- | --- | --- |
| `IntentRouter` | 所有入口 | 判断意图、范围、副作用和目标 Agent；不生成正文 | `TaskPlan` |
| `GeneralConversation` | 普通问题、创作陪伴、低置信度输入 | 日常聊天、写作建议、轻量头脑风暴；不写文件、不更新 canon | 普通回答 |
| `IdeaDevelopment` | “完善这个想法”“给几个故事方向” | 将灵感发展为题材、主题、冲突、人物目标和完整故事梗概 | `ConceptDraft` |
| `DocumentTriage` | 指定文件或选中文本 | 判断文件类型、文学体裁、语言、长度和可分析性 | `DocumentClassification` |
| `StoryDeconstruction` | “分析这篇小说”“提取主线和人物线” | 编排长文本分析、章节摘要、主线、人物线、伏笔和结构提取 | `AnalysisReport` |
| `StructureSegmentation` | “拆分章节/场景” | 识别章节和场景边界，生成切分提案，不改原文 | `ChapterSplitProposal` |
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

## 6. 文本处理与模型能力适配

### 6.1 不把模型名当作真实能力

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

### 6.2 分块策略

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

### 6.3 汇总策略

- **摘要任务**：局部摘要 → 章节摘要 → 卷摘要 → 全书摘要。
- **主线任务**：先提取事件和目标，再按时间排序和因果关系汇总。
- **人物线任务**：按人物聚合出场片段和状态变化，不能只依赖章节摘要。
- **伏笔任务**：保存首次出现、相关线索、预期回收和实际回收证据。
- **风格任务**：使用代表性片段采样，避免把整本正文作为单一 Prompt。

## 7. 模型能力评测计划

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

## 8. 分阶段实施计划

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

## 9. 验收门槛

- 普通聊天不会修改文件、正式大纲或长期记忆。
- 灵感任务能输出完整梗概，并允许用户选择方向后再生成大纲。
- 指定文学文本能输出分类、概要、主线、人物线、章节结构和伏笔报告。
- 拆章不会覆盖原文，必须支持预览、接受、拒绝和恢复。
- 所有分析结论可回溯到原文位置。
- 超长文本任务可分块、暂停、恢复和重试。
- 模型能力变化只需更新模型注册表和策略，不需要重写 Agent。
- 未配置模型时，文件浏览、编辑、搜索和日常聊天仍可用。
