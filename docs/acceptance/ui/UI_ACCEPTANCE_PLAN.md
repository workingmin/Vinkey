# Vinkey 当前版本 UI 功能域验收工作计划

- 版本：`0.1.0`（Alpha）
- 更新日期：`2026-11-15`
- 适用阶段：Alpha；主观类验收项的后续版本边界见本文件 §8
- 适用环境：Windows/macOS 15+ 桌面环境；真实模型验收使用本地 Ollama 或已批准的兼容服务
- 统一生命周期：[UI_DESIGN.md](../../design/ui/UI_DESIGN.md) 的“统一验收生命周期”
- 脚本规范：[UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md)
- 脚本工作计划：[UI_ACCEPTANCE_SCRIPT_PLAN.md](./UI_ACCEPTANCE_SCRIPT_PLAN.md)

## 1. 目标与判断原则

本计划把“功能域分类”和“验收门槛”拆成两个维度：

- **功能域**回答“验收什么业务或承载边界”，使用 `D-*`；例如 `D-SHELL`、`D-NAV`、`D-MODEL`。
- **验收门槛**回答“在什么依赖成熟度下可以得出什么结论”，使用后缀：`P` 平台/结构、`F` fixture/合同、`E` 真实端到端、`R` 跨域回归。
- `W0`、`W1`、`W2`、`W3`、`W4` 是排期阶段，不是功能域编号。一个功能域可以在多个阶段出现，例如 `D-NAV` 同时有 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R`。

排序同时考虑四项：

1. **依赖可解锁性**：前置域未达到必要门槛时，后续域不能宣称完整通过。
2. **用户影响**：入口、模型和对话等高频/高影响域优先形成可用证据。
3. **跨层风险**：涉及窗口、桌面桥接、SQLite、凭据、真实模型和异步回写的域需要更高门槛。
4. **可独立执行性**：不依赖模型、可使用隔离 fixture 或纯 UI 的内容允许提前验收，但结论只能覆盖该门槛。

因此，“应用壳层与入口”可以先做 `W0-SHELL-P`，标题栏菜单也应进入 W0，但需要按依赖拆成两个子门槛：`W0-SHELL-MENU-P` 只验收菜单树、平台承载、窗口动作、主题、菜单关闭和无业务页面切换；`W0-SHELL-MENU-F` 验收项目/会话/编辑/设置入口与隔离 fixture 的实际交互链路。两者都属于 W0 大批次，但不能把 fixture 链路误报为纯平台通过；真实模型、多轮会话、语义标题和全局搜索仍分别等待 W1/W2。

## 2. 功能域分类

| 功能域 ID | 功能域 | 责任文档 | 主要依赖 |
| --- | --- | --- | --- |
| `D-SHELL` | 应用壳层与入口承载 | `UI_DESIGN_SHELL.md` | 无 |
| `D-NAV` | 工作区、项目、会话、搜索导航 | `UI_DESIGN_NAVIGATION.md` | `D-SHELL`；真实链路还需 `D-CHAT` |
| `D-EDITOR` | 文件与编辑器基础链路 | `UI_DESIGN_EDITOR.md` | `D-SHELL`、工作区/文件桥接 |
| `D-MODEL` | 模型设置与本地模型准入 | `UI_DESIGN_SETTINGS.md` | `D-SHELL`、桌面桥接、SQLite、凭据库 |
| `D-INTENT` | IntentRouter 真实模型准入 | `../../design/agent/intent-router/` | `D-MODEL`、真实模型服务 |
| `D-CHAT` | 对话、流式生成和模型状态 | `UI_DESIGN_CHAT.md` | `D-SHELL`、`D-MODEL`、`D-INTENT` |
| `D-CONTEXT` | 工作区上下文、召回与分析 | 对话/架构专项文档 | `D-EDITOR`、`D-MODEL`、`D-CHAT` |
| `D-REVISION` | AI 改稿与 DiffProposal | `UI_DESIGN_EDITOR.md` | `D-EDITOR`、`D-MODEL`、`D-CHAT` |
| `D-TASK-LOG` | 日志中心与长任务 | `UI_DESIGN_LOGS.md` | `D-SHELL`；真实任务需 `D-MODEL`、`D-CHAT`，分析任务还需 `D-CONTEXT` |
| `Q-RESP` | 全局响应式、主题、焦点和平台视觉回归 | `UI_DESIGN_SYSTEM.md`、`UI_DESIGN_STATES.md` | 壳层基线；全页面完成后复审 |

## 3. 当前版本工作计划表

| 验收标识 | 功能域 | 门槛含义 | 前置依赖 | 可证明范围 | 主要产出与报告 |
| --- | --- | --- | --- | --- | --- |
| `W0-SHELL-P` | `D-SHELL` | 平台/结构 | 无；能启动桌面或浏览器演示 | 应用窗口/Overlay、窗口控制、侧栏容器、内容页切换、设置/诊断承载、主题/焦点和响应式结构；不判定菜单树或菜单命令 | `macos/UI_ACCEPTANCE_MACOS_SHELL.md` / `windows/UI_ACCEPTANCE_WINDOWS_SHELL.md` |
| `W0-SHELL-MENU-P` | `D-SHELL` | 平台/结构 | `W0-SHELL-P`；目标桌面包和平台权限 | 目标一级菜单树、平台菜单承载、窗口动作、主题、Escape/外部点击、中文审计；不证明业务数据链路 | `macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md` / `windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md`（P 子集） |
| `W0-RESP-P` | `Q-RESP` | 平台/结构 | `D-SHELL` 布局和 Token | `1440x900`、`1280x800`、`1024x680`、窄窗口、焦点、主题和无重叠基线 | 响应式专项记录（待建立） |
| `W0-NAV-F` | `D-NAV` | fixture/合同 | 桌面桥接、SQLite、隔离临时目录 | 多项目、多会话、切换、删除边界、当前侧栏搜索和错误重试；不要求 Ollama | `macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md` / `windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md` |
| `W0-EDITOR-F` | `D-EDITOR` | fixture/合同 | 工作区/文件桥接 | 文件树、打开、编辑、保存、Unicode 路径、保存错误和越界 | `UI_ACCEPTANCE_EDITOR.md` |
| `W0-SHELL-MENU-F` | `D-SHELL` + 入口 fixture | fixture/合同 | `W0-SHELL-MENU-P`、`W0-NAV-F`、`W0-EDITOR-F`；设置入口使用可控 UI fixture | 项目添加/刷新、新建会话、查看页面状态保持、编辑焦点命令、设置打开/返回；不要求 Ollama 或真实多轮会话 | `macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md` / `windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md`（F 子集） |
| `W1-MODEL-E` | `D-MODEL` | 真实端到端 | `D-SHELL`、桌面桥接、SQLite、系统凭据库 | profile、服务、连接测试、活动模型、凭据边界、硬件提示和真实 Ollama | `macos/UI_ACCEPTANCE_MACOS_SETTINGS.md` / `windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md` |
| `W1-INTENT-E` | `D-INTENT` | 真实端到端 | `D-MODEL` 与真实模型 | IntentRouter 真实输出、schema、失败归因和准入日志 | `acceptance/intent-router/TEST_ACCEPTANCE.md` |
| `W2-CHAT-E` | `D-CHAT` | 真实端到端 | `D-SHELL`、`D-MODEL`、`D-INTENT` | 多轮发送、流式完成、停止、超时、失败恢复和活动模型快照 | 对话专项报告（待建立） |
| `W2-NAV-E` | `D-NAV` | 真实端到端 | `W0-NAV-F`、`W2-CHAT-E` | 多项目多会话、标题生命周期、刷新持久化、目标全局搜索和跳转 | `macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md` / `windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md` |
| `W3-CONTEXT-E` | `D-CONTEXT` | 真实端到端 | `W0-EDITOR-F`、`W1-MODEL-E`、`W2-CHAT-E` | 上下文范围、召回、预算、来源收据、权限和分析结果 | 上下文专项报告（待建立） |
| `W3-REVISION-E` | `D-REVISION` | 真实端到端 | `W0-EDITOR-F`、`W2-CHAT-E` | 真实模型改稿、DiffProposal、接受/拒绝、冲突和保存 | `UI_ACCEPTANCE_EDITOR.md` |
| `W4-TASK-E` | `D-TASK-LOG` | 真实端到端 | `W2-CHAT-E`；分析任务还需 `W3-CONTEXT-E` | 长任务进度、暂停/失败/恢复、步骤重试、产物和执行快照 | [长任务/日志中心专项验收（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) / [Windows](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md)；原生复验清单按平台拆分：[macOS](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md) / [Windows](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md)，共享合同见 [TASK_PROCESS_NATIVE_ACCEPTANCE.md](./TASK_PROCESS_NATIVE_ACCEPTANCE.md) |
| `W4-NAV-R` | `D-NAV` | 跨域回归 | `W2-NAV-E`、`W3-REVISION-E`、`W4-TASK-E` | 运行中任务、生成中会话、未保存文档和过期搜索响应下的切换/删除保护 | `macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md` / `windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md` |
| `W4-RESP-R` | `Q-RESP` | 跨域回归 | 各页面已形成实现 | 全页面视觉、主题、焦点、DPI、平台菜单和状态保持回归 | 响应式/跨域回归记录 |

> `Q-RESP`、`W0-RESP-P`、`W4-RESP-R` 的**范围本身不缩减**：尺寸、视口、状态保持、无横向溢出、机器探针、焦点读回等客观断言仍属 Alpha；其中依赖人眼观感、视觉审美或设计评审的部分按 §8 登记为后续版本验收项。功能域 `Q-RESP` 与这两个门槛 ID 均不删除、不改名。

### 3.1 “模型设置”与“应用壳层”的排序论证

| 对比项 | `D-SHELL` / `W0-SHELL-P` | `D-MODEL` / `W1-MODEL-E` |
| --- | --- | --- |
| 可否先启动 | 可以；窗口、菜单、侧栏容器和内容区不需要真实模型 | 可在壳层入口可达后启动，但完整结论需要桌面桥接、SQLite 和凭据库 |
| 可证明什么 | 用户能进入功能域，平台承载、尺寸和键盘路径稳定 | profile、服务、连接、活动模型、凭据边界和真实模型准入可用 |
| 不能证明什么 | 不能证明设置保存、模型连接、对话或分析可用 | 不能替代壳层在各平台、尺寸和内容页下的结构验收 |
| 对后续作用 | 提供所有功能域的可达承载 | 解锁真实对话、IntentRouter、上下文分析、AI 改稿和长任务 |

结论是“壳层平台验收先行，模型设置真实业务紧随其后”，而不是将整个壳层业务一次性放在模型设置之后。项目/会话导航再按 `F/E/R` 分阶段，避免用静态入口截图替代深度业务链路。

## 4. 统一证据链

每个功能域报告必须按以下顺序记录：

1. 功能域：`D-*`、`BF-*`、`EP-*`、用户目标和前置条件。
2. 竞品证据：正式竞品名、具体功能、来源 URL、观察日期、证据等级和“直接参考/组合改造/原创/暂不采用”。
3. 设计决策：`CF-*`、采用范围、隐私边界、失败/恢复、响应式和无障碍。
4. 前后端实现：React、桌面桥接、Rust/Tauri、存储、权限和异步边界。
5. 自动化测试代码：组件、纯函数、桥接、数据库和合同测试。
6. 本地验收脚本：`.sh`、`.ps1`、参数、JSON schema、退出码、日志和脱敏。
7. 测试人员执行回传：OS、DPI、模型/profile、stdout/stderr、结果 JSON、截图/录屏和 SHA-256。
8. 验收报告：按门槛给出通过、条件通过、不通过或阻断，并列出未执行项和风险。
9. 复审：版本、竞品证据维护变化、用户反馈和回归范围。

## 5. 统一结论等级

- **通过**：该门槛的必要证据齐全，关键断言通过，无 P0/P1 阻断。
- **条件通过**：代码和当前范围证据满足，但有明确平台/手工/依赖待办；不能宣称完整发布通过。
- **不通过**：关键入口不可达、数据/权限边界失效、错误恢复缺失或业务断言失败。
- **阻断**：环境、模型、凭据、桌面依赖或缺少实现使结论不可得；不得改写脚本绕过。

**Alpha 阶段的待办分类**（不新增结论等级、不改变上述定义）：`条件通过` 中的待办拆成两类，分别处理，不得互相顶替。

- **客观待办**：机器断言、目标平台执行、依赖实现、`BLOCKED` / `NOT_APPLICABLE` 用例等可核对项。仍计入 Alpha 结论，必须逐项列出并留痕，不得因排期而删除或改写。
- **主观待办**：需要人为主观判断、设计/领域专家评审或用户调研才能完成的验收项，按 §8 登记为 `DEFERRED_AFTER_ALPHA`。这类项在 Alpha 内**不作为结论的前置条件**，但必须在报告中以「后续版本验收项」单独列出；不得删除，不得写成 `PASS`，也不得据此把 `条件通过` 升级为 `通过` / `专项通过` / `完整通过`。

**Alpha 发布口径**：允许携带「条件通过 + 已登记的后续版本验收项」发布；不得把上述任何调整解释为发布通过、跨平台发布通过、视觉/体验已验收或功能完备的证明。

## 6. 执行顺序与复审

1. 先执行 `W0-SHELL-P`、`W0-SHELL-MENU-P` 和 `W0-RESP-P`，确认所有后续功能域有稳定承载；不配置模型。
2. 并行执行 `W0-NAV-F` 和 `W0-EDITOR-F`，只使用隔离 fixture/临时工作区；依赖就绪后执行同一 W0 大批次内的 `W0-SHELL-MENU-F`。基础合同通过不等于真实链路通过。
3. 执行 `W1-MODEL-E`，再执行 `W1-INTENT-E`，确认真实 Ollama/profile 可准入。
4. 执行 `W2-CHAT-E`；完成真实消息数据后执行 `W2-NAV-E`，验证标题生命周期和搜索跳转。
5. 执行 `W3-CONTEXT-E`、`W3-REVISION-E`，将 AI 改稿与基础编辑器结论分开。
6. 执行 `W4-TASK-E`、`W4-NAV-R` 和 `W4-RESP-R`，完成长任务、未保存、运行中和平台回归。
7. 每个门槛按 [UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md) 生成或复用脚本；先完成本地运行与人工 UI 观察中的**客观条目**，回填平台层结论。人工观察表中的主观/专家/用户判断条目已从各功能域验收范围划出，集中至 [§8.5 人工复核统一批次](#85-人工复核统一批次自动化验收完成后统一处理)，在所有自动化验收脚本跑完后再统一处理；机器证据链（`result.json`、`SHA256SUMS`、`provenance`、退出码）不受此例外影响。
8. 每次版本发布重跑 P0 及受影响的依赖域；模型、提示合同、输出 schema 或竞品证据改变时，重跑相关 E/R 门槛。

## 7. 当前版本阻断摘要

| 项目 | 当前状态 |
| --- | --- |
| 壳层结构 | 已有实现和历史单元测试；目标平台截图、直接渲染覆盖仍待补 |
| 导航 fixture | `W0-NAV-F` 脚本已就绪（`UI-ACC-NAV-FIXTURE-001`）；目标平台执行属客观遗留项仍按原门槛列出，目标平台人工材料（视觉/交互观感部分）已集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理) 人工复核事项 |
| 编辑器 fixture | `W0-EDITOR-F`（`UI-ACC-EDITOR-001`）本机已执行：CLI 6/6 + 合同测试 10/10；目标平台 WebView 客观证据由 `UI-ACC-EDITOR-WEBVIEW-001` 采集（6/6），人工 UI 观察已集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理) 人工复核事项（待自动化全部完成后统一处理） |
| 标题栏菜单 fixture | `W0-SHELL-MENU-F` 独立门槛 `UI-ACC-TITLE-BAR-FIXTURE-001` 已执行，`F=PASS`（`TB-MENU-004=PASS`、13/13 覆盖）；`W0-SHELL-MENU-P` macOS 原生批次已执行，`P=PASS`，13/13 覆盖，`TB-MENU-003-GLOBAL-SEARCH=PASS`、`TB-MENU-008=PASS`（全屏 `score=3 / verdict=fullscreen`、Reopen `0→1`）；app 按最终 HEAD 重建，WebView / P / F 三批 `provenance=PASS`。专项整体在 Alpha 客观自动化范围内达成**专项通过**：`W0-EDITOR-F` 人工 UI 观察与 `DEFER-UI-001` 已集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理) 人工复核事项，不再作为本专项遗留项；Windows 独立专项未执行不计入本 macOS 结论；`W0-EDITOR-F` 目标平台 WebView 客观证据已采集、目录取消保态已按 AX/CG 双信号判为 `preserved`；整体仍不得宣称跨平台发布通过（Windows 独立专项 + 人工复核事项统一后置） |
| 会话语义标题 | 临时标题/语义升级/手动重命名已实现（`conversationTitle.ts`、侧栏入口）；`CF-022` 已参考，`W2-NAV-E` 真实模型端到端用例阻断 |
| 全局搜索面板 | `CF-023` 统一搜索面板已落地：原生「会话 > 搜索项目与会话」、`⌘/Ctrl+K`、Windows 自绘菜单三入口，按项目/会话/当前项目文档分组并可跳转；`TB-MENU-003-GLOBAL-SEARCH` 为客观 `PASS`。目标平台人工材料（视觉/交互观感部分）已集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理) 人工复核事项 |
| 真实模型链路 | `W1-MODEL-E` macOS 已按最终 HEAD 复跑：Ollama 原生 `/api/*` 与 `/v1/*` 兼容层双协议 10/10 PASS、系统凭据库 5/5 PASS、组件/合同/Rust 模型域测试全绿、`provenance=PASS`；模型设置专项在 Alpha 客观范围达成**专项通过**。外部独立 OpenAI-compatible 服务与 Windows 独立专项仍按原门槛列为客观遗留，见 [macOS 设置报告](./macos/UI_ACCEPTANCE_MACOS_SETTINGS.md) |
| 长任务/日志中心 | `UI-ACC-LOGS-001` 已在 macOS 本机执行：真实 Ollama CLI 驱动（`npm run test:task-process-ollama-driver`）经生产 `worker_service.rs` pipeline 产出真实 `.vinkey/analysis/jobs/<jobId>/` 产物，`TASK-CHK-001`~`007` 7/7 PASS、事件 sequence 连续且终态事件均带 `endedAt`、`provenance=PASS`、`SHA256SUMS` 逐文件重算全部校验通过；专项在 Alpha 客观范围达成**专项通过**。证据边界：CLI 驱动 + 真实模型，**非桌面 UI 发起**，不证明桌面交互行为。桌面原生 runner `UI-ACC-TASK-NATIVE-001`（`npm run test:task-process-native-mac`）以真实 Tauri app + 隔离 fixture + AX 自动化采集 `NT-MAC-001`~`005` 的客观断言并达成 Alpha 客观范围**专项通过**（`decision.specialityPass=true`）；`NT-MAC-003` 以暂停态播种为前置，修改真实源文件后在真实 app 中按「继续处理」，由生产后端复核指纹并写入失败终态、CP-35 提示与 `worker.compatibility_mismatch`，脚本读回且不沿用旧检查点；截图与状态/段标签/控件读回已归档，观感/易理解性归 §8.5，不虚标 PASS。`NT-001..NT-005` 按平台拆分为 macOS `NT-MAC-001`~`005` 与 Windows `NT-WIN-001`~`005`（独立专项客观后置）；9 个 `TASK-UI-*` 主观/人工观察按 `DEFER-UI-006` 集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理)；共享合同与分派索引见 [TASK_PROCESS_NATIVE_ACCEPTANCE.md](./TASK_PROCESS_NATIVE_ACCEPTANCE.md) |
| 主观类验收项 | 按 §8.3 登记为 `DEFERRED_AFTER_ALPHA`（共 12 项）并集中至 [§8.5](#85-人工复核统一批次自动化验收完成后统一处理) 人工复核事项，已从功能域验收范围摘除，不作为 Alpha 结论前置、不计入本表阻断口径；必须在发布说明中单独列出，不得写成通过或删除 |

> 本表是当前版本的阻断摘要，各专项最新状态以专项报告和 [脚本编写计划](./UI_ACCEPTANCE_SCRIPT_PLAN.md) 矩阵为准。`CF-023` 统一面板为按项目/会话/当前项目文档分组的统一搜索面板，侧栏内联输入框为「快速筛选」，不冒充全局搜索；`TB-MENU-003-GLOBAL-SEARCH` 为客观 `PASS`。本计划的功能域与用例范围不因执行结果调整。

## 8. Alpha 阶段边界与主观类验收项延期

> 本节是全仓库**唯一权威**的后续版本验收项登记表。其他验收计划只引用本节，不另建清单，避免多处口径漂移。本节只调整**计划层的排期与前置条件**，不改判定规则、不改用例清单、不追溯改写既有批次结论。

### 8.1 阶段定义

- **Alpha**：当前版本 `0.1.0` 及其验收批次。目标是验证功能域可达、机器证据链可追溯、客观断言可复跑；不追求视觉/体验定稿。
- **后续版本**：Alpha 之后的首个发布候选版本。具体版本号与时间点由产品另行确定，本计划不臆定。
- `DEFERRED_AFTER_ALPHA` 是**计划层排期状态**，不是 `result.json` 的 `cases[].status` 取值；不改变 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE` 语义，不参与用例覆盖率计算，也不写入任何既有批次的机器结果。

### 8.2 划出标准与保留边界

同时满足以下任一条件的验收项划出 Alpha：

1. 结论依赖人的观感、审美或主观体验，缺少客观判据；
2. 结论需要设计、产品或领域专家作价值判断、评审或签字；
3. 结论需要用户调研、用户反馈、可用性测试或真实用户场景样本。

**不划出，必须留在 Alpha**：

- 全部机器断言、合同测试、隔离 fixture、SQLite/文件桥接、真实模型链路、退出码、`SHA256SUMS`、`provenance`、构建溯源与脱敏；
- 客观可自动化的窗口与焦点行为：`TB-MENU-008` 的全屏状态、Reopen 恢复、关闭后窗口隐藏、目录选择取消保态、`AXTextArea` 焦点读回，以及 `TB-MENU-011` 的英文残留字符串审计、`TB-MENU-006` 的主题切换像素比对；
- 所有 `D-*` / `Q-*` 功能域、13 个 `TB-MENU-*` 用例 ID、`W0`~`W4` 门槛、`P/F/E/R` 判定规则——**一个都不删、不合并、不改名、不放宽断言**；
- 功能未实现 / 目标平台未执行 / 依赖缺失 / 真实链路未回传类**客观**遗留项：Windows 平台执行、外部独立 OpenAI-compatible 服务的真实链路回传。这些不是主观判断，仍按原门槛逐项列出，不因本节而消失；Ollama 原生与本机 `/v1` 兼容层已回传，不等于外部独立服务已验收。`W0-EDITOR-F` 目标平台 WebView 结构/内容/保存状态栏客观证据与目录选择取消保态已由机器判据完成，不再列为未完成客观项。**注意**：`W0-EDITOR-F` 的人工 UI 观察（视觉质量、交互手感、无障碍观感）属主观判断，按 §8.2 划出标准第 1 条划出，集中至 §8.5 人工复核事项，不再作为本功能域/专项的客观遗留项。

上述两类边界的拆分原则：**同一个物理动作，客观读回留在 Alpha，人眼观感划到后续版本**。例如「全屏是否进入原生 Space」由 AX/CG 判据验证，「全屏看起来对不对」才属延期项。

### 8.3 后续版本验收项登记表（唯一权威，共 12 项）

| 编号 | 延期验收项 | 归类 | Alpha 内仍须保留的客观部分 | 原位置（示例） | 后续版本完成条件 |
| --- | --- | --- | --- | --- | --- |
| `DEFER-UI-001` | 帮助/诊断弹窗的**视觉质量、交互完成度与无障碍观感**（当前 `window.alert` 低保真） | 视觉/主观 | 触发、关闭、焦点返回、脱敏、构建溯源仍验；`alert` 只计「动作可触发」 | 两份 `*_TITLE_BAR_PLAN.md` §3 `TB-MENU-009`；`TITLE_BAR_DESIGN.md` 帮助菜单节 | 弹窗换为正式 UI，且设计/产品完成视觉与无障碍评审 |
| `DEFER-UI-002` | 全页面视觉回归、深浅主题视觉一致性、WCAG AA 对比度、中文 IME、减少动态效果 | 视觉/专家 | `W0-RESP-P` / `W4-RESP-R` 的尺寸、状态保持、无横向溢出等机器断言仍验 | 本文件 §3 `Q-RESP`；`UI_DESIGN_SYSTEM.md`、`UI_DESIGN_STATES.md` | 全页面实现完成且设计系统评审通过 |
| `DEFER-UI-003` | 窗口/Overlay 避让观感、自绘标题栏观感、布局「无重叠/遮挡/跳动」的**目视**判断 | 视觉/主观 | 窗口尺寸、DPI 数值、结构截图、机器探针仍验 | 壳层回填模板 §4.1 `SHELL-P-001` / `SHELL-P-007` | 设计给出可判定的视觉基线并组织评审 |
| `DEFER-UI-004` | 物理 DPI 的**人工 fallback 目视**判定 | 视觉/主观 | `display-metadata.json` 机器探针、脱敏与归档仍验；尺寸缺失仍如实记 `BLOCKED` | `UI_ACCEPTANCE_SCRIPT_SPEC.md` §9.1；壳层回填模板 | 显示探针可稳定取得物理尺寸，或设计给出人工判定规范 |
| `DEFER-UI-005` | 发布前截图目视确认、全屏状态目视复核等「最后一道手续」 | 视觉/主观 | 全屏 AX/CG 状态、Reopen、窗口状态等客观读回仍按脚本验 | 导航报告 §8；标题栏报告 §5.2 | 客观判据自动化完成后，由后续版本决定该手续是否保留 |
| `DEFER-UI-006` | 任务过程文案的易理解性/友好性、UX 可理解性（`CP-*` 文案预期、`UX-16/17`、`TASK-UI-*` 主观预期） | 专家/用户 | 文案存在性、状态映射、`TASK-CHK-*` 机器核查与流程断言仍验 | `TASK_PROCESS_COPY_DESIGN.md` §5/§12；任务过程回填模板 §5 | 整体评审通过，并取得用户侧可理解性反馈 |
| `DEFER-UI-007` | 设计评审 / 页面评审 / 整体评审，含各「待评审」草案批量转正 | 专家 | 不改动已实现代码与已执行的机器结果 | `UI_DESIGN.md` 页面评审节；`TASK_PROCESS_COPY_DESIGN.md` 状态头 | 产品/设计组织评审并留下书面结论 |
| `DEFER-UI-008` | 竞品体验对比、设计判断、用户价值判断、单次体验记录 | 专家/用户 | 竞品证据的「已登记 / 已参考」事实与文档一致性仍核对 | `docs/competitors/`、`COMPETITOR_REPORT_TEMPLATE.md`、`FEATURE_DECISIONS.md` | 有稳定的比较口径与足够的观察样本 |
| `DEFER-UI-009` | 用户调研、用户反馈、用户意见、用户可协助补充的竞品观察 | 用户调研 | —（无客观替代部分，整项延期） | 本文件 §4 第 9 步；`TASK_PROCESS_COPY_DESIGN.md` §11 | 完成用户调研/反馈闭环，记录样本与结论 |
| `DEFER-UI-010` | 中文菜单与快捷键文案的**语义得体性**、首版菜单减法的产品价值判断 | 专家 | `TB-MENU-011` 英文残留字符串审计、`TB-MENU-012` 禁止项存在性检查仍是客观断言，必须留在 Alpha | 两份 `*_TITLE_BAR_PLAN.md` §3 `TB-MENU-011/012` | 产品/设计给出文案与减法的书面判断 |
| `DEFER-UI-011` | 跨文档 `CF-023` 口径的产品/设计复核 | 专家 | 代码与文档的事实核对仍保留 | 标题栏报告 §6；导航报告 §8 | 产品/设计给出统一口径 |
| `DEFER-UI-012` | M6 报告复审中**针对上述主观项**的设计/产品签字 | 治理/专家 | M6 对机器证据、客观遗留项与延期登记完整性的复核仍留在 Alpha | 两份 `*_TITLE_BAR_PLAN.md` §7 M6；[脚本计划](./UI_ACCEPTANCE_SCRIPT_PLAN.md) §2 阶段 9 | 主观项在后续版本完成验收后一并签署 |

### 8.4 结论与发布口径（不得虚标）

1. **延期 ≠ 通过**：任何 `DEFER-UI-*` 不得写成 `PASS`，不得从用例清单或报告中删除，不得计入通过数，不得用于消除 `BLOCKED` / `NOT_APPLICABLE`。
2. **不追溯改写**：`artifacts/**/result.json` 与已发布专项报告仍是各自批次的权威结论。本次只调整计划层排期与前置条件；脚本不新增状态值、不改判定规则、不改批次结论。
3. **Alpha 结论仍按 §5 与各专项 §6 判定，但主观/人工判断项已从功能域验收范围摘除**。当前标题栏与功能菜单专项（macOS）在 Alpha 客观自动化范围内达成**专项通过**：`P=PASS`、`F=PASS`、`TB-MENU-008=PASS`、全局搜索客观 `PASS`、构建溯源 `provenance=PASS`、13/13 覆盖均已达成；`W0-EDITOR-F` 人工 UI 观察与 §8.3 主观类项（`DEFER-UI-001`~`012`）已集中至 §8.5 人工复核事项，不再作为本专项的遗留项或条件通过原因。Windows 独立专项未执行不计入本 macOS 专项判定；人工复核事项为所有自动化验收脚本跑完后的统一后置阶段，故整体仍**不宣称跨平台发布通过 / 完整发布通过**（见 §8.5）。
4. **发布说明必须同时列出**：客观遗留项 + §8.3 全表 + §8.5 人工复核批次（统一后置） + 各专项当前结论（标题栏与功能菜单专项、模型设置专项均为「专项通过（Alpha 客观范围）」；壳层等仍含人工材料待回填的专项按其自身结论如实标注）；不得声称功能完备、视觉/体验已验收或跨平台发布通过。
5. **后续版本启动时**，§8.3 全表自动转入该版本验收范围；仍未完成的项继续标 `DEFERRED_AFTER_ALPHA`，不得静默丢弃。

### 8.5 人工复核统一批次（自动化验收完成后统一处理）

将需要专家/用户判断或脚本无法完成的验收项从各功能域验收计划中摘除，集中到本批次，待**所有自动化验收脚本（功能域 Alpha）跑完后再由测试人员统一回填**。本批次不删除任何验收项，仅调整归口与执行顺序，保证验收项完整性。

**纳入范围（划出标准 §8.2 第 1–3 条）**：

- 全部 12 项 `DEFER-UI-001`~`DEFER-UI-012`（视觉质量、交互完成度、无障碍观感、设计/产品评审、用户调研、竞品体验、治理签字等），原登记见 §8.3。
- 各功能域人工 UI 观察：`W0-EDITOR-F` 人工 UI 观察（视觉质量、交互手感、无障碍观感）、`W0-NAV-F` 目标平台人工材料、`CF-023` 目标平台人工材料（视觉/交互观感部分，客观结构已由 `TB-MENU-003-GLOBAL-SEARCH` 验证）、`W2-NAV-E` 真实模型端到端人工观察（如适用）、`W1-MODEL-E` 模型设置专项人工 UI 观察（设置页观感、键盘与窗口缩放目视、真实 app 端到端删除密钥人工确认；客观部分已由组件自动化与 Keychain 批次覆盖）、`W4-TASK-E` 长任务原生复验人工 UI 观察与桌面 UI 发起的端到端材料（暂停/恢复、停止确认、折叠/自动跟随、产物预览、重启恢复、源变化拒绝、失败重试、窄栏/键盘等主观观感与人工确认部分，按 `DEFER-UI-006` 归口；本专项客观证据由 CLI 驱动 + 真实 Ollama + 生产 pipeline 产出，非桌面 UI 发起，因此桌面发起材料仍由测试人员统一回填；事件序列、段标签、终态与产物读回、状态映射和流程断言等客观部分已由 `UI-ACC-LOGS-001` 在 Alpha 完成；状态栏/段标签/暂停继续控件/折叠展开/重启恢复与源变化拒绝的客观触发另由 `UI-ACC-TASK-NATIVE-001` 真实 app + AX 自动化判定；CP-35 文案易理解性与全部观感/易理解性项仍由测试人员统一回填）。
- 其他经 §8.2 划出的主观/专家/用户判断项。

**执行顺序（修订 §6 第 7 步）**：

1. 先执行全部功能域自动化验收脚本（壳层、导航、编辑器、标题栏 P/F、模型、意图、长任务等），取得机器证据链；
2. 最后统一执行本人工复核批次：测试人员按上表逐项回填人工观察 / 专家评审 / 用户反馈结论；
3. 人工复核批次结论单独记录，不回溯改写各功能域自动化批次的 `result.json`。

**结论口径**：

- 功能域自动化验收（Alpha 客观范围）在客观项全 PASS 时判「专项通过」，专项不因此被降级；
- 整体发布结论受 Windows 独立专项（客观后置、未执行）与人工复核批次（统一后置）约束，仍不得宣称「跨平台发布通过 / 完整发布通过」；
- `DEFER-UI-*` 在人工复核批次完成前仍不得写成 `PASS`、不得删除。

## 附录：相关文档

- [UI 设计总览](../../design/ui/UI_DESIGN.md)
- [应用壳层设计](../../design/ui/UI_DESIGN_SHELL.md)
- [项目与会话导航设计](../../design/ui/UI_DESIGN_NAVIGATION.md)
- [项目与会话导航验收（macOS）](./macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md)
- [项目与会话导航验收（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md)
- [标题栏菜单专项验收计划（macOS）](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)
- [标题栏菜单专项验收报告（macOS）](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md)
- [标题栏菜单专项验收计划（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)
- [模型设置验收（macOS）](./macos/UI_ACCEPTANCE_MACOS_SETTINGS.md)
- [长任务/日志中心专项验收（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md)
- [长任务/日志中心专项验收（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md)
- [长任务过程原生复验清单（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md)
- [长任务过程原生复验清单（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md)
- [长任务过程原生复验清单（共享合同与平台任务分派索引）](./TASK_PROCESS_NATIVE_ACCEPTANCE.md)
- [模型设置验收（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md)
- [长任务/日志中心验收（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md)
- [长任务/日志中心验收（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md)
- [长任务/日志中心回填模板（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md)
- [长任务/日志中心回填模板（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md)
- [验收脚本设计规范](./UI_ACCEPTANCE_SCRIPT_SPEC.md)
