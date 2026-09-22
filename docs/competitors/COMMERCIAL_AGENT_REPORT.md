# 商业与 Agent 产品分析报告

- 观察日期：2026-09-22
- 目标：分析可观察的任务编排、上下文、审批、长任务和创作交互，不把商业产品 SDK 作为 Vinkey 的默认依赖。
- 适用边界：功能、流程和结果形态可借鉴；账号、计费、云端数据面和厂商认证必须单独评估。
- 名称口径：[竞品术语规范](TERMINOLOGY.md)；正式名单：[正式竞品名录](COMPETITOR_CATALOG.md)。

## 1. 产品分组

| 产品/体系 | 主要观察对象 | 与 Vinkey 的关系 | 当前结论 |
| --- | --- | --- | --- |
| [OpenAI Codex](https://learn.chatgpt.com/docs/overview) | 任务目标、审批、后台执行、事件、diff 和恢复 | Agent Runtime 交互参考 | 已参考流程合同；不作为用户可选 Runtime 集成 |
| [Claude Code](https://code.claude.com/docs/en/overview) | Tool Loop、权限模式、Artifacts、Skills、子 Agent | Agent Runtime 交互参考 | 已参考权限、Artifact、会话控制；不复用其账号/SDK |
| [Cursor](https://cursor.com/) | 代码库检索、Agent/Ask、编辑器上下文和 diff | 上下文与改稿参考 | 已参考相关性检索和修改审阅；文学对象需重新建模 |
| [GitHub Copilot](https://github.com/features/copilot) | Repository indexing、Ask/Research、代码上下文 | 检索和深度分层参考 | 已参考索引优先；不采用云端仓库默认授权 |
| [Novelcrafter](https://www.novelcrafter.com/features) | Codex、人物/地点/lore、写作协作 | 文学领域产品参考 | 已参考资产卡、别名和受控上下文；正式 canon 仍需用户确认 |
| [Sudowrite](https://www.sudowrite.com/) | Story Bible、创意生成、续写和编辑协作 | 文学创作体验参考 | 观察创作流畅度；不让模型绕过证据写入事实 |
| Claude 产品的 Research 能力 / [ChatGPT Deep Research](https://help.openai.com/en/articles/10500283-deep-research) | 搜索规划、来源、长时间研究结果 | 联网研究参考 | `待参考`；先完成授权、来源和隐私设计 |
| 豆包等长文助手样本 | 附件、耗时入口、文档式长结果和可视化 | 结果展示参考 | 已参考结果排版；不把过程展示当作质量证明 |
| Notion/Google Docs | 云文档、协作、评论和分享 | 桌面编辑器边界参考 | 当前不采用云协作，避免改变本地优先威胁模型 |

## 2. Agent Runtime 共同模式

### 2.1 目标、约束和完成定义

OpenAI Codex 的长任务说明、Claude Code 的计划/权限/工具循环和其他 Agent 产品的任务入口有一个共同点：复杂任务需要可观察的目标和完成条件。只显示“正在思考”不能让用户判断是否完成。

**Vinkey 已参考：**

- 长任务信封包含 `outcome`、`constraints`、`definition_of_done`、输入目标、预算和输出合同。
- 任务拆成可恢复的 Step，并记录可验证的 TaskEvent。
- “执行完成”与“用户接受结果”分开；Proposal、canon 和记忆都有独立审批。
- 过程默认折叠，用户能看到当前工序、耗时、覆盖和失败原因，但看不到隐藏思维链。

**Vinkey 有意不同：**

- OpenAI Codex/Claude Code 的默认对象是代码仓库和 shell 工具；Vinkey 的权限对象是文档正文、分析范围、DiffProposal、canon、记忆和联网范围。
- Vinkey 不允许 Agent 通过自然语言把普通草稿升级为写入或网络权限。
- 业务结果必须附带来源、覆盖收据和源指纹，不能只返回“任务成功”。

### 2.2 上下文与按需升级

Cursor、Copilot、Claude Code 等产品都把“相关上下文”作为能力，而不是默认把整个项目塞入模型。Research/Explore 类入口通常允许更高成本换取更广覆盖。

**Vinkey 已参考：**

- 项目锚定、结构索引、相关性取证、有限正文读取、摘要回传。
- `overview / focused / deep` 三种内部分析模式与 coverage 独立建模。
- 普通聊天、聚焦分析、深度分析使用不同预算和隐私策略。

**待参考：**

- 对“快速问答”和“深度研究”提供清楚的结果形态和预计成本提示，而不是要求用户理解 Runtime 模式。
- 把用户确认的项目记忆、人物卡和章节结构作为高信号证据，减少重复读取正文。
- 评估是否需要可见的“扩大范围”按钮；扩大范围必须重新计算权限和预算。

### 2.3 工具、审批和安全

OpenAI Codex 的 sandbox/approval policy、Claude Code 的 permission mode、Skills/MCP/Hook 组合，证明工具能力必须有宿主控制面。工具越通用，越难解释业务副作用。

**Vinkey 已参考：**

- `TaskPolicy` 在模型调用前确定 scope、coverage、source policy、副作用、预算和 allowlist。
- `ToolGateway` 和 `WorkspaceGuard` 位于模型与文件系统之间。
- 网络、正文发送、Proposal、canon/记忆提交和正式文件写入分层审批。
- 运行日志只记录可验证事件、计数和错误类别，不保存正文、密钥和完整 Prompt。

**不采用：** 不开放任意 shell、任意 MCP Server、插件脚本或模型生成 HTML 作为 Vinkey 首版能力。需要外部工具时，先定义领域 Tool 的输入 schema、数据面、失败模式和撤销方式。

### 2.4 Artifact、diff 和最终结果

Claude Code 的 Artifact、OpenAI Codex 的 diff/任务结果、豆包长文助手的文档式输出都说明：复杂结果不应挤在聊天气泡中，也不应把中间过程伪装成最终答案。

**Vinkey 已参考：**

- `Answer` 用于短答；`Report` 用于有来源的分析；`Artifact` 用于关系图、时间线和导出物；`DiffProposal`/`CanonProposal`/`MemoryProposal` 用于待审核变更。
- 过程活动折叠为任务入口，结果页面突出结论、证据、覆盖和待处理项。
- 关系图和可视化优先作为只读、可复现 Artifact，不直接执行模型生成的脚本。

**待参考：** Artifact 的版本、过滤、导出和“回到来源位置”交互。最低验收是：用户能从一个结论跳到证据，能看到产物生成时的源指纹，并能在源变化后识别过期。

### 2.5 长任务、暂停和恢复

Codex cloud/Remote、Claude Code on the web/Remote 和长文助手产品把后台任务、耗时入口和恢复作为独立体验。对 Vinkey 来说，恢复的关键不是继续生成，而是确认输入仍然有效。

**Vinkey 已参考：**

- `TaskJob` 持久化任务、步骤、事件、源指纹、模型快照和失败信息。
- 长文本分析使用 Chunk/Map/Reduce/Synthesis/Evidence 检查点。
- 暂停、取消、失败和恢复是不同状态；源文件、模板、模型或策略变化时拒绝沿用旧检查点。

**待参考：** 跨页面任务中心、重启后的恢复提示、失败项局部重试和“查看本次输入快照”。恢复体验的验收应包括：应用重启、模型不可用、源文件修改和部分块失败四类场景。

## 3. 文学创作产品的专项取舍

### 3.1 Novelcrafter：资产卡与受控上下文

**参考点：** 人物、地点、lore 等资产独立于正文，支持别名、正文 mentions 和选择是否让 AI 使用这些资料。这种模型有利于把“作者确认的设定”和“模型临时猜测”分开。

**Vinkey 采用：** canon 实体、别名、证据、状态和来源版本分离；场景写作可以选择性读取已确认资产。

**Vinkey 不直接复制：** 不把第三方产品的字段和交互当作固定标准；Vinkey 还要处理审校疑点、冲突分桶、提案确认和本地增量失效。

### 3.2 Sudowrite：创作流畅度与事实边界

**参考点：** 创意生成、人物/大纲协作、续写和改写入口应低摩擦，用户不需要先理解复杂 Agent 概念。

**Vinkey 采用：** 对话页提供明确的分析、拆分、人物线和改稿入口；确定性任务优先走本地服务，模型只在需要时出现。

**Vinkey 不采用：** 模型生成的漂亮段落不等于已确认事实。续写、改写和创意均标记为草稿或 Proposal，不自动写回正文、canon 或记忆。

### 3.3 豆包等长文助手：结果而不是过程

**参考点：** 附件独立展示、耗时过程收拢为入口、最终结果采用适合长文阅读的标题/表格/列表和可视化。

**Vinkey 采用：** 文件引用标签、可折叠活动轨迹、报告/Artifact 分层和来源收据。

**Vinkey 有意不同：** 长任务结果不能以“共用时”替代覆盖率、失败块和证据。文学分析必须让用户区分事实、推断、疑点和草稿。

## 4. 商业产品能力的决策边界

| 能力 | 借鉴 | 当前不做的部分 | 原因 |
| --- | --- | --- | --- |
| Agent Loop | 计划、Tool、事件、审批、恢复 | 直接嵌入 OpenAI Codex/Claude Code Runtime | 厂商认证、数据面、成本和工程边界不匹配 |
| 云端后台任务 | 独立任务状态、进度、结果审阅 | 把作品正文上传托管执行 | 与本地隐私和离线模型定位冲突 |
| 联网研究 | 搜索计划、来源卡、交叉核验 | 默认联网或自动写入 canon | 来源治理和外发授权尚未完成 |
| 多 Agent | 独立上下文、并行验证 | 为展示复杂度而默认并行 | 结果合并、成本和证据归属更难验证 |
| 团队协作 | 评论、提案、版本 | 云同步、成员权限、分享链接 | 需要全新的同步冲突和威胁模型 |
| 模型市场 | 提供商/模型可切换 | 大量内置厂商与自动路由 | 当前目标是本地/兼容协议的可解释连接 |

## 5. 下一轮商业产品验证计划

每次验证固定同一份小型作品、同一任务和同一验收标准，记录可观察行为，不推测隐藏推理。

| 场景 | 对比对象 | 关键指标 |
| --- | --- | --- |
| “找出人物关系冲突并给证据” | Vinkey / Cursor / Claude Code / 长文助手 | 关键冲突召回率、证据准确率、人工修正分钟数 |
| “按要求改写三个段落” | Vinkey / Cursor / Sudowrite / Knote（设计来源） | 越界修改率、审阅时间、接受后保存安全性 |
| “整理一份研究简报” | Vinkey / Research 产品 | 来源可核验率、来源重复率、外发数据范围 |
| “中断后继续长文分析” | Vinkey / OpenAI Codex / Claude Code 长任务体验 | 恢复成功率、源变化提示、失败块重试时间 |
| “从正文建立人物资产” | Vinkey / Novelcrafter / 图谱项目 | 候选精度、确认负担、局部失效可解释性 |

## 6. 来源

- [Agent 流程模板对比](../design/agent/AGENT_FLOW_COMPARISON.md)
- [AI 业务链路架构](../architecture/AI_BUSINESS_CHAINS.md)
- [GitHub 同类项目调研](../research/GITHUB_REFERENCE.md)
- [轻量级联网搜索设计](../research/LIGHTWEIGHT_WEB_RESEARCH.md)
- [Codex 长任务与控制面资料](https://learn.chatgpt.com/docs/long-running-work)、[Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Claude Code 工作方式](https://code.claude.com/docs/en/how-claude-code-works)、[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- [GitHub Copilot repository indexing](https://docs.github.com/en/copilot/concepts/context/repository-indexing)、[Cursor agent search](https://cursor.com/docs/agent/tools/search)
