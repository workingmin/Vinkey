# IntentRouter 专项设计

- 状态：已实现确定性路由与专项模型评测入口
- 适用版本：Vinkey 本地 AI 文学创作工作台
- 上位设计：[Agent 与 Skill 建设计划](AGENT_SKILL_PLAN.md)
- 验收手册：[IntentRouter 测试与验收](INTENT_ROUTER_TEST_ACCEPTANCE.md)

## 1. 职责与边界

`IntentRouter` 是 Runtime Service，负责把不含正文的 `TaskRequest` 转换为受策略约束的 `TaskPlan`。它判断意图、Agent、Skill、作用域、来源策略、置信度和执行模式，但不读取正文、不生成正文，也不直接执行 Tool。

确定性信息优先级如下：

1. 显式 `actionId`、编辑器选区和结构化 `targets`。
2. 已验证的上一任务引用及安全续问。
3. 当前指令中的高置信自然语言规则。
4. 低置信请求进入最小澄清；分类模型只用于专项评测和后续歧义分类，不能扩大文件权限。

任何正文读取都必须发生在 `TaskPlan` 完成校验以后。模型分类结果只能提出路由候选，最终仍需通过 `TaskPolicy` 和 Rust `execute_task` 复验。

## 2. 代码地图

| 层 | 文件 | 职责 |
| --- | --- | --- |
| TaskIntake | `src/lib/taskRuntime.ts` | 创建、清洗和去重 `TaskRequest.targets`，恢复安全会话引用 |
| IntentRouter | `src/lib/intent.ts` | 确定性意图分类和 `TaskPlan` 生成 |
| Agent/Skill Registry | `src/lib/registry.ts` | Intent 到 Agent、Skill、Tool allowlist 的唯一映射 |
| 前端策略校验 | `src/lib/runtimePolicy.ts` | 校验 Skill、Tool、来源策略和副作用 |
| 执行策略 | `src/lib/executionStrategy.ts` | 选择 deterministic/direct/fixed/hybrid 执行方式 |
| Rust 准入 | `src-tauri/src/task_runtime.rs` | 反序列化并复验前端计划，签发 Service Dispatch |
| 模型专项评测核心 | `src/lib/intentModelEvaluation.ts` | 版本化用例、严格输出合同和准确率统计 |
| 桌面评测适配 | `src/lib/intentModelEvaluationDesktop.ts` | 使用 Tauri profile/connection/stream_chat 接口 |
| 独立 CLI | `scripts/intent-model-eval.ts` | 只读 SQLite 并调用本机模型端点 |

## 3. 输入合同

`TaskRequest` 的路由相关字段：

```text
entryPoint       请求入口
actionId         显式 AI 动作；自由对话为空
instruction      用户原始指令
intent/scope     显式入口可预填
targets          document / selection / chapter / work 稳定 ID
userConstraints  风格、长度、格式和禁止项
conversationRef  上一任务 ID 与不含正文的摘要引用
requestedEffect  read / draft / proposal / write / network
```

`createTaskRequest` 必须删除空目标、修剪 ID，并按 `kind + id` 去重。新入口必须传结构化目标；`hasContextDocuments` 只为旧调用和当前活动文档保留。

## 4. 文档数量语义

`IntentRouter` 从 `document` 和 `selection` 目标推导 `TaskPlan.documentSelection`：

| 目标数 | 值 | 说明 |
| --- | --- | --- |
| 0 | `none` | 没有显式文档目标 |
| 1 | `single` | 一个文档或一个编辑器选区 |
| 2 及以上 | `multiple` | 多个文档目标 |

直接调用 `classifyTask` 时，去重后的 `@path` 也参与数量推导。旧布尔输入 `true` 按 `single` 处理。

`documentSelection` 仅记录选择事实，不能授予正文访问。例如携带两个文件请求“写一句晚安”时，结果是 `multiple + general-chat + documentAccess=none`。正文权限由 `documentAccess` 单独控制。

## 5. 输出合同

`TaskPlan` 的关键字段：

```text
intent / agent / skill / allowedTools
operation / scope / sideEffect
documentSelection / documentAccess
analysisMode / analysisCoverage / sourcePolicy
requiresModel / confidence / revisionStrategy / execution
```

TypeScript 和 Rust 两端都必须接受并校验 `documentSelection`。Rust 使用 `deny_unknown_fields`，新增计划字段时必须同步更新 `src-tauri/src/task_runtime.rs` 及其序列化测试。

## 6. 决策顺序

1. 显式 `actionId` 直接映射 Intent，不重新猜测。
2. 安全续问继承上一任务的 Intent 和结构化目标；Proposal 和历史选区正文不继承。
3. 结构增强、章节拆分、连续性、文档改写等高置信规则优先。
4. 项目级问题区分 overview、focused、deep。
5. 文档分析和人物关系按语义路由。
6. 只有确实存在文档上下文且指令引用文档时，才进入低置信文档分析。
7. 其余请求回退 `general-chat`，不读取已附带但无关的文件。

路径 mention 在匹配关键词前必须移除，避免文件名中的“章节拆分”等词误触发路由。

### 6.1 词元证据层

文档语义分析分支使用版本化词元词典 `intent-token-dict-1`（见 `src/lib/intent.ts`），为高信号短语累加 Intent 分数，并保留可解释证据：

| 词元类别 | 示例 | 默认 Intent | 权重 |
| --- | --- | --- | ---: |
| 人物关系 | 人物关系、角色冲突、角色关联 | `character-analysis` | 6 |
| 人物命运 | 人物命运、角色成长、人物弧光 | `character-analysis` | 5 |
| 跨文档比较 | 比较文档的人物塑造、叙事视角 | `document-analysis` | 7 |
| 故事结构 | 故事主线、情节结构、叙事视角 | `document-analysis` | 3 |

词典只在确定性文档分析分支内参与 Intent/Skill 选择，不改变 `documentSelection`、正文访问权限或 Tool allowlist。高置信证据用于确定路由，文档路径会先被移除，路径中的关键词不能产生证据。最高分与次高分差距不足时，计划降为 `low` 置信度，由现有调度层在正文读取前要求澄清；不得静默覆盖用户的复合意图。

## 7. Agent 与 Skill 分类

| Intent | Agent | 主要 Skill |
| --- | --- | --- |
| `general-chat` | `GeneralConversation` | `general-conversation` |
| `structure-segmentation` | `StructureSegmentation` | `chapter-boundary-detect` |
| `structure-enhancement` | `StoryDeconstruction` | `structure-enhancement` |
| `document-analysis` | `StoryDeconstruction` | `long-text-analysis` |
| `character-analysis` | `StoryDeconstruction` | `character-arc-extraction` |
| `document-revision` | `RevisionEditor` | `document-revision` |
| `continuity-review` | `ContinuityReviewer` | `continuity-review` |
| `workspace-analysis` | `StoryDeconstruction` | 随 overview/focused/deep 选择 |

Registry 是 Agent/Skill 映射的权威来源。评测用例必须与 Registry 和确定性路由同步，不能在测试中另建一套业务映射。

## 8. 模型分类边界

轻量分类模型只接收 `instruction` 和无正文 `targets`，输出严格 JSON：

```json
{
  "intent": "document-analysis",
  "agent": "StoryDeconstruction",
  "skill": "long-text-analysis",
  "scope": "selected-documents",
  "documentSelection": "single"
}
```

未知枚举、缺失/多余字段、Markdown 代码块或非 JSON 输出都判定失败。模型分类不能提升 `documentAccess`、`sourcePolicy`、副作用或 Tool allowlist。

## 9. 变更检查表

修改 IntentRouter 时必须同时检查：

- `TaskRequest` 是否仍然不含正文。
- 单文件、多文件、无文件是否有对应回归用例。
- `documentSelection` 与 `documentAccess` 是否保持独立。
- 显式 action 是否仍优先于自然语言。
- mention 路径是否在关键词匹配前移除。
- Agent/Skill/Tool 是否来自 Registry。
- TypeScript 与 Rust `TaskPlan` 合同是否同步。
- 低置信正文请求是否仍在 Tool 调用前澄清。
- 模型评测用例是否与确定性路由结果一致。

具体命令和验收记录格式见 [IntentRouter 测试与验收](INTENT_ROUTER_TEST_ACCEPTANCE.md)。
