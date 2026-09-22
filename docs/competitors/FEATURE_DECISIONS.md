# 竞品启发的功能决策总表

- 版本：`2026-09-22`
- 用途：把竞品观察转换成 Vinkey 可追踪的功能决策；本表不是产品路线图的替代品。
- 状态说明：详见 [竞品分析目录说明](README.md#状态标签)。

## 功能台账

| 编号 | 功能域 | 竞品/来源 | 竞品做法 | Vinkey 决策 | 状态 | Vinkey 落点 / 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| `CF-001` | 工作区 | NoteGen、MarkText、Obsidian | 本地目录是内容主权边界，编辑器围绕文件工作 | 授权工作区 + Rust 路径守卫；不复制全盘访问 | `已参考` | [开发框架](../architecture/DEVELOPMENT_FRAMEWORK.md)、工作区测试；越界读取必须失败 |
| `CF-002` | 提供商 | SoloMD、Cherry Studio | 提供商配置、当前模型和连接测试分离 | 配置与活动模型分离，支持 Ollama/OpenAI-compatible | `已参考` | [模型设置](../design/ui/UI_DESIGN_SETTINGS.md)；密钥不进前端持久化和日志 |
| `CF-003` | 上下文 | Copilot、Cursor、Aider、Continue | 先索引/结构定位，再按相关性和预算读取正文 | `overview / focused / deep` 与独立 coverage/source policy | `已参考` | [上下文设计](../architecture/DEVELOPMENT_FRAMEWORK.md#3-系统分层)；结果带范围和源指纹 |
| `CF-004` | 编辑器 | MarkText、Typora、Obsidian | 低干扰编辑、预览、保存状态、快捷键和文件树 | 保留编辑/分栏/预览、原子保存和外部变化边界 | `部分参考` | [文件与编辑器](../design/ui/UI_DESIGN_EDITOR.md)；外部修改冲突仍待补齐 |
| `CF-005` | AI 改稿 | Knote、Cursor、Claude Code | AI 修改以 diff/审阅呈现，而不是静默覆盖 | `DiffProposal` 逐块接受/拒绝，接受后仍未保存 | `已参考` | `src/lib/diffProposal.ts`、编辑器验收；源指纹变化拒绝应用 |
| `CF-006` | 长任务 | Codex、Claude Code、豆包样本 | 进度、后台执行、恢复、结果与过程分离 | `TaskJob + Step + Event + Checkpoint`；过程默认折叠 | `部分参考` | [Agent 流程对比](../design/agent/AGENT_FLOW_COMPARISON.md)；暂停/恢复必须校验快照 |
| `CF-007` | Artifact | Claude、豆包样本、Codex | 报告、图表、diff 独立于聊天正文 | 使用类型化 `Answer / Report / Artifact / Proposal`，不运行任意 HTML | `已参考` | [业务链路](../architecture/AI_BUSINESS_CHAINS.md)；产物只读预览和来源可追踪 |
| `CF-008` | Agent 路由 | Codex、Claude Code、Cline | 小任务直接处理，广域任务才升级 Agent/子 Agent | 确定性服务、单次模型、固定 Workflow、Hybrid Agent 分层 | `已参考` | [Agent 模板](../design/agent/AGENT_FLOW_TEMPLATES.md)；路由不能静默扩大权限 |
| `CF-009` | 项目记忆 | Copilot、Claude Code、Novelcrafter | 项目指令、记忆和当前上下文分层 | 仅保存已确认事实，按源版本可失效；审校疑点不入记忆 | `部分参考` | `projectMemory` 与长期记忆设计；记忆候选仍需确认 |
| `CF-010` | 人物资产 | Novelcrafter Codex、StorySphere、graphify-novel | 资产卡、别名、提及索引、关系图和增量更新 | 候选→消歧→关系判定→用户确认→正式图谱 | `部分参考` | [GitHub 调研](../research/GITHUB_REFERENCE.md#人物资产提取专项调研2026-09-04)；关系需保留证据 |
| `CF-011` | 网络研究 | Perplexity、Research mode、Claude/ChatGPT research | 搜索范围、来源和长任务结果独立呈现 | 轻量联网 Skill，默认关闭，按域名和数据发送单独授权 | `待参考` | [联网搜索设计](../research/LIGHTWEIGHT_WEB_RESEARCH.md)；来源交叉核验后才能交付 |
| `CF-012` | Skills/Tools | Codex Skills、Claude Agent Skills、MCP | 能力按需加载，工具和资源有独立合同 | 采用渐进披露；ToolGateway 强制输入、权限和副作用 | `部分参考` | [Agent 与 Skill 计划](../design/agent/AGENT_SKILL_PLAN.md)；不开放任意 shell/MCP |
| `CF-013` | 本地隐私 | NoteGen、SoloMD、Obsidian | 本地文件和用户自带模型降低数据外发 | 正文默认只发回环模型，远程正文需显式授权 | `已参考` | [模型隐私](../architecture/DEVELOPMENT_FRAMEWORK.md)；日志不得含正文/密钥 |
| `CF-014` | 云端协作 | Notion、Google Docs、Claude web、Codex cloud | 云同步、分享、成员和后台托管任务 | 当前不做云同步和团队权限；先完成单机可恢复闭环 | `不采用` | 产品定位与数据边界；后续若引入须另立威胁模型 |
| `CF-015` | 多 Agent | Cline subagents、Codex subagents、Claude teams | 并行拆分广域探索或独立上下文 | 仅在隔离上下文和评测证明有收益时采用 | `观察` | 先以 Worker/Workflow 验证；不得为展示过程而增加 Agent |
| `CF-016` | 商业 API/SDK | Codex SDK、Claude Agent SDK、OpenAI/Anthropic Agent API | 直接复用成熟 Runtime、认证和托管执行 | 当前不集成，不新增商用付费 API 配置 | `不采用` | [AI 业务链路](../architecture/AI_BUSINESS_CHAINS.md#6-codexclaude-与-vinkey-native-agent-参考取舍) |

## 优先级规则

- `已参考` 不代表功能完备；它只表示设计原则或部分实现已经进入 Vinkey。
- `待参考` 进入实现前必须补充：目标用户场景、正文隐私边界、失败/恢复策略、最小验收集和退出条件。
- `观察` 不进入承诺路线图，不新增依赖，不改变权限模型。
- `不采用` 若重新提议，必须说明原决策失效的证据，而不是只引用竞品已有该能力。

## 当前最值得继续验证的五项

1. **联网研究**：验证来源准确率和人工核验时间是否值得引入网络权限。
2. **外部文件变化处理**：补齐监听、冲突对比、重新加载和另存为，完成编辑器底座。
3. **人物资产增量更新**：用真实长篇样本验证候选、证据、冲突和局部失效成本。
4. **Artifact 查看与导出**：验证报告、关系图、时间线是否比聊天长文更容易审阅。
5. **长任务恢复体验**：验证任务中断、源文件变化、模型切换时的恢复提示是否足够明确。
