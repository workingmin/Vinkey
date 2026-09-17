# Vinkey Agent 流程模板

- 状态：设计基线，供实现、评测和实测对照
- 日期：2026-09-17
- 来源：[Agent 与 Skill 建设计划](AGENT_SKILL_PLAN.md)、[AI 业务链路架构](AI_BUSINESS_CHAINS.md)
- 对比说明：[Agent 流程对比](AGENT_FLOW_COMPARISON.md)

## 1. 使用方式

本文件把建设计划中的领域 Agent 转成可执行、可评测、可版本化的流程模板。模板描述业务目标和 Runtime 合同，不等同于一段 system prompt。Agent 不能绕过 `TaskPolicy`、`ToolGateway`、Skill 合同或审批策略。

每次执行都必须先形成统一信封：

```yaml
agent_run:
  template_id: string
  template_version: semver
  task_id: string
  outcome: string
  constraints: string[]
  definition_of_done: string[]
  input_refs: TargetRef[]
  context_policy:
    scope: conversation | selection | documents | work | workspace
    source_policy: metadata-only | local-excerpts | local-chunks
    coverage: index-only | targeted | exhaustive
  execution:
    mode: deterministic | direct-model | workflow | agent | hybrid
    allowed_skills: string[]
    allowed_tools: string[]
    budget: BudgetPolicy
  checkpoints: Checkpoint[]
  approval_policy: auto | review-result | approve-proposal | approve-network
  output_contract: string
  verification: VerificationRule[]
  fallback: string
```

共同执行骨架：

```text
TaskIntake
  -> IntentRouter（显式 actionId 优先）
  -> TaskPolicy（范围、来源、副作用、预算、允许 Skill/Tool）
  -> Preflight（缺目标则澄清；权限不足则停止）
  -> Execute（按模板步骤运行并写 TaskEvent/Checkpoint）
  -> Verify（schema、来源、覆盖、源指纹、质量门槛）
  -> Deliver（回答 / Artifact / Proposal）
  -> Approval（仅在合同要求时）
  -> Commit（仅提交用户已确认的变更）
```

## 2. 模板不变量

1. `outcome`、`constraints` 和 `definition_of_done` 缺一不可；长任务必须可判断何时完成。
2. 路由阶段只使用不含正文的元数据。正文只能在策略通过后由获授权 Skill 读取。
3. Agent 只能选择计划允许的 Skill；Skill 只能调用合同允许的 Tool。
4. `proposal`、`write`、`network` 不得由普通 `draft` 权限隐式升级。
5. 分析结论必须携带覆盖范围和来源；创作草稿必须标记为未确认。
6. 运行事件只描述可验证动作，不保存隐藏思维链、完整 Prompt、正文或密钥。
7. 暂停、恢复和步骤重试复用同一输入快照；目标、模型或源指纹变化时创建新任务。
8. 模型结构化输出校验失败时不得部分提交；允许重试或降级为纯文本草稿。

## 3. P0 核心 Agent

### 3.1 GeneralConversation

- 模板：`conversation.answer@1`
- 目标：回答普通问题、提供创作陪伴或低成本头脑风暴。
- 执行：`direct-model`；无正文目标时 `source_policy=metadata-only`。
- 任务链：解析当前问题 -> 检索必要的已确认项目记忆 -> 组装最近会话 -> 生成回答 -> 检查是否误称读取了未授权正文 -> 交付。
- Skill：`general-conversation`、`context-assemble`、`search-project-memory`。
- 输出：`ConversationAnswer`；不得包含文件或记忆写入动作。
- 完成定义：直接回答用户问题；未知信息明确说明；未产生副作用。
- 失败策略：模型失败可原位重试；不自动扩大上下文。

### 3.2 IdeaDevelopment

- 模板：`creation.idea-development@1`
- 目标：把零散灵感发展为可选择的故事方向和完整概念草案。
- 执行：首次 `direct-model`，用户选定方向后可进入固定规划 Workflow。
- 任务链：提取题材/主题/约束 -> 识别缺失槽位 -> 必要时提出一个最小澄清问题 -> 生成 2 至 4 个差异化方向 -> 用户选择 -> 扩展冲突、人物目标、代价和结局假设 -> 一致性检查。
- Skill：`concept-framing`、`premise-variation`、`story-synopsis`。
- 输出：`ConceptDraft[]`，每项含核心命题、主角目标、主要阻力、升级路径和风险。
- 审批点：选择方向；未选择前不生成正式大纲。
- 完成定义：至少一个方向满足全部显式约束，且方向之间不是表面改写。

### 3.3 DocumentTriage

- 模板：`analysis.document-triage@1`
- 目标：判断文档类型、体裁、语言、规模、结构信号和可分析性。
- 执行：确定性元数据优先；模糊体裁才使用有界模型调用。
- 任务链：读取文档画像 -> 检查类型/大小/编码 -> 提取标题层级和结构信号 -> 必要时读取短摘录 -> 分类与置信度 -> 推荐后续分析策略。
- Skill：`document-classify`、`document-read-normalize`、`context-budget`。
- 输出：`DocumentClassification`，含置信度、风险、推荐 `mode/coverage/sourcePolicy`。
- 完成定义：每个目标都有明确结论或不可分析原因；不得静默进入全文分析。
- 失败策略：读取失败按文件隔离报告，其余文件可继续。

### 3.4 StoryDeconstruction

- 模板：`analysis.story-deconstruction@1`
- 目标：输出可回溯的概要、结构、主支线、人物线、伏笔和主题报告。
- 执行：短文可用有界 Workflow；长文固定使用可恢复 Map/Reduce/Synthesis。
- 任务链：目标清单与源指纹 -> 结构解析 -> 分块 -> 局部提取 -> 章节/卷级归并 -> 全书综合 -> 来源校验 -> 覆盖报告 -> 渲染 Artifact。
- Skill：`chapter-summary`、`plot-line-extraction`、`character-arc-extraction`、`foreshadowing-extraction`、`provenance-trace`、`analysis-report-render`。
- 输出：`AnalysisReport`、`EvidenceReference[]`、`CoverageReceipt`。
- 检查点：chunk、map、chapter/volume reduce、synthesis、evidence。
- 完成定义：目标覆盖可解释；关键结论有来源；排除项和失败块显式列出。

### 3.5 StructureSegmentation

- 模板：`document.structure-segmentation@1`
- 目标：在不覆盖原文的前提下生成章节/场景拆分结果。
- 执行：`deterministic` 优先；低置信边界可由用户选择模型复核。
- 任务链：读取目标 -> 标题/分隔符/段落解析 -> 生成边界及置信度 -> 冲突预检 -> 创建同级拆分目录和编号文件 -> 输出路径清单 -> 询问是否增强结构。
- Skill：`chapter-boundary-detect`、`scene-boundary-detect`、`file-write-proposal`、`external-change-guard`。
- 输出：`ChapterSplitResult`。
- 审批点：首次显式命令即授权创建非覆盖式输出；模型增强和覆盖/清理必须再次确认。
- 完成定义：源文件未改变；每个输出范围连续且可回溯；同名冲突 fail closed。

### 3.6 OutlineArchitect

- 模板：`planning.outline-architect@1`
- 目标：生成或重构作品、卷、章、场景层级大纲。
- 执行：`workflow`；跨既有正文重规划时可升级为 `hybrid`。
- 任务链：读取概念/已确认 canon/现有大纲 -> 提取硬约束 -> 设计全局推进 -> 分卷 -> 分章 -> 场景职责检查 -> 节奏与因果校验 -> 输出大纲提案。
- Skill：`outline-tree`、`scene-brief`、`continuity-check`。
- 输出：`OutlineDraft` 或 `OutlineChangeProposal`。
- 审批点：替换、移动或删除既有节点必须逐项或整批确认。
- 完成定义：每级节点有目标和结果；主线因果闭合；未确认内容不进入正式大纲。

### 3.7 ScenePlanner

- 模板：`planning.scene-planner@1`
- 目标：在生成或重写正文前形成可执行场景简报。
- 执行：有界 `direct-model` 或短 Workflow。
- 任务链：读取章节目标、相邻场景、人物当前状态和 canon -> 确定 POV/时间/地点 -> 明确目标、冲突、转折、信息披露和离场状态 -> 连续性预检 -> 交付简报。
- Skill：`scene-brief`、`context-assemble`、`continuity-check`。
- 输出：`SceneBrief`。
- 完成定义：场景具有进入状态、冲突变化和退出状态；不引入未声明的 canon 事实。
- 失败策略：上下文冲突时列出冲突并请求用户裁决，不自行改 canon。

### 3.8 DraftWriter

- 模板：`creation.draft-writer@1`
- 目标：依据场景简报、原文和风格约束生成续写或正文草稿。
- 执行：单场景 `direct-model`；长章使用有界 Workflow，不使用摘要重建目标正文。
- 任务链：锁定目标范围和源指纹 -> 装配 SceneBrief、相邻正文和必要 canon -> 预算检查 -> 生成草稿 -> 风格/连续性自检 -> 输出草稿或插入提案。
- Skill：`draft-generation`、`context-assemble`、`style-lint`、`continuity-check`。
- 输出：`Draft` 或 `DiffProposal`。
- 审批点：任何插入、替换都进入 diff 审核；不自动保存。
- 完成定义：满足长度、视角和禁用项；与输入范围衔接；提案绑定源指纹。

### 3.9 RevisionEditor

- 模板：`creation.revision-editor@1`
- 目标：按约束对选区、场景、章节或多文件范围进行精确修改。
- 执行：选区 `direct-model`；单章 `bounded workflow`；多文件 `hybrid revision`。
- 任务链：冻结 baseline/范围/指纹 -> 分析修改意图 -> 锁定不可修改项 -> 按目标块生成 replacement -> schema 与重叠校验 -> 生成 diff -> 用户逐块审核 -> 接受后仍保持未保存。
- Skill：`rewrite-with-diff`、`external-change-guard`、`diff-review`。
- 输出：`DiffProposalSet`。
- 审批点：逐块接受/拒绝、接受全部、放弃全部；正式保存仍由用户执行。
- 完成定义：模型不能改变路径和范围；无重叠目标；原文变化时拒绝应用。

### 3.10 ContinuityReviewer

- 模板：`review.continuity@1`
- 目标：发现人物状态、时间线、事实、读者信息差和伏笔的潜在冲突。
- 执行：确定性候选检索 + `hybrid` 证据审校；这是首批 Agent 试点。
- 任务链：建立检查维度 -> 检索候选事实/提及 -> 为每个候选选择最小证据窗口 -> 模型判定支持/冲突/不确定 -> 反例检索 -> 来源校验 -> 按严重度生成报告。
- Skill：`continuity-check`、`timeline-extraction`、`foreshadowing-extraction`、`provenance-trace`。
- 输出：`ReviewReport`，每项含 claim、证据、置信度、影响和建议。
- 审批点：报告只读；修复建议需另起 `RevisionEditor` 任务。
- 完成定义：疑点与已确认冲突分开；无证据结论不得标记为确定冲突。

### 3.11 CanonIngestion

- 模板：`knowledge.canon-ingestion@1`
- 目标：把文本中的人物、地点、事件、关系、规则和伏笔转换为待确认 canon。
- 执行：确定性候选抽取 + 局部模型消歧 + Proposal 审批；这是第二个 Agent 试点。
- 任务链：目标与指纹 -> 实体/提及候选 -> 别名聚合 -> 局部消歧 -> 关系与事件抽取 -> 与现有 canon 对齐 -> 冲突分类 -> 生成候选 -> 用户确认 -> Runtime 提交。
- Skill：`fact-extraction`、`canon-entity`、`relationship-graph`、`canon-import-proposal`、`provenance-trace`。
- 输出：`CanonProposal`。
- 审批点：新增、合并、覆盖和冲突分别确认；不得直接写正式 canon。
- 完成定义：每项候选有来源、置信度和操作类型；拒绝项不污染正式数据。

### 3.12 MemoryKeeper

- 模板：`knowledge.memory-keeper@1`
- 目标：从已确认结果中维护可失效、可追溯的项目长期记忆。
- 执行：固定 Workflow；只消费已确认正文、canon 或用户决策。
- 任务链：选择合格来源 -> 提取事实/摘要/人物状态/伏笔状态 -> 去重与矛盾检查 -> 计算来源版本 -> 生成记忆候选 -> 用户确认 -> 写入/更新 -> 建立失效条件。
- Skill：`fact-extraction`、`memory-update-proposal`、`provenance-trace`。
- 输出：`MemoryUpdateProposal`。
- 审批点：确认写入或忽略；批量覆盖需显示受影响旧记忆。
- 完成定义：只保存已确认事实；来源变化可定位需失效条目；审校疑点不进入记忆。

## 4. P1 通用创作 Agent

### 4.1 WorldCharacterCurator

- 模板：`knowledge.world-character-curation@1`
- 任务链：读取已确认 canon -> 识别缺失/冲突字段 -> 创建或编辑人物、地点、势力、物品、规则候选 -> 关系图校验 -> 用户确认 -> 提交。
- Skill：`canon-entity`、`relationship-graph`、`canon-import-proposal`。
- 输出/审批：`WorldCanonProposal`；所有正式变更需确认。
- 完成定义：稳定 ID、别名、关系方向和证据完整；不以自由文本静默覆盖实体。

### 4.2 DialogueAgent

- 模板：`creation.dialogue@1`
- 任务链：读取场景目标与人物语气样本 -> 提取每人意图/隐瞒信息 -> 规划对话节拍 -> 生成台词与必要动作 -> 声音区分和信息披露检查 -> 输出草稿/diff。
- Skill：`dialogue-generation`、`context-assemble`、`style-lint`。
- 输出/审批：`DialogueDraft` 或 `DiffProposal`；写回需审核。
- 完成定义：角色声音可区分；每轮对话推动冲突或信息；不泄露角色未知信息。

### 4.3 CopywriterAgent

- 模板：`creation.copywriter@1`
- 任务链：识别载体、受众、长度和禁用项 -> 提取作品卖点 -> 生成差异化候选 -> 检查剧透、事实和字符限制 -> 排序并说明适用场景。
- Skill：`copy-generation`、`style-lint`。
- 输出：`CopyDraft[]`，涵盖书名、章名、简介、宣传语或投稿文案。
- 完成定义：符合载体限制；不虚构作品事实；候选具备真实差异。

### 4.4 ReaderExperienceReviewer

- 模板：`review.reader-experience@1`
- 任务链：确定目标读者和检查范围 -> 分析开篇承诺、节奏、悬念、情绪曲线、信息密度和章末拉力 -> 定位证据 -> 区分偏好与结构问题 -> 给出按收益排序的建议。
- Skill：`reader-experience-check`、`provenance-trace`。
- 输出：`ReaderExperienceReport`。
- 完成定义：每项建议说明读者影响和证据；不把个人偏好表述为硬性错误。

### 4.5 ResearchAgent

- 模板：`research.evidence@1`
- 任务链：把创作问题拆成可验证子问题 -> 展示联网范围并获取授权 -> 检索 -> 来源质量筛选 -> 交叉核验 -> 事实/推断分层 -> 引用整理 -> 交付研究包。
- Skill：`research-query-plan`、`web-search`、`source-evaluation`、`provenance-trace`。
- 输出：`ResearchBrief`。
- 审批点：每次扩大域名、下载文件或发送本地正文前再次授权。
- 完成定义：关键事实至少有可靠来源；时效和不确定性显式；外部内容不自动写入 canon。

### 4.6 BatchProductionAgent

- 模板：`batch.production@1`
- 任务链：展开目标清单 -> 冲突和预算预检 -> 生成批次计划 -> 小样确认 -> 限并发执行 -> 单项校验/检查点 -> 聚合失败 -> 输出批次收据。
- Skill：目标任务 Skill、`task-checkpoint`、`batch-rate-limit`。
- 输出：`BatchResult`，单项状态必须独立。
- 审批点：批量写入前先审小样和影响范围。
- 完成定义：可暂停/恢复；失败项不阻塞已完成项；不得让两个任务同时修改同一目标。

### 4.7 TranslationAgent

- 模板：`creation.translation@1`
- 任务链：锁定语言、地区、受众和格式 -> 建立专名/语气表 -> 分段翻译 -> 跨段术语与指代校验 -> 回译抽检 -> 输出译稿/diff。
- Skill：`translation`、`terminology-memory`、`style-lint`。
- 输出：`TranslationDraft`、`TerminologyProposal`。
- 审批点：专名表更新和文件写回需确认。
- 完成定义：格式与段落映射可追踪；专名一致；不擅自本地化剧情事实。

### 4.8 PublishingAgent

- 模板：`publishing.export@1`
- 任务链：收集已确认文档 -> 目录和链接校验 -> 格式规范化预览 -> 缺失资源检查 -> 生成目标格式 -> 打开产物验证 -> 输出发布收据。
- Skill：`markdown-import-export`、`epub-docx-export`、`backup-restore`。
- 输出：`PublishingArtifact`、`ValidationReport`。
- 审批点：覆盖既有导出物、重排目录或修改源文档需确认。
- 完成定义：产物可打开；目录、字符编码、资源引用和元数据通过校验。

## 5. P2 可选 Agent

### 5.1 StyleCoach

- 模板：`review.style-coach@1`
- 任务链：确定分析维度 -> 选择代表性样本 -> 统计句式/节奏/视角/词汇特征 -> 定位例证 -> 给出练习和修改建议 -> 可选生成局部 diff。
- Skill：`style-analysis`、`style-lint`、`provenance-trace`。
- 输出：`StyleReport`；不默认模仿特定在世作者。
- 完成定义：观察与建议分开；每项风格判断有样本；修改仍由 RevisionEditor 审核。

### 5.2 GenreMarketAnalyst

- 模板：`research.genre-market@1`
- 任务链：确认市场、语言、平台和时间范围 -> 获取联网授权 -> 收集可引用信号 -> 区分数据与主观看法 -> 映射作品定位 -> 给出机会、风险和验证假设。
- Skill：`web-search`、`source-evaluation`、`market-positioning`。
- 输出：`MarketPositioningReport`。
- 完成定义：数据带日期和来源；不保证商业结果；建议不覆盖作者的创作目标。

### 5.3 DerivativeAdaptationAgent

- 模板：`creation.derivative-adaptation@1`
- 任务链：确定媒介合同（漫画/短剧/视觉小说） -> 提取不可变剧情和角色弧 -> 映射媒介单位 -> 重新设计节拍与信息呈现 -> 连续性检查 -> 输出改编大纲和样稿。
- Skill：`story-synopsis`、`outline-tree`、`scene-brief`、媒介专用渲染 Skill。
- 输出：`AdaptationDraft`。
- 审批点：删改主线、合并人物和改变结局必须明确确认。
- 完成定义：保留指定核心；满足目标媒介长度和节奏合同；重大偏离有变更说明。

## 6. 运行事件模板

所有 Agent 使用同一组可观察事件，消息流不按 Agent 自创状态：

```yaml
task_event:
  task_id: string
  run_id: string
  step_id: string
  phase: intake | planning | reading | executing | verifying | awaiting_approval | completed
  status: queued | running | paused | completed | failed | cancelled
  label: string
  progress: { completed: number, total: number } | null
  artifact_refs: string[]
  approval_ref: string | null
  retryable: boolean
  timestamp: unix_ms
```

消息流只显示 `label`、进度、耗时、Artifact、审批和稳定错误信息。模型推理文本、未授权正文和完整 Prompt 不属于 TaskEvent。

## 7. 模板验收矩阵

每个模板进入实现前至少具备：

| 维度 | 必需证据 |
| --- | --- |
| 正确性 | 输出 schema 测试、领域样例、反例 |
| 范围 | 无目标、单目标、多目标、超预算测试 |
| 权限 | Tool allowlist、来源策略、副作用越权测试 |
| 恢复 | 暂停、取消、进程重启、失败步骤重试 |
| 来源 | 源指纹、覆盖率、引用准确率 |
| 审批 | 接受、拒绝、部分接受、源已变化 |
| 成本 | 首 token、总耗时、token、模型调用次数、缓存命中 |
| 产品 | 空态、运行态、失败态、等待确认、完成态 |

P0 模板优先接入 `ContinuityReviewer` 和 `CanonIngestion` 的 A/B 试点。若 Agent 模式在完成率、证据准确率、人工修正量或恢复能力上没有超过固定 Workflow，则保留固定链路，不扩大 Agent 化范围。

## 8. 模板与当前实现的边界

截至本文日期，代码中的 Agent Registry 已注册 `GeneralConversation`、`StructureSegmentation`、`StoryDeconstruction`、`RevisionEditor` 和 `ContinuityReviewer`。其中部分仍由 deterministic、direct-model 或 fixed workflow 执行；“已注册 Agent 名称”不等于已经启用自适应 Agent Loop。

`CanonIngestion` 是下一项 Agent 试点；其余 P0/P1/P2 模板目前是目标合同。实现时必须逐个补齐 Registry、Skill/Tool schema、Runtime 分发、持久化、消息流状态和评测用例，不能只增加 prompt 或前端入口就标记完成。
