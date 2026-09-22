# 开源项目竞品分析报告

- 观察日期：2026-09-22
- 观察范围：公开仓库、公开文档和可观察的产品交互；不以代码复制为目的。
- 许可证原则：GPL/AGPL 项目只参考行为和公开架构，具体实现、资源和提示词仍需独立开发与许可证审查。
- 筛选口径：[竞品筛选方法论](SELECTION_METHODOLOGY.md)；正式名单：[正式竞品名录](COMPETITOR_CATALOG.md)。

本报告的正式开源竞品必须同时出现在[正式竞品名录](COMPETITOR_CATALOG.md)中。`SoloMD` 当前保留为设计来源/观察对象，尚未满足本轮市场认可充分条件；`Obsidian` 和 `Typora` 是非开源的本地工作台，只作为边界参考，不改变本报告的开源筛选口径。

## 1. 项目地图

| 规范名称 | 主要价值 | 对 Vinkey 的相关度 | 当前结论 |
| --- | --- | --- | --- |
| [NoteGen](https://github.com/codexu/note-gen) | Tauri、本地 Markdown、AI 对话和知识内容 | 高 | 已参考本地优先、内容/会话/模型分层；不复制 GPL 代码 |
| [SoloMD](https://github.com/zhitongblog/solomd) | Tauri、本地 Markdown、BYOK、本地模型 | 高 | 设计来源/观察对象；已参考提供商配置、模型探测和密钥边界，但暂不列为正式竞品 |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | 多提供商、多模型 AI 工作台 | 中高 | 已参考连接测试和当前模型分离；不引入其多模型复杂度 |
| [MarkText](https://github.com/marktext/marktext) | 跨平台 Markdown 编辑器 | 高 | 已参考编辑、预览、保存和文件状态；外部变更仍待补齐 |
| [Obsidian](https://obsidian.md/) | 非开源本地知识库、链接和插件工作区 | 中高 | 非开源边界参考；已参考工作区和文档导航，不采用插件市场/知识图谱作为首版主流程 |
| [Typora](https://typora.io/) | 非开源本地 Markdown 编辑器 | 中 | 非开源边界参考；观察沉浸式编辑和快捷键，不替代多文档/AI 工作区 |
| [Aider](https://github.com/Aider-AI/aider) | 代码库地图、有限上下文、可审改工作流 | 高 | 已参考 repo map 和 token 预算思想；领域对象改为文学文档和 Proposal |
| [Continue](https://github.com/continuedev/continue) | 检索、模型、上下文 Provider 可组合 | 中高 | 已参考有界检索和无结果降级；不引入 IDE 插件作为入口 |
| [Cline](https://github.com/cline/cline) | Tool/子 Agent/审批驱动的 Agent | 中 | 观察广域探索升级条件；不开放 shell 和任意写权限 |
| [OpenCode](https://github.com/anomalyco/opencode) | 开源终端编码 Agent | 高 | 已参考多模型 Agent CLI、会话和终端工作流；不把代码工具直接暴露给文学正文 |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 开源 Agent 平台和开发环境 | 中高 | 已参考任务、沙箱、后台执行和恢复；不引入其代码开发默认边界 |

### 多 Agent CLI 集成与代理工作台

这类项目是上一版遗漏的正式生态参考。它们不是单一模型产品，而是把多个 Agent CLI、会话、项目、远程控制或模型连接放在同一个控制面中。

| 规范名称 | 类型 | 主要观察点 | Vinkey 取舍 |
| --- | --- | --- | --- |
| [CloudCLI](https://github.com/siteboon/claudecodeui)（仓库名 `claudecodeui`，原 Claude Code UI） | 多 Agent CLI Web/移动工作台 | 统一管理 Claude Code、OpenCode、Cursor CLI、Codex 的项目与会话；适合观察远程控制和多 CLI 适配 | 正式生态参考；借鉴统一会话、任务状态和适配层，不复制 AGPL 实现 |
| [Opcode](https://github.com/winfunc/opcode) | Claude Code GUI/Toolkit | 自定义 Agent、交互会话、安全后台 Agent 和桌面控制 | 正式生态参考；属于单 CLI GUI，不与 CloudCLI 混为多 CLI 聚合器 |
| [Claude Code Router](https://github.com/musistudio/claude-code-router) | 模型路由控制平面 | 在多个 Provider/模型间路由 Claude Code 请求 | 正式生态参考；借鉴 Provider 抽象和本地控制面，不采用其认证假设 |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | API 兼容代理 | 将多个模型/CLI 服务包装成 OpenAI/Gemini/Claude/Codex 兼容接口 | 正式生态参考但安全风险高；只研究协议隔离，不复用第三方账号凭据 |

## 2. 重点功能分析

### 2.1 本地工作区与内容主权

**观察。** NoteGen、SoloMD、MarkText、Obsidian 等产品都把本地文件或本地库作为核心对象，用户可以理解内容在哪里，编辑器也围绕当前工作区组织导航。这个模式比“上传文件后等待云端处理”更符合 Vinkey 的创作隐私定位。

**Vinkey 已参考。**

- 以授权工作区、项目和文档作为一级业务对象。
- 读写只经过 Rust 工作区路径守卫，前端不能自行访问任意路径。
- 会话和任务记录放入应用数据目录，文稿仍由用户目录掌控。
- 工作区画像先使用元数据，正文读取由任务策略授权。

**有意不同。** Vinkey 的工作区不是通用知识库。它还要绑定模型连接、会话、分析任务、canon 和项目记忆，因此不会把插件、双向链接或全库索引默认放进核心流程。

**待参考。** 外部文件监听、冲突对比、恢复加载和可解释的“当前项目上下文”提示。验收条件是：编辑器有未保存内容时，外部变化不会静默覆盖；用户能看到差异、选择重新加载或另存为。

### 2.2 提供商、模型与密钥

**观察。** SoloMD 和 Cherry Studio 将服务商连接、模型列表、当前模型和连接测试拆开；这降低了“配置成功但实际调用失败”的误解。

**Vinkey 已参考。**

- Ollama 与 OpenAI-compatible Provider 并列。
- 连接测试和模型发现是设置页的一等状态。
- API Key 只进入系统凭据存储，不进入 SQLite、前端持久化和运行日志。
- 活动模型选择不修改提供商配置。

**不采用。** 首版不追求大量内置云厂商、模型路由市场或跨供应商自动切换。模型切换必须能解释上下文窗口、隐私策略和失败原因。

### 2.3 上下文检索与预算

**观察。** Aider repository map、Continue retrieval、Copilot repository indexing 和 Cursor codebase search 的共同点，是先用结构/索引定位，再读取少量相关正文；上下文预算是执行约束，不是回答后的补救。

**Vinkey 已参考。**

- `overview / focused / deep` 描述证据深度，`index-only / targeted / exhaustive` 描述覆盖范围。
- 概览不含正文；聚焦读取少量高信号摘录；深度分析由本地 Worker 分块处理。
- 主对话消费摘要、引用和覆盖收据，不接收全量原始块。
- 任务恢复检查源指纹、算法版本和输入快照。

**文学领域调整。** 代码符号和引用关系不能直接替代章节、场景、人物状态和伏笔证据。Vinkey 的索引必须保留段落/章节边界、行号、文档版本和证据窗口。

**待参考。** 在不引入向量数据库的前提下，评估标题、实体、别名、章节结构和用户确认记忆的混合检索；指标为关键证据召回率、发送正文 token 数和人工纠错时间。

### 2.4 AI 修改与审阅

**观察。** Aider、Cursor 等成熟产品都把 AI 修改与原文编辑区分开；Knote 作为设计来源也提供了类似启发，但尚未满足正式竞品的市场认可门槛。

**Vinkey 已参考。**

- 修改结果是 `DiffProposal`，不是自动保存。
- 每个目标包含路径、范围、原文指纹和 replacement text。
- 支持逐块接受/拒绝；接受后仍只进入编辑器未保存状态。
- 原文变化、目标重叠、路径越界或 schema 错误时 fail closed。

**待参考。** 记录已接受/拒绝的提案、撤销整批接受、比较多轮提案，以及给每个变更关联任务和模型版本。验收重点是可恢复和可解释，而不是减少一次点击。

### 2.5 人物、关系与创作资产

**观察。** StorySphere、graphify-novel 等设计来源通常采用“候选抽取→规范化→关系/事件→图分析”的分阶段流水线；Novelcrafter Codex 则强调人物/地点/lore 卡片、别名和正文 mentions。

**Vinkey 已参考。**

- 将候选、证据、确认事实、图谱查询分成不同状态。
- 采用 SQLite 规范化数据和内存图查询，保留来源文档、段落/章节和源指纹。
- 低置信或冲突项进入 Proposal，不自动污染 canon 或长期记忆。

**不采用。** “同场出现”不能直接写成关系；模型一次抽取也不能直接成为事实。Neo4j、复杂向量图和全自动知识库写回暂不作为首版依赖。

### 2.6 Agent 与子 Agent

**观察。** Cline、Continue、Aider 等项目说明了上下文工具、审批和广域探索的价值，但也显示任意 shell/文件写入会显著扩大权限和验证成本。

**Vinkey 已参考。**

- 用业务 Skill 和 ToolGateway 取代通用 shell。
- 只有任务需要根据中间结果重新规划时才使用 Hybrid Agent。
- 广域探索可由 Worker/固定 Workflow 先承担；子 Agent 需要独立上下文、预算、来源和失败收据。

**不采用。** 不因竞品展示了更多 Tool 调用就把所有请求升级为 Agent；不把隐藏推理、完整 Prompt 或正文写进日志。

## 3. 开源项目带来的待办

| 待办 | 触发来源 | 进入条件 | 当前归属 |
| --- | --- | --- | --- |
| 外部文件变化和冲突处理 | MarkText、Obsidian、桌面编辑器 | 有监听、差异预览、重新加载/另存为测试 | 编辑器底座 |
| 混合项目检索 | Aider、Continue、Copilot | 与显式文件选择相比召回提升且不扩大隐私范围 | Context/Workspace Intelligence |
| 人物资产增量更新 | StorySphere、graphify-novel（设计来源）、Novelcrafter | 真实长篇样本中局部失效可解释 | Canon/Memory |
| 可审阅的资产图和时间线 | Novelcrafter、图分析项目 | Artifact 只读、证据可定位、导出可复现 | Artifact |
| 子 Agent 隔离探索 | Cline | 单一 Workflow 无法满足的广域任务，并有质量对照 | Agent Runtime |
| 多 CLI 会话控制面 | CloudCLI、Opcode | 多 CLI 会话/项目状态能与 Vinkey TaskJob 清晰映射 | Agent Runtime |
| Provider 路由和兼容层 | Claude Code Router、CLIProxyAPI | 无凭据越界、可追踪路由和失败隔离 | Model Provider |

## 4. 来源与补充阅读

- [GitHub 同类项目调研](../research/GITHUB_REFERENCE.md)
- [轻量级联网搜索设计](../research/LIGHTWEIGHT_WEB_RESEARCH.md)
- [Agent 流程模板对比](../design/agent/AGENT_FLOW_COMPARISON.md)
- [Agent 与 Skill 建设计划](../design/agent/AGENT_SKILL_PLAN.md)
