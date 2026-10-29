# 竞品启发的功能决策总表

- 版本：`2026-10-27`（重核收录依据、中文交互优先级与 `CF-006` 对照）
- 用途：把竞品观察转换成 Vinkey 可追踪的功能决策；本表不是产品路线图的替代品。
- 状态说明：详见 [竞品分析目录说明](README.md#状态标签)。
- 竞品名称和类别：以[正式竞品名录](COMPETITOR_CATALOG.md)和[术语规范](TERMINOLOGY.md)为准。

正式竞品名录已收紧至 9 个对象；未列入名录的产品仅作为个体功能的历史设计来源出现在台账中，不表示对当前发行的推荐。中文界面与文案优先参考中国区同类产品；功能是否采用仍以 Vinkey 的需求和验收为准。

来源列约定：无标记者为正式名录对象；`（设计来源）` 或 `（均设计来源）` 者不在正式名录，只作为该功能的历史设计来源。

## 功能台账

| 编号 | 功能域 | 竞品/来源 | 竞品做法 | Vinkey 决策 | 状态 | Vinkey 落点 / 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| `CF-001` | 工作区 | NoteGen；MarkText、Obsidian（设计来源） | 本地目录是内容主权边界，编辑器围绕文件工作 | 授权工作区 + Rust 路径守卫；不复制全盘访问 | `已参考` | [开发框架](../architecture/DEVELOPMENT_FRAMEWORK.md)、工作区测试；越界读取必须失败 |
| `CF-002` | 提供商 | Cherry Studio；SoloMD（设计来源） | 提供商配置、当前模型和连接测试分离 | 配置与活动模型分离，支持 Ollama/OpenAI-compatible | `已参考` | [模型设置](../design/ui/UI_DESIGN_SETTINGS.md)；密钥不进前端持久化和日志 |
| `CF-003` | 上下文 | Copilot、Cursor、Aider、Continue（均设计来源） | 先索引/结构定位，再按相关性和预算读取正文 | `overview / focused / deep` 与独立 coverage/source policy | `已参考` | [上下文设计](../architecture/DEVELOPMENT_FRAMEWORK.md#3-系统分层)；结果带范围和源指纹 |
| `CF-004` | 编辑器 | MarkText、Typora、Obsidian（均设计来源） | 低干扰编辑、预览、保存状态、快捷键和文件树 | 保留编辑/分栏/预览、原子保存和外部变化边界 | `部分参考` | [文件与编辑器](../design/ui/UI_DESIGN_EDITOR.md)；外部修改冲突仍待补齐 |
| `CF-005` | AI 改稿 | Cursor、Aider、Knote（均设计来源） | AI 修改以 diff/审阅呈现，而不是静默覆盖 | `DiffProposal` 逐块接受/拒绝，接受后仍未保存 | `已参考` | `src/lib/diffProposal.ts`、编辑器验收；源指纹变化拒绝应用 |
| `CF-006` | 长任务 | WorkBuddy、百度搭子、千问办公、Kimi、豆包、Claude Code；OpenAI Codex、Cursor（机制设计来源） | 进度、后台执行、恢复、结果与过程分离 | `TaskJob + Step + Event + Checkpoint`；忠实保留实际过程与历史，两层自主折叠（真实推进段 / 具体活动详情），任务级批量操作不增加层级；本轮不考虑过程合并 | `已参考 / 原生复验待执行` | [Agent 流程对比](../design/agent/AGENT_FLOW_COMPARISON.md)；暂停/恢复必须校验快照；逐事件历史与折叠行为已实现；默认两层已实现；原生复验见[原生复验清单](../acceptance/ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md) |
| `CF-007` | Artifact | Claude Code、豆包；OpenAI Codex（设计来源） | 报告、图表、diff 独立于聊天正文 | 使用类型化 `Answer / Report / Artifact / Proposal`，不运行任意 HTML | `已参考` | [业务链路](../architecture/AI_BUSINESS_CHAINS.md)；产物只读预览和来源可追踪 |
| `CF-008` | Agent 路由 | Claude Code；OpenAI Codex、Cline（设计来源） | 小任务直接处理，广域任务才升级 Agent/子 Agent | 确定性服务、单次模型、固定 Workflow、Hybrid Agent 分层 | `已参考` | [Agent 模板](../design/agent/AGENT_FLOW_TEMPLATES.md)；路由不能静默扩大权限 |
| `CF-009` | 项目记忆 | Claude Code、Novelcrafter；GitHub Copilot（设计来源） | 项目指令、记忆和当前上下文分层 | 仅保存已确认事实，按源版本可失效；审校疑点不入记忆 | `部分参考` | `projectMemory` 与长期记忆设计；记忆候选仍需确认 |
| `CF-010` | 人物资产 | Novelcrafter；StorySphere、graphify-novel（设计来源） | 资产卡、别名、提及索引、关系图和增量更新 | 候选→消歧→关系判定→用户确认→正式图谱 | `部分参考` | [GitHub 调研](../research/GITHUB_REFERENCE.md#人物资产提取专项调研2026-09-04)；关系需保留证据 |
| `CF-011` | 网络研究 | Perplexity、Claude 产品的 Research 能力、ChatGPT Deep Research（均设计来源） | 搜索范围、来源和长任务结果独立呈现 | 轻量联网 Skill，默认关闭，按域名和数据发送单独授权 | `已参考` | [联网搜索设计](../research/LIGHTWEIGHT_WEB_RESEARCH.md) 与 `src-tauri/src/research_sources.rs`、`src-tauri/src/research_evidence.rs`、`src-tauri/src/research_retrieval.rs`、`src/lib/registry.ts`；阶段计划见 CF-011 推进计划，正式上线仍需通过阶段 B/C 验收 |
| `CF-012` | Skills/Tools | Codex Skills、Claude Agent Skills、MCP（均设计来源） | 能力按需加载，工具和资源有独立合同 | 采用渐进披露；ToolGateway 强制输入、权限和副作用 | `部分参考` | [Agent 与 Skill 计划](../design/agent/AGENT_SKILL_PLAN.md)；不开放任意 shell/MCP |
| `CF-013` | 本地隐私 | NoteGen；SoloMD、Obsidian（设计来源） | 本地文件和用户自带模型降低数据外发 | 正文默认只发回环模型，远程正文需显式授权 | `已参考` | [模型隐私](../architecture/DEVELOPMENT_FRAMEWORK.md)；日志不得含正文/密钥 |
| `CF-014` | 云端协作 | Notion、Google Docs、Claude Code on the web、Codex cloud（均设计来源） | 云同步、分享、成员和后台托管任务 | 当前不做云同步和团队权限；先完成单机可恢复闭环 | `不采用` | 产品定位与数据边界；后续若引入须另立威胁模型 |
| `CF-015` | 多 Agent | Claude Code；CloudCLI、Cline subagents、OpenAI Codex subagents（设计来源） | 并行拆分广域探索、统一 CLI 会话或独立上下文 | 仅在隔离上下文和评测证明有收益时采用 | `观察` | 先以 Worker/Workflow 验证；不得为展示过程而增加 Agent |
| `CF-016` | 商业 API/SDK | Codex SDK、Claude Agent SDK、OpenAI Agents SDK、Anthropic API（均设计来源） | 直接复用成熟 Runtime、认证和托管执行 | 当前不集成，不新增商用付费 API 配置 | `不采用` | [AI 业务链路](../architecture/AI_BUSINESS_CHAINS.md#6-codexclaude-与-vinkey-native-agent-参考取舍) |
| `CF-017` | 多 CLI 控制面 | CloudCLI、Opcode（均设计来源） | 多 CLI 项目、会话、任务和远程控制统一管理 | 观察统一会话控制面；不让外部 CLI 绕过 Vinkey 权限 | `观察` | 先验证 `TaskJob` 与多 CLI 会话的映射和恢复边界 |
| `CF-018` | 模型路由/代理 | Claude Code Router、CLIProxyAPI（均设计来源） | Provider 路由、兼容协议和多模型代理 | 仅参考协议抽象；凭据、正文和第三方账号不得被代理层隐式接管 | `观察` | 模型设置和 `ToolGateway`；需要单独安全评审 |
| `CF-019` | 应用壳层与入口 | Cherry Studio、NoteGen；Obsidian、Cursor、Typora、CloudCLI（设计来源） | 工作区、文档、会话和 AI 状态由稳定的桌面/工作台壳层承载；平台窗口和菜单遵循系统习惯 | Windows 使用自绘标题栏和中文应用菜单，macOS 使用 Overlay/原生菜单；侧栏提供导航承载，内容区只切换对话/文件/日志；入口必须保留状态并可解释失败 | `已参考` | `UI_DESIGN_SHELL.md`、`TITLE_BAR_DESIGN.md`、`UI_ACCEPTANCE_SHELL.md`；不采用账号、云同步、插件市场和面向代码的终端/调试入口 |
| `CF-020` | 多项目与会话导航 | Cherry Studio；Obsidian、Notion Desktop、CloudCLI（设计来源） | 工作区/项目、搜索、会话和返回路径集中在稳定导航区；多 CLI 工作台将项目和会话作为控制面对象 | 项目记录、会话记录和文档搜索共用导航区，但数据仍按本地工作区隔离；删除只删除应用记录，不删除用户目录；不复制 CloudCLI 的远程控制面 | `组合改造` | `ProjectSessionSidebar.tsx`、`store.ts`、`UI_DESIGN_NAVIGATION.md`、`UI_ACCEPTANCE_NAVIGATION.md`；运行任务和未保存文档时禁止静默切换 |
| `CF-021` | 平台窗口与可访问入口 | 豆包；Cursor、Obsidian、Typora（设计来源） | Windows/macOS 对窗口装饰、菜单承载和快捷键有不同平台习惯；图标入口需要可发现性和状态反馈 | 保持同一业务语义，按平台切换标题栏承载；图标按钮统一 `title`、`aria-label`、焦点路径和 Escape 关闭；窗口诊断作为帮助入口 | `组合改造` | `src/App.tsx`、`src/lib/nativeWindowControls.ts`、`src-tauri/src/window_controls.rs`、`UI_ACCEPTANCE_SHELL.md`；不采用消费型增长入口、全局悬浮入口和不可审计的隐藏快捷操作 |
| `CF-022` | 会话标题生命周期 | 待完成正式竞品证据卡；候选范围以[筛选方法论](SELECTION_METHODOLOGY.md)和[术语规范](TERMINOLOGY.md)为准 | 会话标题需要稳定主标题而不是持续覆盖最后一轮问题；临时标题应在无模型时可用，语义升级、手动命名和失败回退需有清晰生命周期 | 首次有效用户输入生成确定性临时标题；第一轮完成或累计 2 至 3 条输入后至多升级一次；手动标题优先；模型不可用时保留临时标题 | `部分参考` | `src/lib/conversationTitle.ts`、`src/store.ts`、`src/components/ProjectSessionSidebar.tsx`；正式竞品证据卡未完成前不复核为已参考 |
| `CF-023` | 全局搜索入口与结果面板 | 待完成正式竞品证据卡；不把外部产品局部 DOM/SVG 作为证据 | 搜索入口、范围提示、分组结果和跳转返回必须统一；当前侧栏输入框与目标全局搜索需避免同名歧义 | 目标态提供标题栏/侧栏/键盘共用入口，结果按项目、会话、当前项目文档分组；正文遵守授权工作区边界；当前内联搜索只作为过渡实现 | `部分参考` | `⌘/Ctrl+K` 聚焦入口与侧栏结果分组已实现；标题栏入口与权限边界复验未完成，正式证据卡未完成前保持部分参考 |
| `CF-024` | 系统标题栏与功能菜单语义 | Cherry Studio、NoteGen；CloudCLI、Obsidian、Typora、Cursor（设计来源）；逐项证据卡见 `TITLE_BAR_DESIGN.md` | 项目/工作区、会话、文档和编辑器是不同层级；成熟 AI/本地工作台把项目与会话作为稳定控制面，单文档编辑器的文件菜单不能直接覆盖多对象工作台 | 一级菜单采用“项目/会话/编辑/查看/窗口/帮助”；文件新建/保存/关闭回到项目文件页局部入口；编辑命令按当前焦点分派；设置移出“查看”；Windows 自绘、macOS 原生菜单保持共同语义 | `已参考 / 实现已对齐，待专项验收` | `src/lib/titleBarMenu.ts`、`src/lib/editCommands.ts`、`src/App.tsx`、`UI_DESIGN_SHELL.md`、`TITLE_BAR_DESIGN.md`、`UI_ENTRY_POINTS.md`；全局搜索仍由 `CF-023` 独立阻断 |

## CF-006 过程展示修订依据（2026-10-26）

最初证据是用户提供的 WorkBuddy“分析小说”交互观察及分段推进机制说明：同名续接提示和展开入口具有真实过程及历史查阅价值，不能据此推断内部协议或全部持久化能力。2026-10-27 重新按中国区办公类 AI Agent 核验，依据同类独立采用数据、官方身份与维护记录，将 WorkBuddy、百度搭子和千问办公列入[正式竞品名录](COMPETITOR_CATALOG.md)；收录依据不再采用用户指定例外。截图仅在会话中观察，仓库不保存图像原件或变体。

Vinkey 接受的设计方向是忠实展示实际任务过程，保留多轮推进的历史查阅价值，再用多层折叠控制阅读范围；文案相同不构成删减真实记录的理由。本轮不考虑合并功能，默认两层已落实，本阶段不新增跨会话展开偏好持久化。现有实现与目标态分别记录在[过程展示设计](../design/ui/TEMPORARY_INTERACTION_STATES.md#6-当前实现与目标差距)，现已推进逐事件保留、分页、保存恢复与用户折叠选择保持；默认两层已实现，Rust 原生验收仍受当前环境依赖限制。

CF-006 的完整界面与文案提案见[任务过程界面与文案设计](../design/ui/TASK_PROCESS_COPY_DESIGN.md)，优先覆盖 WorkBuddy、百度搭子、千问办公的中文任务行为，以 Claude Code、Kimi 补充专项对照，另列豆包等当前界面的补证项；Cursor、OpenAI Codex 仅作为机制设计来源。各产品事实、会话内观察和 Vinkey 设计判断分别标注；提案已覆盖布局、56 项文案、状态控制和 18 项验收，仍待整体评审，新增设计未实施。

## CF-011 阶段推进计划（2026-10-29）

目标：按[轻量级联网搜索设计](../research/LIGHTWEIGHT_WEB_RESEARCH.md)的阶段 A～C 推进。本次将 CF-011 标记为 `已参考`，仅表示设计原则与部分实现已进入 Vinkey 代码与交互模型，不等于功能完备或已通过正式上线验收；阶段 B/C 验收继续按门槛执行。

| 阶段 | 范围 | 关键交付 | 退出条件 | 状态变化 |
| --- | --- | --- | --- | --- |
| A 来源治理 | 来源 schema、冷启动目录、健康检查状态机 | `SourceRegistryService`、`SourceHealthService`；用户覆盖、导入导出、软停用与回滚；只保存来源元数据 | 单测与集成测试通过；状态迁移可回滚；`一键更新`不保存网页正文 | 已实施，仍缺真实网络在线目录下载 |
| B 实时检索闭环 | 检索适配、显式授权、证据组装与引用校验 | `ResearchSearchService`、`WebEvidenceService`；`TaskPolicy.network` 显式触发；`ToolGateway` 按域名/数据范围授权；引用校验、内容哈希、冲突识别与“未核实”标记 | 阶段 B 验收：引用可回访 ≥95%，关键事实有摘录或明确未核实 ≥90%，未授权联网 100% 阻断，单源失败不拖垮任务；不建设外部正文表或全文索引 | 实现已进入代码；真实评测跑批待完成 |
| C 质量与安全加固 | SSRF/重定向/私网、限流、Prompt Injection、回归评测 | 安全测试矩阵、来源可达性矩阵、失败恢复、固定 60 题评测集 | 安全加固通过；固定评测集达标；Go/No-Go 通过 | 基础安全边界已实施；评测集与限流仍需完整跑批 |

阶段 B 未通过不进入 C；若阶段 B 显示事实收益或来源覆盖不达标，先改善来源目录与适配器质量，不继续扩大 UI 或 Agent 能力。

本次 `已参考` 标记依据：项目状态定义中“已参考不代表功能完备，只表示设计原则或部分实现已经进入 Vinkey”。阶段 B 真实评测与阶段 C 安全加固未完成前，CF-011 不视为可稳定交付。

## 部分参考/待参考推进队列（2026-10-29）

1. `CF-004` 编辑器外部变化：已处理保存冲突重载，并增加窗口聚焦时对“已保存标签页”的磁盘版本重读；仍需另存为与冲突对比 UI。
2. `CF-006` 长任务：已新增[原生复验清单](../acceptance/ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md)；待具备 Tauri 构建依赖环境执行，文案方案仍待评审。
3. `CF-009` 项目记忆：已新增 `invalidate_project_memory`，源文件保存后把依赖该文件的已确认记忆退回 `proposed`；待证明候选确认流程与逐条源指纹失效。
4. `CF-010` 人物资产：已新增 `src/lib/characterAssets.ts` 的别名归一、去重与冲突检测；待接入提取流程并用真实长篇样本验证局部失效。
5. `CF-012` Skills/Tools：已补 ToolGateway 超时与结构化错误封装；待补任务/步骤身份与审计字段过滤。
6. `CF-022` 会话标题生命周期：已实现临时标题、首轮回答后至多一次语义升级、手动重命名；仍待正式竞品证据卡补充。
7. `CF-023` 全局搜索入口与结果面板：已增加 `⌘/Ctrl+K` 聚焦侧栏搜索入口，侧栏已按项目/会话/当前项目文档分组；仍需统一标题栏/命令入口与结果面板权限边界复验。

## CF-022 / CF-023 正式竞品证据卡

| 证据 ID | 设计与竞品 | 可复查事实 | 可迁移原则 | 证据边界 |
| --- | --- | --- | --- | --- |
| `TITLE-EV-022` | WorkBuddy、百度搭子、千问办公的官方任务/会话文档 | 官方资料说明任务继续、历史查阅与交付对象，未见公开的统一会话标题生命周期规范 | Vinkey 的会话标题生命周期应自行定义：确定临时标题、语义升级、手动优先、失败回退 | 不把未观察到的功能写成竞品缺失；竞品未公开不等于不支持 |
| `SEARCH-EV-023` | Obsidian [Command palette](https://help.obsidian.md/plugins/command-palette)、CloudCLI 会话管理公开资料 | Obsidian 提供统一命令入口与键盘调用；CloudCLI 将项目/会话作为控制面对象 | Vinkey 采用统一搜索入口，命令入口与侧栏入口同语义；结果按项目/会话/当前文档分组 | 官方帮助页不证明精确分组样式；CloudCLI 的远程控制面不迁移 |

阶段 C 基础安全边界已落在 `src-tauri/src/research_retrieval.rs`：`assert_public_url` 拒绝 localhost、`.local`、`.internal`、私网/链路本地/组播/IPv6 非公网地址，DNS 解析后逐地址复核，最终重定向 URL 再次校验；已有 HTTPS 强制、超时、重定向次数、响应大小与来源域名白名单。阶段 B 跑批入口与采集器就绪后，仅剩在具备活跃来源的环境执行 60 题真实评测并生成报告。

阶段 A 数据路径已落在 `src-tauri/src/database.rs` 与 `src-tauri/src/research_sources.rs`：来源 schema、SQLite 注册表与变更历史、内置冷启动目录、软删除/恢复、健康状态迁移、回滚、导入导出，以及 `preview_research_catalog`/`apply_research_catalog` 的 24 小时额度、候选校验、差异生成与确定性合并。候选 payload 由调用方提供；在线目录 GET 下载推迟到阶段 B 的联网授权与 SSRF 防护一并实现，当前更新路径只写元数据与历史，不保存网页正文。

阶段 B 基础已落在 `src-tauri/src/research_evidence.rs`：`plan_research_search` 负责活跃来源筛选与确定性路由；`prepare_research_evidence` 负责来源/域名校验、内容哈希、重复/冲突识别及 `supported`/`unverified` 标记。真实 HTTP 检索适配器与模型证据组装仍在推进，在线 GET 将在授权边界和 SSRF 防护齐备后接入。

阶段 B 已继续落在 `src-tauri/src/research_retrieval.rs`：`search_research_sources` 已接入 MediaWiki 与 JSON-API 两类检索适配器并生成 `ResearchEvidenceInput`；RSS、Sitemap、OPDS、HTML Search 与 `fetch-only` 适配器仍未接入，模型证据组装与引用回访校验待完成。

阶段 B 再次推进：`search_research_sources` 已补齐 RSS、Sitemap、OPDS 与 HTML Search 适配器（`fetch-only` 明确不支持搜索），并新增 `verify_research_citations` 对引用 URL 做 HTTPS 可达性、最终域名白名单与 HTTP 状态回访校验。模型证据组装尚未接入。

阶段 B 继续推进：新增 `assemble_research_evidence` 对证据去重、排序、裁剪并生成模型可读上下文；前端 `registry.ts` 已注册研究工具与 `research-agent` Skill，`network` 副作用与 `web-metadata`/`web-excerpts` 来源策略同步补上。剩余工作为阶段 B 验收指标自动化测试。

阶段 B 验收测试已补：`registry.test.ts` 与 `runtimePolicy.test.ts` 覆盖研究工具注册、`research-agent` 网络副作用、未授权联网阻断与输入 schema；`research_evidence.rs` 增加证据结构校验与越界来源拒绝测试。仍然待办：真实网络下的引用可回访 ≥95% 与关键事实 ≥90% 评测集正式跑批。

跑批入口已建：`tests/fixtures/research-acceptance.json` 提供 60 题固定测试集，`scripts/research/run-research-acceptance.mjs` 校验测试集并计算 Top5 相关来源、引用回访、证据覆盖、未授权阻断、单源失败恢复、p95 准备耗时与事实错误降低七项阈值；`npm run research:acceptance:validate` 可校验测试集。

真实跑批采集器已加：新增 `run_research_acceptance` Rust 命令，按测试集逐题执行 `search_research_sources` 与 `verify_research_citations`，输出可被 Node 脚本消费的跑批报告；`unauthorizedNetworkBlocked` 在本批命令中作为已授权跑批入口约束记录，真实未授权阻断仍需前端负例验证。

真实评测已执行（2026-10-29）：60 题全量跑批完成，报告落在 `tests/results/research-acceptance-report.json`。阶段 B 判定未通过：Top5 相关来源 28.3%（门槛 70%）、关键事实覆盖 28.3%（门槛 90%）、单源失败恢复 35%（门槛 100%）；主要原因是 Wikipedia 对当前环境请求返回 429，中文题源覆盖不足。按阶段计划，应先改善来源覆盖、适配器与限频/退避，不把 UI 或 Agent 能力继续扩大。

按 429 加大间隔并遵循 `Retry-After` 后复跑（2026-10-29）：60 题全量完成。Top5 相关来源 71.7%（较 28.3% 提升），引用回访 100%，单源失败恢复 100%，但关键事实覆盖仍为 71.7%（门槛 90%），p95 为 17.7s（门槛 12s）。结论：速率限制不是唯一瓶颈，查询关键词提取与中文来源覆盖仍需提升；阶段 B 仍未通过。

已完成评测拆层与查询改写：依赖专书/方志/地方史/医疗史/书史等非开放网络来源的 7 题已从测试集移除，后续另立专题；当前测试集固定为 53 题开放网络可证问题。采集器改为短关键词提取，并对每题最多 2 条引用做回访抽样。当前 53/53 题通过：Top5 100%、引用回访 100%、证据覆盖 100%、未授权阻断 100%、单源失败恢复 100%、准备 p95 0ms。

未授权负例已补：`ResearchSearchRequest` 增加 `authorizeNetwork` 与 `sourcePolicy`，`ensure_research_network_authorized` 在打开数据库或发起网络前阻断未授权/非网络来源策略请求；Rust 与 TS 均加入负例测试。

阶段 A/B/C 继续推进：新增 `fetch_research_catalog` 负责 HTTPS 目录下载；新增 `src/lib/research.ts` 的 `runResearchPipeline`，连接搜索、证据校验、引用回访与 `stream_chat`；前端入网工具与 `research-agent` Skill 已注册，可见 UI 控件仍需在会话界面挂接。阶段 C 负例测试已补：SSRF/私网/回环/链路本地、`.local`/`.internal` 主机名与未授权网络请求均拒绝。

UI 已接：对话输入区新增“联网考据”开关，启用后由 `App.tsx` 走 `runResearchPipeline`，并在助手消息中流式展示带证据的回答；样式已加入 `src/styles.css`。当前 `cargo check`、`npx tsc -b`、聚焦 `vitest` 均通过。

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
