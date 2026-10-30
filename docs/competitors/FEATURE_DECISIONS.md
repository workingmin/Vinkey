# 竞品启发的功能决策总表

- 版本：`2026-10-30`（清理流水日志，仅保留当前状态与最终结论）
- 用途：把竞品观察转换成 Vinkey 可追踪的功能决策；本表不是产品路线图的替代品。
- 状态说明：`已参考` 不表示功能完备，只表示设计原则或部分实现已经进入 Vinkey；`观察` 不进入承诺路线图；`不采用` 若重新提议，必须说明原决策失效的证据。
- 竞品名称和类别：以[正式竞品名录](COMPETITOR_CATALOG.md)和[术语规范](TERMINOLOGY.md)为准。

正式竞品名录已收紧至 9 个对象；未列入名录的产品仅作为个体功能的历史设计来源出现在台账中，不表示对当前发行的推荐。来源列无标记者为正式名录对象；`（设计来源）` 或 `（均设计来源）` 者不在正式名录。

## 功能台账

| 编号 | 功能域 | 竞品/来源 | 竞品做法 | Vinkey 决策 | 状态 | Vinkey 落点 / 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| `CF-001` | 工作区 | NoteGen；MarkText、Obsidian（设计来源） | 本地目录是内容主权边界，编辑器围绕文件工作 | 授权工作区 + Rust 路径守卫；不复制全盘访问 | `已参考` | [开发框架](../architecture/DEVELOPMENT_FRAMEWORK.md)、工作区测试；越界读取必须失败 |
| `CF-002` | 提供商 | Cherry Studio；SoloMD（设计来源） | 提供商配置、当前模型和连接测试分离 | 配置与活动模型分离，支持 Ollama/OpenAI-compatible | `已参考` | [模型设置](../design/ui/UI_DESIGN_SETTINGS.md)；密钥不进前端持久化和日志 |
| `CF-003` | 上下文 | Copilot、Cursor、Aider、Continue（均设计来源） | 先索引/结构定位，再按相关性和预算读取正文 | `overview / focused / deep` 与独立 coverage/source policy | `已参考` | [上下文设计](../architecture/DEVELOPMENT_FRAMEWORK.md#3-系统分层)；结果带范围和源指纹 |
| `CF-004` | 编辑器 | MarkText、Typora、Obsidian（均设计来源） | 低干扰编辑、预览、保存状态、快捷键和文件树 | 保留编辑/分栏/预览、原子保存和外部变化边界 | `已参考` | `src/App.tsx` 保存冲突重载、窗口聚焦重读、另存为；编辑器差异对比 UI 属后续验收 |
| `CF-005` | AI 改稿 | Cursor、Aider、Knote（均设计来源） | AI 修改以 diff/审阅呈现，而不是静默覆盖 | `DiffProposal` 逐块接受/拒绝，接受后仍未保存 | `已参考` | `src/lib/diffProposal.ts`；源指纹变化拒绝应用 |
| `CF-006` | 长任务 | WorkBuddy、百度搭子、千问办公、Kimi、豆包、Claude Code；OpenAI Codex、Cursor（机制设计来源） | 进度、后台执行、恢复、结果与过程分离 | `TaskJob + Step + Event + Checkpoint`；忠实保留实际过程，两层自主折叠，本轮不考虑过程合并 | `已参考 / 原生复验待执行` | `src/components/MessageActivity.tsx`、`src/components/ConversationTaskControls.tsx`；原生复验清单见 `TASK_PROCESS_NATIVE_ACCEPTANCE.md` |
| `CF-007` | Artifact | Claude Code、豆包；OpenAI Codex（设计来源） | 报告、图表、diff 独立于聊天正文 | 使用类型化 `Answer / Report / Artifact / Proposal`，不运行任意 HTML | `已参考` | `src/components/MessageActivity.tsx`；产物只读预览、可导出且来源可追踪 |
| `CF-008` | Agent 路由 | Claude Code；OpenAI Codex、Cline（设计来源） | 小任务直接处理，广域任务才升级 Agent/子 Agent | 确定性服务、单次模型、固定 Workflow、Hybrid Agent 分层 | `已参考` | [Agent 模板](../design/agent/AGENT_FLOW_TEMPLATES.md)；路由不能静默扩大权限 |
| `CF-009` | 项目记忆 | Claude Code、Novelcrafter；GitHub Copilot（设计来源） | 项目指令、记忆和当前上下文分层 | 仅保存已确认事实，按源版本可失效；审校疑点不入记忆 | `已参考` | `projectMemory` 与 `invalidate_project_memory`；提议→确认→拒绝闭环已实现 |
| `CF-010` | 人物资产 | Novelcrafter；StorySphere、graphify-novel（设计来源） | 资产卡、别名、提及索引、关系图和增量更新 | 候选→消歧→关系判定→用户确认→正式图谱 | `已参考` | `src/lib/characterAssets.ts`；真实长文提取与局部失效评测属后续验收 |
| `CF-011` | 网络研究 | Perplexity、Claude 产品的 Research 能力、ChatGPT Deep Research（均设计来源） | 搜索范围、来源和长任务结果独立呈现 | 轻量联网 Skill，默认关闭，按域名和数据范围单独授权 | `已参考` | `src-tauri/src/research_sources.rs`、`research_evidence.rs`、`research_retrieval.rs`、`src/lib/research.ts` |
| `CF-012` | Skills/Tools | Codex Skills、Claude Agent Skills、MCP（均设计来源） | 能力按需加载，工具和资源有独立合同 | 采用渐进披露；ToolGateway 强制输入、权限和副作用 | `已参考` | `src/lib/registry.ts`、`src/lib/runtimePolicy.ts`；不开放任意 shell/MCP |
| `CF-013` | 本地隐私 | NoteGen；SoloMD、Obsidian（设计来源） | 本地文件和用户自带模型降低数据外发 | 正文默认只发回环模型，远程正文需显式授权 | `已参考` | [模型隐私](../architecture/DEVELOPMENT_FRAMEWORK.md)；日志不得含正文/密钥 |
| `CF-014` | 云端协作 | Notion、Google Docs、Claude Code on the web、Codex cloud（均设计来源） | 云同步、分享、成员和后台托管任务 | 当前不做云同步和团队权限；先完成单机可恢复闭环 | `不采用` | 产品定位与数据边界 |
| `CF-015` | 多 Agent | Claude Code；CloudCLI、Cline subagents、OpenAI Codex subagents（设计来源） | 并行拆分广域探索、统一 CLI 会话或独立上下文 | 仅在隔离上下文和评测证明有收益时采用 | `观察` | 先以 Worker/Workflow 验证 |
| `CF-016` | 商业 API/SDK | Codex SDK、Claude Agent SDK、OpenAI Agents SDK、Anthropic API（均设计来源） | 直接复用成熟 Runtime、认证和托管执行 | 当前不集成，不新增商用付费 API 配置 | `不采用` | [AI 业务链路](../architecture/AI_BUSINESS_CHAINS.md) |
| `CF-017` | 多 CLI 控制面 | CloudCLI、Opcode（均设计来源） | 多 CLI 项目、会话、任务和远程控制统一管理 | 观察统一会话控制面；不让外部 CLI 绕过 Vinkey 权限 | `观察` | 先验证 `TaskJob` 与多 CLI 会话映射 |
| `CF-018` | 模型路由/代理 | Claude Code Router、CLIProxyAPI（均设计来源） | Provider 路由、兼容协议和多模型代理 | 仅参考协议抽象；凭据、正文和第三方账号不得被代理层隐式接管 | `观察` | 模型设置和 `ToolGateway` |
| `CF-019` | 应用壳层与入口 | Cherry Studio、NoteGen；Obsidian、Cursor、Typora、CloudCLI（设计来源） | 工作区、文档、会话和 AI 状态由稳定的桌面/工作台壳层承载 | Windows 自绘标题栏，macOS 原生菜单；侧栏提供导航承载，内容区只切换对话/文件/日志 | `已参考` | `UI_DESIGN_SHELL.md`、`TITLE_BAR_DESIGN.md` |
| `CF-020` | 多项目与会话导航 | Cherry Studio；Obsidian、Notion Desktop、CloudCLI（设计来源） | 工作区/项目、搜索、会话和返回路径集中在稳定导航区 | 项目、会话、文档搜索共用导航区；删除只删除应用记录，不删除用户目录 | `组合改造` | `ProjectSessionSidebar.tsx`、`store.ts` |
| `CF-021` | 平台窗口与可访问入口 | 豆包；Cursor、Obsidian、Typora（设计来源） | Windows/macOS 遵循各自窗口装饰、菜单与快捷键习惯 | 保持同一业务语义，按平台切换标题栏承载；图标按钮统一 `title`、`aria-label` 和焦点路径 | `组合改造` | `src/App.tsx`、`nativeWindowControls.ts` |
| `CF-022` | 会话标题生命周期 | WorkBuddy、百度搭子、千问办公的公开会话/任务资料 | 官方资料未尽公开统一标题生命周期，Vinkey 自行定义 | 临时标题、首轮后至多升级一次、手动优先、失败回退 | `已参考` | `src/lib/conversationTitle.ts`、`src/store.ts`、`ProjectSessionSidebar.tsx` |
| `CF-023` | 全局搜索入口与结果面板 | Obsidian Command palette、CloudCLI 会话管理公开资料 | 统一入口、键盘调用、结果分组 | `⌘/Ctrl+K` 聚焦、会话菜单入口、项目/会话/当前文档分组 | `已参考` | `src/App.tsx`、`ProjectSessionSidebar.tsx` |
| `CF-024` | 系统标题栏与功能菜单语义 | Cherry Studio、NoteGen；CloudCLI、Obsidian、Typora、Cursor（设计来源） | 项目/工作区、会话、文档和编辑器是不同层级 | 一级菜单采用“项目/会话/编辑/查看/窗口/帮助”；文件操作回到文档局部入口 | `已参考 / 实现已对齐，待专项验收` | `src/lib/titleBarMenu.ts`、`src/lib/editCommands.ts`、`src/App.tsx` |

## 当前验证重点

1. 联网研究阶段 B/C 的真实评测、限频回归与 Go/No-Go。
2. 编辑器外部变化、另存为与差异对比 UI。
3. 人物资产在真实长篇样本中的候选精度、冲突与局部失效。
4. Artifact 版本、过滤与“回到来源位置”。
5. 长任务原生复验与跨页面任务中心。
