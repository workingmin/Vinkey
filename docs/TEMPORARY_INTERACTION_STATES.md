# 临时交互状态设计

- 状态：首版已落地基础状态，Agent Runtime 状态为目标态
- 日期：2026-09-03
- 关联文档：[对话页设计](UI_DESIGN_CHAT.md)、[状态、流程与验收](UI_DESIGN_STATES.md)、[Agent 与 Skill 建设计划](AGENT_SKILL_PLAN.md)

## 1. 目标与边界

临时交互状态用于表达一次正在进行的任务，而不是保存到会话正文或数据库的业务结果。它需要回答三个问题：系统是否已经收到请求、当前正在处理哪一步、用户是否可以取消或等待。

状态必须满足：

- 有真实的请求或任务阶段作为依据；没有对应 Runtime 事件时不显示“工具调用”等确定性文案。
- 右侧消息流、当前助手消息和输入区使用同一份状态，不各自维护副本。
- 状态结束后自动清除；错误、上下文超限和审批等待属于独立的终态/交互态，不伪装成加载中。
- 长耗时阶段显示可读的中文短标签，保留英文稳定标识用于日志、埋点和后续多语言。

## 2. 当前真实业务链路

当前 MVP 尚未实现 Tool Registry、Skill Registry、IntentRouter 和 JobService。现有链路是：

```text
聊天输入
  → 前端 context budget
  → Tauri stream_chat
  → Rust run_stream
  → Ollama / OpenAI-compatible Provider
  → bytes stream
  → chunk / done / error
  → SQLite 会话消息
```

长文本入口目前由前端 `analyzeLongText` 编排：

```text
read_document
  → chunk_document
  → write_analysis_artifact(manifest)
  → 多次 stream_chat（局部摘要）
  → 多次 stream_chat（阶段汇总）
  → stream_chat（整体综合）
  → write_analysis_artifact
```

因此当前可以可靠表达 `sending`、`thinking`、`fetching`、`tool_calling`、`streaming` 和 `stopping`；不能把未来 Agent/Skill 的规划、审批、缓存或证据校验提前显示为已经发生。

## 3. 状态目录与实施决策

| 稳定标识 | 用户文案 | 当前是否增补 | 真实触发点 | 说明 |
| --- | --- | --- | --- | --- |
| `sending` | 发送中 | 现在实现 | 点击发送后、保存用户消息和建立请求期间 | 区分“已点击”和“模型已开始思考” |
| `thinking` | 思考中 | 已实现 | 请求建立后、首个模型 chunk 到达前 | 普通聊天的默认等待状态 |
| `fetching` | 读取资料 | 已实现 | 长文本切分、读取上下文和准备分析材料 | 不代表联网；联网检索需单独标注范围 |
| `tool_calling` | 执行分析 | 已实现 | 长文本 map/reduce/synthesis 阶段 | 当前实际是受控 Tauri command + 多次模型调用，不是 Tool Registry |
| `streaming` | 生成中 | 已实现 | 首个响应 chunk 到达后 | 对应草案中的 `typing`，内部保留 `streaming` 以贴合传输层 |
| `stopping` | 停止中 | 现在实现 | 用户点击停止，等待后端流结束 | 防止重复点击并明确取消尚未完成 |
| `context_too_large` | 正在精简上下文 | 暂缓 | 当前只做发送前预算校验 | 目前超限直接提示，尚无自动裁剪/压缩服务 |
| `retrying` | 重试中 | 暂缓 | 需要统一重试策略和幂等 request | 不能在一次失败后无依据地自动重试模型请求 |
| `stream_paused` | 输出暂时停顿 | 暂缓 | 需要流心跳、最后 chunk 时间和恢复协议 | 单纯等待 60 秒不能区分慢模型与断线 |
| `rate_limit` | 限流等待 | 暂缓 | Provider 返回 429 和 Retry-After | 当前错误映射未暴露该结构化信息 |
| `parsing` | 解析文档 | 目标态 | DocumentIngestion/OCR 事件 | 当前文本读取和分块是同步受控命令 |
| `routing` | 判断任务类型 | 目标态 | IntentRouter | Agent Runtime 建成后再启用 |
| `planning` | 制定执行步骤 | 目标态 | TaskPlanner / Agent | 应显示步骤数或当前步骤，不只显示转圈 |
| `awaiting_approval` | 等待确认 | 目标态 | Proposal / Approval checkpoint | 不是加载态，必须允许预览、接受或拒绝 |
| `checkpointing` | 保存进度 | 目标态 | JobService 持久化 TaskStep/Artifact | 需要可恢复任务模型 |
| `evidence_checking` | 核对来源 | 目标态 | EvidenceService | 分析报告生成后、提交前使用 |
| `generating_image` | 生成图片 | 暂不规划 | 尚无图像 Provider 或媒体任务 | 避免预先设计不存在的入口 |

`context_too_large`、`awaiting_approval` 和最终 `error` 不应与普通加载状态共用同一种视觉语义：它们需要行动入口或明确的终止原因。

## 4. 首版状态机

```text
idle
  → sending
  → thinking
      ├─→ fetching → tool_calling → streaming → idle
      ├─→ streaming → idle
      ├─→ stopping → idle
      └─→ error
```

约束：

1. `sending` 是短暂状态，用户消息保存失败时直接进入错误反馈，不继续显示思考中。
2. `thinking` 表示尚未收到首个响应；收到第一个 chunk 后只切换一次到 `streaming`。
3. 长文本分析的 `fetching` 对应切分和材料准备，`tool_calling` 对应 map/reduce/synthesis；阶段进度仍显示在输入区或任务详情中。
4. `stopping` 保留到 `stream_chat`/分析任务真正返回；不能点击一次就立即删除运行记录。
5. 运行记录消失即回到 `idle`，不把临时状态写进会话历史。

## 5. UI 表现

### 右侧消息流

- 当前助手消息作者名下显示状态短标签、呼吸点和可选进度；状态存在时助手气泡保留等待动画或流式光标。
- 状态只属于右侧当前运行的助手消息，不改变左侧会话项的消息数、时间和布局。
- 用户切换会话后，后台运行仍更新原消息；返回原会话时恢复同一运行记录。
- `stopping` 使用警示色但不显示为错误；`awaiting_approval` 使用可操作的确认样式。

### 对话区和输入区

- 当前助手气泡上方保留状态行；空内容时显示打字动画，有内容后显示流式光标，不重复堆叠多个加载动画。
- 输入区提示与消息流使用同一状态源；运行期间发送按钮变为停止，`stopping` 时禁用并显示等待。
- 状态文案使用 `aria-live="polite"`，避免每个 chunk 触发屏幕阅读器播报。

## 6. Service / Tool / Agent / Skill 映射

目标态统一由 Runtime 发出 `TaskEvent`，前端不根据猜测自行命名工具状态：

```text
TaskEvent {
  taskId, conversationId, requestId,
  phase, status, label,
  stepIndex, stepTotal,
  cancellable, resumable,
  startedAt, updatedAt
}
```

建议映射：

| 业务链路 | 状态 |
| --- | --- |
| IntentRouter 接收并解析入口 | `routing` |
| TaskPlanner 生成 TaskPlan | `planning` |
| DocumentIngestionService / `read_document` | `fetching` 或 `parsing` |
| StructureParserService / ChunkService / `chunk_document` | `tool_calling`，标签显示具体动作 |
| ContextBudgetService 超限处理 | `context_too_large` |
| ModelProvider 请求首 token 前 | `thinking` |
| ModelProvider 持续返回 token | `streaming` |
| ToolRegistry 执行搜索、文件读取或计算 | `tool_calling`，标签显示工具名 |
| ArtifactCacheService 命中/写入 | `checkpointing` 或短暂 `fetching` |
| Proposal 生成后等待用户 | `awaiting_approval` |
| EvidenceService 回溯来源 | `evidence_checking` |
| JobService 暂停、恢复、重试、取消 | `paused` / `retrying` / `stopping` |

当前前端 `setChatRunStatus` 是过渡实现。Runtime/JobService 建成后，应让 `TaskEvent` 成为唯一状态源，ChatRun 只保存最近事件和展示所需的派生字段。

## 7. 不纳入临时状态的内容

- 模型不可用、响应解码失败、权限失败：统一错误态，提供重试或修复入口。
- 上下文超限但未开始请求：预算警告，不创建假的运行任务。
- 已完成的分析、草稿、Proposal 和报告：进入持久化结果或消息内容，不继续显示加载状态。
- 纯 UI 动画（按钮 hover、消息光标）：不写入 Runtime 状态。

## 8. 验收标准

- 发送、长文本分析、流式输出和停止操作均能在右侧消息流看到对应阶段，且状态不会残留。
- 切换会话后，后台任务状态和内容仍能更新；返回原会话不会丢失状态。
- 首个响应 chunk 到达前显示 `thinking`，到达后显示 `streaming`，不会同时显示两个主状态。
- 停止按钮在后端确认结束前显示 `stopping`，期间不可重复发送停止命令。
- 状态名称与运行日志的 requestId/taskId 可关联；错误不会被加载状态吞掉。
- 未来接入 Agent Runtime 时，只需消费 `TaskEvent`，不改造消息流布局和视觉 token。
