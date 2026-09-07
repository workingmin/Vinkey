# Vinkey AI 业务链路架构与改造方案

- 状态：实施基线
- 日期：2026-09-04
- 适用范围：Vinkey 本地 AI 文学创作工作台
- 目标：以受控的 `Service/Tool + Workflow/Agent/Skill` 组合处理用户请求，并保持业务合同、Agent Runtime 与模型提供商相互独立。
- 相关文档：[开发框架与技术选型](DEVELOPMENT_FRAMEWORK.md)、[Agent 与 Skill 建设计划](AGENT_SKILL_PLAN.md)、[对话页设计](UI_DESIGN_CHAT.md)

## 1. 产品定位

Vinkey 不是通用 Agent 客户端，也不是某一家模型或 Agent SDK 的桌面封装。Vinkey 的核心产品能力是文学创作领域的业务链路：把用户请求转换为有边界的任务，选择确定性服务、模型调用、固定工作流或自适应 Agent，最后产生可核验、可审核、可恢复的业务结果。

```text
用户入口
  → IntentRouter / TaskPolicy
  → BusinessChainCatalog
  → ExecutionPlan
      ├─ Deterministic Service
      ├─ Direct Model Call
      ├─ Fixed Workflow
      └─ Adaptive Agent / Hybrid Agent Workflow
  → ToolGateway / SkillRegistry
  → Rust Services + Model Providers
  → Draft / Report / Proposal
  → Evidence Validation / User Approval / Commit
```

Codex、Claude 及其他 Agent 系统只作为 Runtime 能力、Tool 协议、Skill 组织和交互模型的参考对象，是否集成必须由 Vinkey 的具体业务链路需求决定。当前版本不把它们设计成用户可选择、启用或配置的 Adapter，也不引入任何额外需要用户配置的商用付费 API。业务链路不得依赖特定厂商的 thread、message、tool-call、凭据或文件格式。

## 2. 四类执行模式

### 2.1 确定性服务（Deterministic Service）

适用于输入、算法和副作用都能由本地代码明确控制的任务，例如目录统计、全文搜索、指纹、章节标题识别和证据位置校验。

- 不调用模型，不使用 Agent 规划。
- 由 Rust Service 执行并产生稳定结构化结果。
- 写操作仍经过 WorkspaceGuard、冲突检测和明确用户命令。

### 2.2 单次模型调用（Direct Model Call）

适用于短上下文、单一输出、无需动态工具选择的请求，例如普通聊天、短续写、标题候选和单段润色。

- Runtime 负责上下文预算、隐私策略、超时、取消和流式输出。
- 不因为使用了“Agent”命名或 system prompt 就把它视为 Agent 任务。
- 对结构化结果执行 schema 校验，但不引入无收益的自主循环。

### 2.3 固定工作流（Fixed Workflow）

适用于步骤已知但包含多个阶段的任务，例如长文本分块、Map/Reduce/Synthesis、证据校验和分析产物持久化。

- 步骤顺序由业务代码定义，模型只处理限定阶段。
- 每一步具有固定输入输出、重试策略和检查点。
- 不允许模型自行扩大文档范围、跳过证据校验或提交写操作。

### 2.4 自适应 Agent（Adaptive Agent）

适用于必须根据中间结果重新规划、动态选择 Tool 或请求用户确认的任务，例如跨章节连续性审校、人物消歧、Canon 导入提案和多文件改稿。

- Agent 只负责目标理解、计划调整、Skill 选择和结果综合。
- Agent 通过 ToolGateway 使用最小权限 Tool，不直接获得通用文件系统或网络权限。
- 所有结构化资产和文件变更只生成 Proposal；提交由 Vinkey Runtime 在用户确认后执行。

需要固定预处理或高吞吐模型阶段的复杂任务采用 Hybrid：确定性 Service 和 Fixed Workflow 负责数据处理，Agent 负责计划、局部复核、冲突处理和综合。

## 3. Agent 化判定规则

一个任务只有在以下条件中满足至少两项，并且自主决策能带来明确收益时，才进入 Agent 或 Hybrid：

1. 需要根据中间结果动态拆分或调整步骤。
2. 需要从多个 Tool/Skill 中选择下一步动作。
3. 跨多个文档、章节或结构化资产，目标集合不能在开始时完全确定。
4. 存在必须由用户确认的高影响副作用。
5. 需要暂停、恢复、重试、转向或人工介入。
6. 需要对冲突证据、不确定性或失败分支做显式处理。

以下情况不能作为 Agent 化理由：提示词较长、模型能力较强、任务名称包含“分析”，或者厂商 SDK 提供了 Agent API。

## 4. 当前业务链路盘点与目标形态

| 业务链路 | 当前实现 | 目标执行模式 | Agent 策略 | 主要改造 |
| --- | --- | --- | --- | --- |
| 文件数量、目录、类型概览 | 工作区画像直接格式化 | Deterministic | 禁止 | 保持正文零读取，补齐统一 ExecutionPlan |
| 文件读取、搜索、分块、指纹 | Rust/Tauri Service | Deterministic | 禁止 | 收口到 ToolGateway，补 schema 运行时校验 |
| 普通聊天、短续写、单段润色 | `stream_chat` | Direct Model | 禁止 | 增加任务/模型能力路由和结构化错误 |
| 选中文档问答、长续写与改写 | 长文本固定流水线 | Fixed Workflow → Hybrid | 改写推荐，问答可选 | 独立 `RevisionEditor`；保证路由 Tool allowlist 与实际执行一致，只产出草稿 |
| 确定性章节拆分 | 本地分段后直接生成同级文件 | Deterministic | 禁止 | 将“用户命令即授权”显式记录为提交原因，补冲突恢复 |
| 隐含场景识别、结构增强 | 长文本固定流水线 | Hybrid | 可选/推荐 | 本地粗分后让 Agent 只复核低置信边界并生成二次提案 |
| 文档/项目长文本分析 | Rust Worker 编排 Chunk/Map/Reduce/Synthesis/Evidence | Fixed Workflow | 可选 | 已有当前 Job 内步骤级重跑；继续补跨 Job 按文档增量复用，Agent 只参与计划与必要复核 |
| 跨章节连续性、设定冲突、伏笔检查 | 尚未形成独立链路 | Hybrid | 推荐 | 建立 ReviewPlan、证据检索、冲突聚类和 ReviewReport |
| 人物候选、消歧、关系语义校验 | 数据底座已实现，抽取审核未实现 | Hybrid | 推荐 | 确定性候选 → 模型局部校验 → Proposal → 人工确认 |
| Canon 导入与记忆更新 | 仅有项目记忆候选 | Adaptive Agent | 推荐 | 版本化 CanonProposal/MemoryProposal，不允许自动确认 |
| 多文件改稿和 DiffProposal | 编辑器选区单文件提案已实现；多文件未实现 | Adaptive Agent | 推荐 | 先计划影响范围，再生成逐文件 diff，逐块接受 |
| 大纲构建、场景规划、多阶段写作 | 尚未实现 | Adaptive Agent | 推荐 | 通过 OutlineDraft/SceneBrief/Draft 合同串联，不直接落盘 |
| 批量审校、暂停、恢复、失败重试 | 长文本链路部分具备 | Fixed/Hybrid | 可选 | 统一 Job/Step/Event、幂等键、限速和失败策略 |
| 外部研究与事实核查 | 尚未实现 | Adaptive Agent | 推荐 | 网络单独授权、来源白名单、引用和缓存失效 |

## 5. 目标运行时边界

### 5.1 供应商无关合同

```text
TaskRequest
  intent / scope / targets / userConstraints

ExecutionPlan
  executionMode / workflow / agentPolicy
  sourcePolicy / sideEffects / allowedTools
  requiredCapabilities / outputContract

TaskStep
  id / skill / inputs / status / attempt / idempotencyKey

TaskEvent
  taskId / stepId / type / timestamp / auditFields

TaskResult
  output / evidence / coverage / proposals / warnings
```

任何候选 Runtime 实现都只能实现上述合同。Codex thread、Claude session、模型 message 和 provider-specific tool use 必须在内部边界转换，不得进入作品、人物、记忆、分析任务等领域数据表。

### 5.2 ToolGateway

ToolGateway 是 Agent 与本地能力之间的唯一边界：

- 调用前校验 Tool 是否注册、是否属于 Skill 的 allowlist、输入是否符合 schema。
- 按 `sourcePolicy` 和工作区授权校验正文读取范围。
- 写操作仅接受已经确认的 Proposal ID 和未过期的源指纹。
- 返回结果执行输出 schema 校验，并只记录允许的审计字段。
- Runtime 实现不得绕过 ToolGateway 调用 Tauri command。

### 5.3 Runtime Adapter

```text
AgentRuntime
  plan(task, capabilities) -> ExecutionPlan
  start(plan) -> TaskHandle
  resume(taskId) -> TaskHandle
  steer(taskId, input) -> void
  cancel(taskId) -> void
  events(taskId) -> AsyncStream<TaskEvent>

Production runtime
  VinkeyNativeRuntime

Agent architecture references / internal prototypes
  Codex
  Claude
  Other agent systems
```

当前版本唯一的产品级 Runtime 是 `VinkeyNativeRuntime`。Codex、Claude 或其他 Agent 系统不形成用户可见的 Provider/Adapter 选项；内部原型也必须通过相同业务评测，不能因为提供现成 Agent Loop 就获得更宽权限。

### 5.4 当前版本依赖与认证硬边界

- Vinkey 不提供 Codex、Claude 或其他 Agent Runtime 的选择、启用、登录和凭据配置入口。
- 当前版本不得为了 Agent 能力新增 OpenAI、Anthropic 或其他商用平台的付费 API Key、API 额度或计费账户依赖；需要这类配置的集成方案直接判定为超出版本范围。
- Vinkey 启动、工作区管理、确定性 Service 和业务链路编排只依赖 `VinkeyNativeRuntime`，不得探测到某个 CLI 后静默切换执行器。
- Ollama 和用户已有的 OpenAI-compatible 模型配置属于 Vinkey 的 Model Provider 层，不代表用户选择了某个 Agent Runtime，也不得被内部原型转交给外部 CLI 或服务。
- Codex、Claude 等 Agent 能力体系作为架构参考或开发期内部原型。只有某条业务链路存在可量化缺口，并且候选实现不新增上述付费 API 配置、不削弱本地数据边界时，才进入集成评审。
- 即使未来通过评审，具体 Runtime 仍由业务链路内部调度，不向用户暴露 Codex/Claude Adapter 概念，且不能成为 Vinkey 基础功能的运行前提。

## 6. Codex、Claude 与 Vinkey Native Agent 参考取舍

### 6.1 比较口径

本章按 Agent 构建和运行的能力层级组织产品目录：

1. **交互产品层**：用户在哪里直接使用 Agent，例如终端、IDE、桌面端、Web 和云任务界面。
2. **Runtime 集成层**：应用如何嵌入或编程控制完整 Agent Loop，包括会话、工具、流式事件、审批、恢复和沙箱。
3. **通用模型 API 层**：应用基于模型 API 自行实现或委托 SDK 实现 Tool Loop；这层不等于 Codex 或 Claude Code 产品本身。
4. **扩展与治理层**：Skills、项目指令、MCP、Hooks、插件、子 Agent、权限、沙箱和可观测性。

因此，本章采用以下对齐关系：

- `Codex SDK` 与 `Claude Agent SDK` 都是编程控制完整 Agent Runtime 的高层 SDK，可直接比较。
- `Codex CLI / IDE extension / ChatGPT desktop app 中的 Codex / Codex cloud` 与 `Claude Code terminal / IDE / desktop / web` 都属于用户直接使用的 Agent 产品表面，可按交互位置、执行位置和审核体验比较。
- `codex exec / Codex GitHub Action` 与 Claude Code 的 headless CLI、GitHub Actions / GitLab CI/CD 都属于非交互自动化入口。
- `Codex app-server` 是富客户端控制协议。Claude 体系的相关能力分布在 Claude Agent SDK 的会话/流式控制 API，以及宿主与 Claude Code 子进程之间的 stdio 通道；两者的封装边界和宿主方式不同。
- OpenAI `Responses API / Agents SDK` 与 `Claude API / Anthropic SDK Tool Use / Tool Runner` 属于通用 Agent API 层；`Codex SDK / Claude Agent SDK` 属于 Agent Runtime 集成层。
- `Codex cloud` 与 `Claude Code on the web` 都提供第一方托管的后台任务体验。`Claude Managed Agents` 是面向开发者的托管 Agent Runtime API；OpenAI Agents SDK 的 Sandbox Agents 是 SDK 提供的容器化执行能力。

本章覆盖 Agent Runtime 相关产品，不展开 Codex Security、代码审查、浏览器控制等垂直业务功能，也不把模型版本本身当作 Agent 产品。

### 6.2 产品与能力全景

| 能力层 | Codex 体系 | Claude 体系 | 对齐结论 |
| --- | --- | --- | --- |
| 本地终端 Agent | Codex CLI：交互式读取、编辑、命令执行、审查、会话恢复 | Claude Code CLI：交互式代码 Agent、文件和命令 Tool、会话管理 | 同层产品，可比较本地 Agent Loop、权限和恢复体验 |
| IDE Agent | Codex IDE extension：编辑器上下文、内联 diff、本地执行与 cloud handoff | Claude Code VS Code / JetBrains：选择上下文、内联 diff、计划审阅 | 同层产品，可比较编辑器上下文和审核交互 |
| 桌面与 Web 表面 | ChatGPT desktop app 中的 Codex；浏览器中的 Codex cloud | Claude Code Desktop、Claude Code on the web 和移动端 | 同属用户表面，但支持范围、执行位置和账号体系不同；不据此推导可嵌入 Runtime |
| 云端后台任务 | Codex cloud：隔离环境、并行任务、环境配置、结果/diff 审阅 | Claude Code on the web：云端长任务和并行执行 | 产品体验可比较；均不适合作为 Vinkey 当前本地正文默认执行路径 |
| 远程控制 | Codex Remote：从移动端启动、引导、审批和审阅已连接计算机上的任务 | Claude Code Remote Control / mobile：远程继续和控制本地会话 | 同类交互能力，只借鉴 steer、interrupt、approval 状态模型 |
| 非交互自动化 | Codex CLI 的 `codex exec`、Codex GitHub Action，以及 Codex SDK 脚本 | Claude Code headless `-p` / JSON 输出、GitHub Actions、GitLab CI/CD | 同层自动化入口；Vinkey 不直接采用面向代码仓库的命令执行默认值 |
| 高层 Agent SDK | Codex SDK（TypeScript/Python）：启动、继续、恢复本地 Codex thread；Python SDK 控制本地 app-server | Claude Agent SDK（TypeScript/Python）：把 Claude Code Agent Loop、工具、上下文和会话能力作为库使用 | 最接近的一组直接对照；都携带面向通用/工程 Agent 的 Runtime 假设 |
| 富客户端控制协议 | Codex app-server：JSON-RPC、thread/turn/item、流式事件、审批、认证和会话历史 | Claude Agent SDK：会话、流式消息、审批和生命周期控制，由独立进程承载 | 封装形态不同，可共同参考会话控制和事件模型 |
| 通用模型响应 API | OpenAI Responses API：应用自行控制响应、Tool 调用、状态和分支 | Claude API + Anthropic SDK：应用自行处理消息和 Tool Use | 同层底层 API；需要产品自行实现 Agent Loop |
| 通用 Agent SDK / Tool Loop | OpenAI Agents SDK：Agent Loop、handoff、guardrail、session、tracing、approval | Anthropic SDK Tool Runner：自动 Tool Loop、类型和错误包装；复杂审批使用手动 Loop | 可比较 Loop 抽象，但成熟度和能力范围不同；Tool Runner 当前为 beta |
| 托管执行与 Runtime | Codex cloud 是 Codex 第一方托管执行产品；Agents SDK Sandbox Agents 是 SDK 的容器执行能力 | Claude Code on the web 是第一方托管体验；Claude Managed Agents 是开发者可调用的托管 Runtime API | 只有前两者可比较产品体验；Claude Managed Agents 无严格对等项，当前为 beta 且要求 Claude API Key |
| 身份、部署与计费边界 | Codex 产品体系与 OpenAI API 各有对应的登录、令牌或部署约束 | Claude 产品体系与 Claude API 各有对应的订阅或 API Key 约束 | 任何外部 Runtime 身份都属于厂商依赖，不能因本机已有登录状态或客户端就由 Vinkey 静默复用 |
| 项目指令与记忆 | `AGENTS.md`、Codex memories | `CLAUDE.md`、auto memory | 借鉴分层项目指令和可失效记忆；Vinkey 需绑定作品/工作区而非代码仓库 |
| Skills | Codex Skills：`SKILL.md`、脚本、引用和资产，按元数据渐进加载 | Claude Agent Skills：`SKILL.md`、脚本和资源，支持 Claude Code、Agent SDK、API/claude.ai 的不同形态 | 高度相似；Vinkey 可借鉴内容组织，但权限必须由 ToolGateway 强制执行 |
| Tool 与 MCP | Codex 内建 Tool、MCP、插件/Apps | Claude Code Tool、Agent SDK custom tools/MCP、Claude API Tool Use/MCP connector | 协议层可借鉴；Vinkey 只暴露领域 Tool，不开放任意 shell 或任意 MCP |
| 生命周期扩展 | Skills、plugins、Hooks、project guidance、subagents | Skills、plugins、Hooks、subagents、agent teams | 两者都支持生命周期扩展；Vinkey 应用类型化 Policy/Event 代替任意脚本 Hook |
| 权限与沙箱 | 本地 OS 沙箱、workspace/read-only/full-access、approval policy、网络策略；cloud 隔离容器 | permission modes、allow/deny rules、sandboxed Bash、Hooks；Agent SDK 可配置审批 | 都值得借鉴，但 Vinkey 权限粒度应落到文档、Canon、记忆和 Proposal，而非通用目录/shell |
| 状态、恢复和分支 | thread continue/resume/fork、cloud task、app-server events | session continue/resume/fork、外部 SessionStore、Managed Agents 持久 Session | 统一映射到 Vinkey `Task/Step/Event/Checkpoint`，不保存厂商原生对象作为领域数据 |
| 多 Agent | Codex subagents、Agents SDK handoff / agents-as-tools | Claude subagents、agent teams、Agent SDK subagents | 只在隔离上下文或并行验证有明确收益时采用，不把多 Agent 作为默认架构 |
| 可观测与评测 | app-server 事件、Agents SDK tracing、Codex 运行记录 | Agent SDK OpenTelemetry/成本跟踪、Managed Agents events | Vinkey 采用供应商无关事件、耗时、Tool 调用和业务质量指标 |

### 6.3 Codex 体系分析

#### 6.3.1 交互产品

- **Codex CLI** 是本地终端 Agent，也是 `codex exec` 非交互自动化入口。它面向代码仓库，可读写工作区、运行命令、恢复会话、调用 MCP，并由 sandbox/approval policy 控制行为。
- **Codex IDE extension** 将选区、打开文件、内联 diff 和任务委派放入编辑器。其价值主要在上下文选择与修改审核交互，不代表独立 Runtime。
- **ChatGPT desktop app 中的 Codex** 是桌面交互表面；它与 CLI、IDE extension 和 cloud 共同构成 Codex 的用户产品入口，但不是供 Vinkey 嵌入的 SDK 名称。
- **Codex cloud** 在隔离云环境中执行并行或后台任务，配置依赖、环境变量和网络后返回摘要与 diff。它是托管产品表面，不是本地 SDK。
- **Codex Remote** 是对已连接任务的远程启动、引导、审批和审阅表面，可作为 Vinkey 长任务跨设备状态设计的参考。
- **Codex GitHub Action** 和 `codex exec` 是自动化/CI 表面，前者由 GitHub 事件触发，后者提供脚本化非交互执行；二者均不同于应用内嵌 Agent SDK。

这些产品默认围绕软件工程、代码仓库、shell 和 Git diff 设计。Vinkey 可以借鉴任务状态与审核交互，不能直接继承其执行对象和权限模型。

#### 6.3.2 Runtime 与集成产品

- **Codex SDK** 是程序化控制本地 Codex Agent 的首选接口，TypeScript/Python 均支持 thread 的启动、继续和恢复；官方将脚本、CI、内部工具和应用集成列为适用场景。
- **Codex app-server** 是 Codex 富客户端使用的双向 JSON-RPC 接口，暴露认证、thread/turn/item、流式 Agent 事件、审批、steer、interrupt 和历史管理。官方明确区分：自动化/CI 优先使用 Codex SDK，构建完整自定义客户端才使用 app-server。
- SDK 和 app-server 不是两个平级 Agent 产品：SDK 是开发者 API，app-server 是 SDK/客户端可利用的底层控制面。Python Codex SDK 本身即通过本地 app-server 通信。
- app-server 的 stdio 是主要本地传输；WebSocket 仍标记为实验性且不支持生产。因此即使进行内部原型，也不能把其实验性网络传输作为 Vinkey 产品依赖。

#### 6.3.3 OpenAI 通用 Agent 平台

- **Responses API** 适合由应用自己控制模型响应、工具调用、状态和分支。
- **OpenAI Agents SDK** 在 Responses API 之上提供 Agent Loop、handoff、agents-as-tools、session、guardrail、tracing 和可恢复审批。
- **Sandbox Agents** 是 Agents SDK 面向文件、命令、依赖和快照任务提供的容器化执行模式，仍属于应用使用 SDK 构建 Agent 的能力，不应包装成与 Claude Managed Agents 对等的独立 OpenAI 产品。
- 这组能力与 Codex SDK 不同：前者用于构建任意领域 Agent，后者控制已经成型的 Codex 工程 Agent。对 Vinkey 的领域 Runtime 设计而言，通用 Agents SDK 的抽象层级更接近 `VinkeyNativeRuntime`，但当前版本的付费 API 边界仍排除直接依赖。

#### 6.3.4 扩展、安全与治理

- Codex 使用 `AGENTS.md`、memories、Skills、MCP、plugins、Hooks 和 subagents 组成定制层；Skills 按元数据、说明、引用/脚本渐进加载，Hooks 在生命周期节点运行脚本或 MCP Tool。
- 本地 Codex 通过 OS 沙箱、可写根目录、approval policy 和网络策略控制命令；Codex cloud 使用隔离容器并默认限制 Agent 阶段网络。
- Vinkey 可复用“渐进披露、显式审批、网络默认关闭、任务可恢复”的原则，但不能依赖指令文本提供安全性，也不开放通用 shell。

### 6.4 Claude 体系分析

#### 6.4.1 交互产品

- **Claude Code** 是完整的 Agentic Coding 产品，覆盖 terminal、VS Code/JetBrains、Desktop、Web 和 mobile。CLI 只是其中一个交互表面，不代表 Claude 的整个 Agent Runtime 产品体系。
- Claude Code 的交互产品支持本地文件/命令 Tool、内联 diff、并行或云端会话、MCP、Skills、Hooks、subagents 和权限模式。
- Claude Code on the web 与 Codex cloud 在“托管后台任务”体验上可以比较；Desktop/IDE/CLI 则更适合与 Codex 对应客户端比较。
- Claude Code headless、GitHub Actions 和 GitLab CI/CD 属于自动化入口，产品位置对应 `codex exec` 与 Codex GitHub Action，而不是 Codex SDK 或 app-server。

#### 6.4.2 Runtime 与集成产品

- **Claude Agent SDK** 把 Claude Code 使用的 Agent Loop、内建 Tool 和上下文管理作为 Python/TypeScript 库提供，支持 session continue/resume/fork、流式输入输出、审批、结构化输出、MCP、自定义 Tool、Skills、Hooks、subagents、checkpoint 和可观测性。
- Agent SDK 的宿主模型是应用拉起并监管 `claude` 子进程，通过 stdio 通信；每个运行中的 Agent Session 对应本地进程、工作目录和会话文件。它在产品层与 Codex SDK 最接近，而不是与 Codex app-server 一一对应。
- 对非 Python/TypeScript 集成，官方建议以 headless CLI 和 JSON 输出驱动相同 Agent Loop。这是兼容入口，不等于独立 SDK。
- 官方说明第三方产品通常应使用 API Key 认证，不能未经批准把 claude.ai 登录或订阅额度提供给第三方用户。因此 Claude Agent SDK 直接集成不符合 Vinkey 当前“不新增商用付费 API 配置”的版本边界。

#### 6.4.3 Claude API Tool 层与托管 Runtime

- **Claude Client SDK + Tool Use** 属于模型 API 层，应用自行执行 Tool 并维护循环。
- **Tool Runner** 是 Anthropic Client SDK 中的 beta helper，自动处理 Tool 调用、结果回传、会话状态、类型和错误；需要复杂人工审批或条件执行时仍应使用手动 Loop。它应与 OpenAI Responses/Agents SDK 的 Tool Loop 能力比较，而不是与 Codex app-server 比较。
- **Claude Managed Agents** 是独立的托管 Agent Runtime API，提供 Agent、Environment、Session、Event，支持 cloud/self-hosted sandbox、SSE、持久会话、steer/interrupt 和定时执行。该产品当前为 beta，要求 Claude API Key，并持久化服务端会话/沙箱状态，明确超出 Vinkey 当前版本边界。

#### 6.4.4 扩展、安全与治理

- Claude 使用 `CLAUDE.md`、Agent Skills、MCP、plugins、Hooks、subagents/agent teams 和 permission modes 组成定制层。
- Agent Skills 同样采用渐进披露，但在 Claude API 中依赖代码执行容器，在 Claude Code/Agent SDK 中依赖可读取和执行的文件系统环境。
- Hooks 可以在生命周期节点执行确定性代码，是重要参考，但 Vinkey 应优先将这类行为建模成类型化 `TaskPolicy`、`TaskEvent` 和受控 Tool，避免任意 Hook 脚本绕过 Rust 权限边界。

### 6.5 Vinkey 的采用与排除决策

| 能力 | 当前决策 | 原因 |
| --- | --- | --- |
| thread/session/turn/item 生命周期 | 借鉴并转换为 `Task/Step/Event` | 支持暂停、恢复、steer、interrupt 和审计，同时避免厂商对象进入领域数据 |
| Codex 与 Claude Code 的 CLI、IDE、desktop、web/cloud、Remote 产品表面 | 仅作交互参考 | 借鉴上下文选择、后台任务、进度、审批和结果审阅；不嵌入为 Vinkey 的用户产品入口 |
| `codex exec` / Codex GitHub Action；Claude Code headless / GitHub Actions / GitLab CI/CD | 仅作自动化参考 | 都以代码仓库和 CI 为默认场景，不是文学领域 Runtime，也不得通过探测本机 CLI 静默调用 |
| Codex SDK / Claude Agent SDK | 当前不集成 | 二者都携带工程 Agent、进程、shell、认证和厂商运行假设，引入成本超过当前业务收益 |
| 富客户端会话控制 | 仅作控制面参考 | Codex app-server 提供独立 JSON-RPC 控制面；Claude Agent SDK 通过应用 API 和 stdio 宿主机制提供相关能力。Vinkey 借鉴会话、流式事件、steer、interrupt 和 approval 模型 |
| OpenAI Responses API / Agents SDK；Claude API / Tool Runner / Managed Agents | 仅借鉴通用 Loop、handoff、guardrail、类型化 Tool 和托管状态模型 | 当前版本不新增商用付费 API 配置；Vinkey 需保持 Ollama/OpenAI-compatible Provider 可用，且不引入外部数据面 |
| Codex/Claude Skills | 借鉴目录、元数据和渐进披露 | Skill 可兼容类似组织方式，但权限、输入输出和副作用由 Vinkey Registry/ToolGateway 强制执行 |
| MCP / plugins | 暂不作为核心依赖 | 本地文学业务 Tool 优先；外部连接需单独的数据、网络和权限设计 |
| 通用 shell、文件编辑 Tool | 排除 | 与文学创作资产权限不匹配，扩大正文和文件系统风险面 |
| 云端/Managed Agent Runtime | 当前排除 | 引入付费 API、外部数据面、账号和托管状态，不符合本地工作台当前边界 |
| subagents / multi-agent | 延后验证 | 仅在上下文隔离、并行校验或角色分工带来可量化收益时采用 |
| sandbox、approval、checkpoint、tracing | 在 Native Runtime 内实现 | 属于 Vinkey 所有 Agent 链路共同需要的基础能力，不应依赖某个外部 Agent 产品 |

最终结论：Vinkey 当前不在 Codex 与 Claude 之间选择一个集成目标，而是从二者完整 Agent 能力体系中提取经过业务验证的 Runtime 模式。所有生产链路仍由 `VinkeyNativeRuntime + ToolGateway + SkillRegistry + Rust Services + Model Providers` 执行；任何外部产品只有在解决明确业务缺口、通过领域评测且不新增商用付费 API 配置时，才有资格进入内部集成评审。

### 6.6 官方资料

资料核对日期：2026-09-04。

- OpenAI 交互与自动化产品：[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[Codex IDE extension](https://learn.chatgpt.com/docs/codex/ide)、[ChatGPT desktop app](https://learn.chatgpt.com/docs/app)、[Codex cloud](https://learn.chatgpt.com/docs/cloud)、[Codex Remote](https://learn.chatgpt.com/docs/remote)、[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)、[Codex GitHub Action](https://learn.chatgpt.com/docs/github-action)。
- OpenAI Runtime 与治理：[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[Codex app-server](https://learn.chatgpt.com/docs/app-server)、[Customization](https://learn.chatgpt.com/docs/customization/overview)、[Hooks](https://learn.chatgpt.com/docs/hooks)、[Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)、[Agents SDK](https://developers.openai.com/api/docs/guides/agents)。
- Anthropic 交互与自动化产品：[Claude Code](https://code.claude.com/docs/en/overview)、[Platforms and integrations](https://code.claude.com/docs/en/platforms)、[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)、[Remote Control](https://code.claude.com/docs/en/remote-control)、[Headless mode](https://code.claude.com/docs/en/headless)、[GitHub Actions](https://code.claude.com/docs/en/github-actions)、[GitLab CI/CD](https://code.claude.com/docs/en/gitlab-ci-cd)。
- Anthropic Runtime 与治理：[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)、[Agent SDK hosting](https://code.claude.com/docs/en/agent-sdk/hosting)、[Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)、[Tool Runner](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner)、[Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)。

## 7. 分阶段改造路线

### 阶段 0：执行模式显式化

- [x] 在 `TaskPlan` 增加供应商无关的 `ExecutionStrategy`。
- [x] 明确 `deterministic`、`direct-model`、`workflow`、未来 `agent/hybrid` 的边界。
- [x] 日志记录 workflow 和 Agent 升级策略，但不记录正文。
- [x] 消除 UI 根据多个字段重复推断执行方式的逻辑。

验收：任一请求在模型调用前都能解释“为什么采用此执行方式”；确定性任务不会获得 `model-invoke`。

### 阶段 1：Runtime 合同和 ToolGateway

- [x] 首轮路由策略校验：在任务执行前检查 Skill 副作用、模型依赖、Tool 注册和 allowlist，以及 metadata-only 的正文 Tool 隔离。
- [x] Skill 声明允许的上下文作用域；路由对 conversation、selected-documents、workspace 执行 fail-closed 校验。
- [x] 选中文档改写从普通聊天分离为 `RevisionEditor` / `document-revision`，授权能力与长文本 Workflow 对齐。
- [x] 引入首轮 ToolGateway，在正文读取、模型调用、分块和分析产物读写前逐次检查 allowlist、来源策略和副作用。
- [x] 为所有已注册 Tool 补齐逐字段输入/输出合同，并在 ToolGateway 调用前后执行递归 JSON Schema 校验；覆盖对象、数组、必填字段、额外字段、类型、enum/const、长度/范围和组合合同。
- [x] Rust `JobService` 与会话 `taskRef` command 使用强类型反序列化和字段/状态校验，拒绝非法任务状态、目标与恢复身份。
- [x] 增加统一 Rust `execute_task(TaskRequest + TaskPlan)`；在任何 AI Tool 读取前完成 preflight，并在文档预算收敛后请求 final Dispatch。
- [x] 将 `execute_task` 扩展为版本化 Service Dispatcher，返回 Service、阶段、执行所有者、流式需求、后台化资格、Job ID 和澄清结果。
- [ ] 将同等合同校验扩展到其余 Rust command 边界，并对 Registry schema 增加启动时自检和版本迁移策略。
- [ ] 补齐 ToolGateway 的任务/步骤身份、审计字段过滤、超时和结构化错误。
- [x] 统一首轮 `TaskJob`、`TaskJobStep`、`TaskJobEvent`、检查点和恢复身份合同。
- [ ] 统一跨 Service 错误类型、超时和幂等键。
- [x] 保持现有模型 Provider 与 Agent Runtime 解耦。

验收：未注册 Tool、Skill 越权 Tool、schema 不合法结果和未确认写操作全部 fail closed。

### 阶段 2：固定工作流下沉

- [x] Rust `JobService` 持久化 Task/Step/Event/Checkpoint，提供 start/resume/update/get/list/cancel command，并校验任务、指令和源指纹身份。
- [x] 将确定性的文档复验、Chunk 调度、manifest 和 Worker 输出持久化下沉到 Rust；Worker 使用持久化输入快照并发布运行、暂停、继续、完成、失败和取消事件。
- [x] 将 Map/Reduce/Synthesis Worker 的模型调度从前端下沉到 Rust，并分离 Map Worker、分层 Reduce、Synthesis 和 Evidence Validation 阶段。
- [x] 持久化版本化模型兼容键、逐块/逐层检查点和带 sequence 的 Worker 事件；事件支持回放，最终完成以 Job 状态和原子输出为准。
- [x] 增加启动恢复协调器：只恢复上次授权工作区中的 `running` Job，`paused` Job 等待用户显式继续；版本、模型或源指纹不兼容时拒绝恢复。
- [x] 增加长文本任务协作式暂停/继续 UI；暂停在当前 Tool/模型步骤完成后的下一个阶段边界生效，并将 `paused/running` 事件写入 JobService。
- [x] 为暂态模型错误增加最多 3 次的自动重试和短退避；Step `attempt` 与 `step.retry_scheduled` 事件持久化，配置变化、权限错误、取消和输出上限不重试。
- [x] 将 final Service Dispatch 的稳定身份写入 Worker 快照和兼容键；启动前使用 10 分钟短期票据在 Rust 内复验 job/workspace、policy/dispatch、Service 和 owner，票据不落盘。
- [x] 为 Map/Reduce/Synthesis 建立版本化检查点依赖图；启动时校验产物哈希、来源指纹和上游依赖，并清理损坏、孤立或不再被有效清单引用的模型产物。
- [x] 提供失败 Job 的指定步骤人工重跑 command；按 `chunking/map/reduce-N/synthesis/evidence` 定向删除目标及依赖后代，并持久化重跑目标和删除清单。
- [x] 增加任务中心步骤选择/确认重跑、Worker 持久化结构化错误，以及不绑定 Job ID 的精确 Map Prompt 内容寻址缓存。
- [ ] 补齐操作系统级常驻执行、其余 Service 的统一结构化错误和更广泛的源文档增量计划。当前模型编排不依赖 WebView 页面状态，但应用进程退出会停止推理；下次启动从兼容检查点恢复。跨 Job 缓存仅复用相同版本、模型和实际 Prompt 的 Map 结果，不复用 Reduce/Synthesis，也不恢复源指纹已变化的原 Job。

验收：关闭窗口后可恢复；已完成 Map 不重复调用；模型切换不会复用不兼容缓存。

### 阶段 3：两个 Agent 试点

1. `ContinuityReviewer`：只读、跨章节、证据驱动，输出 `ReviewReport`。
2. `CanonIngestion`：输出 `CanonProposal`，必须人工确认，不直接写正式资产。

两个试点均以 `VinkeyNativeRuntime` 完成产品实现和验收。Codex/Claude 只用于设计对照、离线事件回放或不需要新增付费 API 配置的开发期原型，不作为试点完成条件。

当前进度：`ContinuityReviewer` 已完成独立意图、可选文档/工作区作用域、执行策略和证据优先的长文本报告提示；`RevisionEditor` 已支持最多 8 个文档的逐块 `DiffProposal`，本地锁定路径、范围、原文和 baseline，模型只能提供 `targetId + replacementText`，应用前再次检测冲突且不会自动保存。二者当前仍由 Fixed Workflow 执行，目标形态标记为 `hybrid-agent-workflow`，且审校报告和改写提案都不会自动进入项目记忆。正式 Agent Tool Loop、结构化 `ReviewReport`、Proposal 持久化/撤销和真实模型对照跑批尚未实施。

验收：比较任务完成率、证据准确率、Tool 误调用率、人工修正量、延迟、token、恢复成功率和隐私边界。

### 阶段 4：创作闭环

- `OutlineArchitect → ScenePlanner → DraftWriter → RevisionEditor`。
- 所有文件变更统一为 `DiffProposal`，保存源指纹和影响范围。
- 加入外部修改冲突检测、逐块确认和撤销。

### 阶段 5：Agent Harness 集成评审

只有业务链路评测证明 `VinkeyNativeRuntime` 存在明确缺口，候选 Agent Harness 明显改善结果，并且满足无需新增商用付费 API 配置、本地正文授权、可观测、版本固定和跨平台打包要求，才讨论内部集成。集成后仍不提供 Codex/Claude Adapter 选择项；不满足任一条件则停留在架构参考或开发实验。

### 阶段 6：下一阶段业务链路优化计划

本阶段先修正“路由声明与实际执行脱节”的基础问题，再优化不同任务的成本/质量分流，最后以两个低副作用 Agent 试点验证自适应编排收益。阶段目标不是让所有消息都进入 Agent Loop，而是让所有 AI 任务都经过同一份 `TaskRequest → TaskPolicy → ToolGateway` 合同，并且只在动态决策带来明确收益时升级。

#### 6.1 入口统一与级联路由（P0）

**目标**：把 `IntentRouter` 从 React 内的前置分类器提升为 Runtime Service；统一聊天、右键、选区、工具栏、项目页和命令面板的 AI 任务入口。

- 引入 `TaskIntake`，统一 `entryPoint`、`actionId`、`targets`、选区范围、会话引用和用户约束；显式入口直接携带结构化 intent，不再用固定中文提示词重新识别。
- 将自由文本路由拆为确定性规则、轻量分类和澄清三段；只有歧义输入才调用分类模型，低置信度不能自动进入深度读取、Agent Loop 或写操作。
- 用上一任务 ID 和不含正文的会话摘要支持“继续”“按刚才方案改”等续问，淘汰只用 `hasContextDocuments` 判断上下文的方式。
- 明确编辑器打开、手工编辑和显式保存不属于 AI 路由范围，避免无意义的路由延迟。

**验收**：所有 AI 入口都能生成同一 `TaskRequest`；显式入口不产生额外分类模型调用；低置信度只返回普通回答或一个澄清问题；路由日志能解释入口、目标、决策和成本预算。

#### 6.2 ToolGateway 与 Runtime 强制边界（P0）

**目标**：让 `allowedTools`、Skill 合同和来源策略在每次调用时真正生效，而不只是路由时的静态校验。

- 将 `read_document`、`chunk_document`、`stream_chat`、分析产物和 Proposal 操作收口到统一 `ToolGateway`；前端和 Agent 不得直接调用 Tauri command。
- 为 Tool/Skill 输入和输出接入运行时 JSON Schema 校验，拒绝未注册 Tool、Skill 越权、上下文作用域不符、`metadata-only` 读取正文和未经确认的写操作。
- 在 `TaskPlan` 中增加 `outputContract`、`clarificationPolicy`、`budgetPolicy`、源指纹和幂等键；每次 Tool 调用绑定 task/step 身份和审计字段。
- 统一错误分类、取消、超时和重试边界，确保模型失败不会触发隐式写入或静默扩大正文读取范围。

**验收**：绕过 UI 直接调用受保护 Tool 也会被拒绝；非法 schema、过期源指纹和未确认 Proposal 全部 fail closed；审计记录不包含正文、完整 Prompt 或 API Key。

#### 6.3 任务成本与质量分流（P0）

**目标**：修复短改稿被错误升级成长文本流水线，以及摘要被误用于重建正文的问题。

- 标题、灵感、无正文短写作继续走 Direct Model；选区级润色/压缩/扩写走“原文选区 + `DiffProposal`”的单次或有界 Revision Workflow。
- 单场景/单章在预算内时，直接读取目标原文、必要 canon 和相邻场景；只有多章、多文件或超预算任务才进入 Chunk/Map/Reduce。
- 长文问答、总结、人物线和伏笔分析继续使用固定 Workflow，结果必须带覆盖范围、源指纹、分块数和可验证证据。
- 多文件改稿先做影响范围定位，再按原文片段生成逐文件 diff；Map/Reduce 摘要只用于规划和发现，不作为最终正文的唯一输入。
- 建立模型能力注册表和任务预算：记录首 token 延迟、tokens/s、总耗时、token 消耗、结构化输出成功率、证据召回率、改写忠实度和人工修正量。

**验收**：同一测试集对比 Direct/Bounded/LongText 三条链路，短改稿 p95 延迟和 token 消耗显著低于长文链路；分析任务的证据准确率、覆盖率和改写任务的源文忠实度分别达到预设阈值；任何模式升级都有用户可见原因或新的用户请求。

#### 6.4 JobService 与两个 Agent 试点（P1）

**目标**：把长文本编排从 React 下沉为可恢复任务，再验证 Agent 在动态决策场景的真实收益。

- Rust `JobService` 管理 `Task/Step/Event/Checkpoint`，支持窗口关闭后的恢复、步骤级重试、暂停、取消、幂等和按源指纹增量失效。
- 先落地只读 `ContinuityReviewer`：确定性检索候选冲突，Agent 负责选择证据窗口、处理冲突分支和综合 `ReviewReport`。
- 再落地 `CanonIngestion`：确定性实体/提及候选 → 模型局部消歧 → `CanonProposal` → 用户确认；禁止直接写入正式 canon。
- 试点期间保留 Fixed Workflow 作为回退路径；Agent 只在满足至少两个 Agent 化条件且预计有收益时启用。

**验收**：与固定流水线 A/B 对比任务完成率、证据准确率、Tool 误调用率、人工修正量、延迟、token、恢复成功率和隐私违规数；若 Agent 未达到收益门槛，保留固定链路，不扩大 Agent 范围。

#### 6.5 依赖与交付顺序

```text
TaskIntake / IntentRouter
  → TaskPolicy / ToolGateway / Schema
  → JobService / Task-Step-Event
  → 短改稿分流与 DiffProposal
  → ContinuityReviewer / CanonIngestion 试点
  → Outline / Scene / Draft 多阶段创作
```

本阶段暂不推进外部研究、托管 Agent 或 Codex/Claude Harness 集成；这些工作必须等待本地 Runtime、权限边界和评测数据稳定后再进入阶段 5 的集成评审。

#### 6.6 2026-09-07 实施状态

- 已完成 `TaskRequest` / `TaskIntake` 前端合同，聊天和现有 AI 快捷入口统一进入 `routeTask`；显式 `actionId` 或 intent 优先于提示词规则，目标 ID 会去空、去重。
- 已在 SQLite 消息中持久化不含正文的 `taskRef`；“继续”“接着”“按刚才”“沿用”等续问可以继承上一安全的读取/草稿意图与文档目标，不继承 Proposal 副作用，也不恢复历史选区正文。
- 已完成文档加载后的策略二次收敛：最多 8 个文档且原文约 12,000 tokens 内的修改走 `bounded + direct-model`，携带有界、来源标记的原文；更大任务保留可恢复长文本 Workflow。
- 已建立首轮 `ToolGateway`，工作区正文读取、直接模型调用和长文本流程中的分块、模型、分析产物读写均执行逐次授权；所有已注册 Tool 具备逐字段输入/输出 schema，调用前后均 fail closed 校验。
- 已实现 Rust `JobService` 控制面及文件持久化；文档复验、Chunk、Map、分层 Reduce、Synthesis、Evidence 校验与最终输出均由 Rust Worker 编排，并在完成、失败和取消时同步任务状态。
- 已实现编辑器选区 `DiffProposal`：路径、范围、原文和源指纹由本地锁定，模型只返回替换文本；用户可查看、接受或拒绝，接受仅更新编辑器且仍需显式保存。
- 已实现 Rust `execute_task` 策略控制：Rust 独立复验 intent/Agent/Skill、Tool allowlist、作用域、副作用、正文策略和 ExecutionStrategy；前端在读取 Tool 前和最终执行前分别请求 Dispatch。
- 已实现长文本任务协作式暂停/继续；运行中的单次模型调用不会被暂停破坏，状态会在下一步骤边界进入 `paused`，继续后恢复 `running`；取消可以中止模型响应流。
- 已补充入口、短/长改稿分流、Tool 输入/输出拒绝、续问继承、选区冲突、Rust Dispatch/澄清、JobService、Reduce 收敛、事件回放、恢复候选、授权票据、重试分类和检查点依赖失效测试。任务中心重跑、精确 Map Prompt 跨 Job 缓存、多文件逐块 DiffProposal 和模型能力离线回归框架也已落地。
- 已将 Rust `execute_task` 扩展为 Service Dispatcher：两阶段请求得到版本化 Dispatch，包含具体 Service、执行所有者、流式需求、后台化资格、稳定 Job ID 和澄清结果。桌面长文本任务返回 `executionOwner=rust-worker`、`frontendStreamingRequired=false`；其他 Service 仍由 WebView 承载。
- 已完成第一层低置信度门禁：隐式且低置信度的正文读取在 preflight 返回一个最小澄清问题，并在任何正文 Tool、工作区扫描或模型调用前停止；显式 action、安全续问和恢复 Job 不增加分类模型调用。
- 已完成版本化 Worker 输入快照、Rust 全 Pipeline、持久化事件回放和启动恢复协调器。Worker/Prompt/Output/Chunk 版本、Provider、URL、模型、上下文与预算共同组成兼容键；变化时拒绝缓存，API Key 不进入快照。
- Worker command 属于内部 Service 边界：只允许读取当前工作区相对路径，重读后复验源指纹，不向 Agent 暴露任意文件或模型能力；它只接受固定 `local-chunks` 来源策略和回环 Provider。final Dispatch 会签发短期内存票据，Worker 启动时复验稳定身份；票据不进入快照、日志或产物。
- `worker-events.json` 保留最近 1,000 条带 sequence 的事件。前端先订阅再回放并去重；实时事件不是完成依据。启动时只自动恢复 `running` Job，`paused` 保持暂停；应用进程停止期间不执行模型，下次启动从 Map/Reduce 检查点继续。
- 暂态模型失败在当前 Map/Reduce/Synthesis Step 内最多自动尝试 3 次，并持久化 attempt、退避时长和截断后的错误；非暂态错误立即失败，等待用户修正或显式恢复。
- `worker-checkpoints.json` 已记录 Map 来源指纹、各级 Reduce/Synthesis 的产物依赖和内容哈希。损坏或孤立节点会连同依赖后代被清理；失败 Job 可通过 Rust command 指定 `chunking/map/reduce-N/synthesis/evidence` 重跑，并在恢复前复验工作区、协议版本、模型配置和兼容键。
- Worker 失败已持久化稳定错误码、类别、可重试性和失败步骤，并兼容历史字符串错误；任务中心支持选择失败步骤、确认重跑、查看 attempt/checkpoint 和结果指标。该错误合同目前只覆盖 Worker 持久化边界。
- Map 已使用工作区级内容寻址缓存：键绑定 Worker/Prompt/Output/Chunk 版本、完整模型兼容配置和实际 Prompt hash，不绑定 Job ID。相同 Prompt 可跨 Job 命中，损坏或不兼容项会失效；Reduce/Synthesis 不跨 Job 复用，源文档变化仍会拒绝恢复旧 Job。
- 模型能力评测已有版本化用例、完整性校验、延迟/吞吐/结构化输出/证据召回/改写忠实度评分、基线回归判定和执行模式资格导出。它目前不自动调用真实模型，也未持久化到能力注册表。
- 多文件逐块 `DiffProposal` 已支持最多 8 个文档、逐块审核、任意审核顺序及用户编辑冲突检测；接受结果只进入编辑器，不自动保存。持久化审核记录和撤销仍待实现。

## 8. 当前优先级

| 优先级 | 工作项 | 原因 |
| --- | --- | --- |
| P0 | 全 Service 结构化错误与常驻任务 | Worker 错误码和任务中心重跑已完成；下一步统一其余 Rust command、超时/幂等语义和操作系统级常驻执行 |
| P0 | 跨 Job 增量计划与缓存观测 | 精确 Map Prompt 内容寻址缓存已完成；下一步显式规划变化/未变化来源并呈现命中原因，Reduce/Synthesis 保持任务隔离 |
| P0 | 歧义分类回归集与可选轻量分类模型 | 确定性低置信度门禁和最小澄清已完成，需用数据控制漏判与打断率 |
| P0 | 真实模型跑批与能力注册表 | 离线评分和回归门禁已完成；下一步调用 Provider、持久化结果并用实测数据校准分流阈值 |
| P1 | ContinuityReviewer 只读试点 | 高用户价值、低副作用，适合验证 Agent 动态决策收益 |
| P1 | Canon/人物关系 Proposal 链路 | 已有 SQLite 图底座，可形成候选、证据、确认闭环 |
| P1 | DiffProposal 审核持久化与撤销 | 多文件逐块生成、冲突检查和审核已完成；下一步补跨会话恢复、撤销和审计记录 |
| P2 | Outline/Scene/Draft 多阶段创作 | 依赖 Proposal、记忆、任务恢复和模型能力路由 |
| P2 | Codex/Claude Agent Harness 内部原型 | 仅验证具体业务缺口；无需新增付费 API 配置，不形成用户选项 |
| P2 | [轻量级外部研究与联网 Skill](LIGHTWEIGHT_WEB_RESEARCH.md) | 下一版本候选；先验证可信来源、事实收益、隐私和来源治理成本 |

## 9. 全局不变量

1. 未配置模型时，文件编辑、搜索、确定性分析和历史会话仍可用；Vinkey 不要求配置外部 Agent。
2. 正文读取范围由 Vinkey 的 `sourcePolicy` 决定，任何 Runtime 实现不得自行升级。
3. Skill 是业务知识和流程合同，不是权限边界；权限由 ToolGateway 和 Rust Service 强制执行。
4. 模型输出只能成为 Draft、Report 或 Proposal，不能直接成为已确认 Canon、记忆或文件提交。
5. 原始正文、完整 Prompt 和 API Key 不进入运行日志；当前版本不新增外部 Agent 凭据。
6. 每个结论、修改和结构化资产尽可能携带来源、覆盖范围、模型/Skill/schema 版本。
7. Runtime 可替换，业务任务、资产状态和用户审核记录不可随 Runtime 更换而失效。
