# Agent 流程模板对比

- 状态：评审基线
- 日期：2026-09-17
- Vinkey 模板：[Agent 流程模板](AGENT_FLOW_TEMPLATES.md)

## 1. 对比口径

本对比关注用户可观察的流程模板和 Runtime 合同，不比较模型回答质量，也不把厂商内部隐藏推理当作流程。Codex 依据官方 OpenAI 长任务说明与仓库既有调研；Claude 依据仓库已有官方资料调研；豆包依据本次提供的文档分析交互样本。

## 2. 核心差异

| 维度 | Codex | Claude | 豆包样本 | Vinkey 模板 |
| --- | --- | --- | --- | --- |
| 主要对象 | 代码仓库、任务和 diff | 代码/文件、工具和 Artifact | 附件、用户问题和长文回答 | 作品、文档、场景、canon、记忆和 Proposal |
| 目标声明 | outcome、constraints、verification；Goal 可暂停/恢复/编辑 | 任务指令、计划、Tool 权限和完成结果 | 短指令，过程弱化，强调最终长文 | outcome、constraints、definition of done、领域 output contract |
| 执行选择 | Agent 自主使用受控工具 | Agent Loop、工具、子 Agent/Skill | 样本中过程折叠为耗时入口 | 先判定 deterministic/direct/workflow/agent/hybrid，Agent 不是默认 |
| 上下文 | workspace/thread，运行中可追加约束 | session、文件、项目指令、memory | 附件独立成块 | 稳定 TargetRef + scope/coverage/sourcePolicy + 源指纹 |
| 过程展示 | 进度行、状态更新、审批、最终 review | 工具调用、权限确认、Artifact、结果 | “共用时”入口 + 文档式结果 | 可验证 TaskEvent；默认折叠；不展示隐藏思维链 |
| 产物 | 代码变更、测试结果、diff | 文件、Artifact、diff | Markdown、表格、代码/可视化内容 | Answer、Report、Artifact、DiffProposal、CanonProposal、MemoryProposal |
| 审批粒度 | shell/network/file 等权限与变更 review | Tool 权限、文件修改和执行确认 | 样本中无显式领域审批 | 文档块、canon 项、记忆项、网络范围和正式写入 |
| 恢复模型 | thread/goal/task 恢复 | session/checkpoint 恢复 | 样本未体现 | Task/Step/Event/Checkpoint，按源指纹和模板版本恢复 |
| 安全边界 | 工作区、沙箱、approval policy | permission mode、allow/deny、sandbox | 产品内部边界不可从样本确认 | WorkspaceGuard + ToolGateway + 领域副作用等级 |
| 长文本 | 非文学领域专用 | 通用文件上下文 | 最终回答阅读体验强 | 结构分块、Map/Reduce/Synthesis、覆盖收据和来源校验 |

## 3. Vinkey 应采用的部分

来自 Codex：

- 用“结果、约束、验证”定义长任务完成条件。
- 输入区上方放置紧凑进度控制，支持暂停、恢复和停止。
- 同一会话保留相关上下文，运行中追加约束不隐式扩大权限。
- 任务完成后把结果交给用户审阅，而不是把执行成功等同于业务接受。

来自 Claude：

- Tool 调用与最终回答分层，过程默认折叠。
- Artifact 独立于聊天正文，适合报告、关系图、时间线和导出文件。
- 结构化输出、审批和 checkpoint 属于 Runtime 合同，而不是提示词约定。

来自豆包样本：

- 附件在用户请求中独立展示，避免正文重复文件名。
- 助手最终回答采用无气泡的文档式排版，适合标题、表格和长列表。
- 完成后的过程退化成紧凑耗时入口，主视觉集中于结果。
- 可视化应成为安全的只读 Artifact；Vinkey 不直接运行模型生成的任意 HTML。

## 4. Vinkey 有意不同的部分

1. Vinkey 不把所有请求都升级为 Agent。确定性拆章、短改稿和固定长文分析分别保留低成本链路。
2. Vinkey 的权限对象不是通用 shell，而是正文读取、文档 Proposal、canon、记忆、网络和正式写入。
3. Vinkey 把 `scope`、`coverage`、`sourcePolicy` 分开；“分析项目”不等于默认完整通读。
4. Vinkey 的最终结果必须区分事实、疑点、草稿和待确认变更，防止审校疑点污染 canon 或记忆。
5. Vinkey 恢复任务时校验模板版本、源指纹和输入快照，不能沿用旧检查点处理已变化正文。
6. Vinkey 的关系图、时间线、报告和导出物是有类型 Artifact，不是聊天正文里的任意 HTML 代码块。

## 5. 同一任务的流程示例

任务：“检查整部小说的人物关系是否前后矛盾，并给出可修改建议。”

```text
Codex 风格
  目标/约束/验证 -> 搜索与读取 -> 多步执行 -> 状态更新 -> 最终摘要 + diff review

Claude 风格
  计划 -> Tool 调用/权限 -> 分析 -> Artifact/修改建议 -> 用户审阅

豆包样本风格
  附件 + 短指令 -> 长时间处理 -> 共用时入口 -> 结构化长文结果/可视化

Vinkey
  TaskIntake
  -> scope=work, coverage=exhaustive, sourcePolicy=local-chunks
  -> ContinuityReviewer（只读）
  -> 候选关系检索 -> 最小证据窗口 -> 冲突/反例核对 -> 来源校验
  -> ReviewReport + CoverageReceipt + RelationshipGraph Artifact
  -> 用户选择建议
  -> 另起 RevisionEditor -> DiffProposal -> 逐块接受/拒绝
```

Vinkey 比通用 Agent 多出的关键边界，是“审校”和“修改”必须是两个任务。审校 Agent 没有写权限；只有用户选择建议后，RevisionEditor 才能基于锁定的原文范围生成 diff。

## 6. 实测记录模板

```yaml
comparison_run:
  scenario_id: string
  product: vinkey | codex | claude | doubao
  product_version_or_date: string
  prompt: string
  attachments: string[]
  observed_steps: string[]
  approval_points: string[]
  final_artifacts: string[]
  elapsed_ms: number | null
  interruptions: number
  retries: number
  source_traceability: none | partial | complete
  output_accepted_without_edit: boolean
  manual_correction_minutes: number
  notes: string
```

对比时固定同一输入快照和验收标准；记录可见步骤，不推测隐藏推理。重点比较任务完成率、来源准确率、人工修正量、恢复成功率和交互负担，不以“显示步骤更多”作为 Agent 更强的证据。

## 7. 资料

- OpenAI Docs：[Long-running work](https://learn.chatgpt.com/docs/long-running-work)
- 仓库调研：[AI 业务链路架构](AI_BUSINESS_CHAINS.md#6-codexclaude-与-vinkey-native-agent-参考取舍)
- Vinkey 交互基线：[对话页设计](UI_DESIGN_CHAT.md)、[临时交互状态](TEMPORARY_INTERACTION_STATES.md)
