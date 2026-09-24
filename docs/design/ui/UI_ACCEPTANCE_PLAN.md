# Vinkey 当前版本 UI 功能域验收工作计划

- 版本：`0.1.0`
- 更新日期：`2026-09-24`
- 适用环境：Windows/macOS 桌面环境；真实模型验收使用本地 Ollama 或已批准的兼容服务
- 统一生命周期：[UI_DESIGN.md](./UI_DESIGN.md) 的“统一验收生命周期”
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
| `W0-SHELL-P` | `D-SHELL` | 平台/结构 | 无；能启动桌面或浏览器演示 | 应用窗口/Overlay、窗口控制、侧栏容器、内容页切换、设置/诊断承载、主题/焦点和响应式结构；不判定菜单树或菜单命令 | `UI_ACCEPTANCE_SHELL.md` |
| `W0-SHELL-MENU-P` | `D-SHELL` | 平台/结构 | `W0-SHELL-P`；目标桌面包和平台权限 | 目标一级菜单树、平台菜单承载、窗口动作、主题、Escape/外部点击、中文审计；不证明业务数据链路 | `UI_ACCEPTANCE_TITLE_BAR_PLAN.md`（P 子集） |
| `W0-RESP-P` | `Q-RESP` | 平台/结构 | `D-SHELL` 布局和 Token | `1440x900`、`1280x800`、`1024x680`、窄窗口、焦点、主题和无重叠基线 | 响应式专项记录（待建立） |
| `W0-NAV-F` | `D-NAV` | fixture/合同 | 桌面桥接、SQLite、隔离临时目录 | 多项目、多会话、切换、删除边界、当前侧栏搜索和错误重试；不要求 Ollama | `UI_ACCEPTANCE_NAVIGATION.md` |
| `W0-EDITOR-F` | `D-EDITOR` | fixture/合同 | 工作区/文件桥接 | 文件树、打开、编辑、保存、Unicode 路径、保存错误和越界 | `UI_ACCEPTANCE_EDITOR.md` |
| `W0-SHELL-MENU-F` | `D-SHELL` + 入口 fixture | fixture/合同 | `W0-SHELL-MENU-P`、`W0-NAV-F`、`W0-EDITOR-F`；设置入口使用可控 UI fixture | 项目添加/刷新、新建会话、查看页面状态保持、编辑焦点命令、设置打开/返回；不要求 Ollama 或真实多轮会话 | `UI_ACCEPTANCE_TITLE_BAR_PLAN.md`（F 子集） |
| `W1-MODEL-E` | `D-MODEL` | 真实端到端 | `D-SHELL`、桌面桥接、SQLite、系统凭据库 | profile、服务、连接测试、活动模型、凭据边界、硬件提示和真实 Ollama | `UI_ACCEPTANCE_SETTINGS.md` |
| `W1-INTENT-E` | `D-INTENT` | 真实端到端 | `D-MODEL` 与真实模型 | IntentRouter 真实输出、schema、失败归因和准入日志 | `design/agent/intent-router/TEST_ACCEPTANCE.md` |
| `W2-CHAT-E` | `D-CHAT` | 真实端到端 | `D-SHELL`、`D-MODEL`、`D-INTENT` | 多轮发送、流式完成、停止、超时、失败恢复和活动模型快照 | 对话专项报告（待建立） |
| `W2-NAV-E` | `D-NAV` | 真实端到端 | `W0-NAV-F`、`W2-CHAT-E` | 多项目多会话、标题生命周期、刷新持久化、目标全局搜索和跳转 | `UI_ACCEPTANCE_NAVIGATION.md` |
| `W3-CONTEXT-E` | `D-CONTEXT` | 真实端到端 | `W0-EDITOR-F`、`W1-MODEL-E`、`W2-CHAT-E` | 上下文范围、召回、预算、来源收据、权限和分析结果 | 上下文专项报告（待建立） |
| `W3-REVISION-E` | `D-REVISION` | 真实端到端 | `W0-EDITOR-F`、`W2-CHAT-E` | 真实模型改稿、DiffProposal、接受/拒绝、冲突和保存 | `UI_ACCEPTANCE_EDITOR.md` |
| `W4-TASK-E` | `D-TASK-LOG` | 真实端到端 | `W2-CHAT-E`；分析任务还需 `W3-CONTEXT-E` | 长任务进度、暂停/失败/恢复、步骤重试、产物和执行快照 | 日志/长任务专项报告（待建立） |
| `W4-NAV-R` | `D-NAV` | 跨域回归 | `W2-NAV-E`、`W3-REVISION-E`、`W4-TASK-E` | 运行中任务、生成中会话、未保存文档和过期搜索响应下的切换/删除保护 | `UI_ACCEPTANCE_NAVIGATION.md` |
| `W4-RESP-R` | `Q-RESP` | 跨域回归 | 各页面已形成实现 | 全页面视觉、主题、焦点、DPI、平台菜单和状态保持回归 | 响应式/跨域回归记录 |

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

## 6. 执行顺序与复审

1. 先执行 `W0-SHELL-P`、`W0-SHELL-MENU-P` 和 `W0-RESP-P`，确认所有后续功能域有稳定承载；不配置模型。
2. 并行执行 `W0-NAV-F` 和 `W0-EDITOR-F`，只使用隔离 fixture/临时工作区；依赖就绪后执行同一 W0 大批次内的 `W0-SHELL-MENU-F`。基础合同通过不等于真实链路通过。
3. 执行 `W1-MODEL-E`，再执行 `W1-INTENT-E`，确认真实 Ollama/profile 可准入。
4. 执行 `W2-CHAT-E`；完成真实消息数据后执行 `W2-NAV-E`，验证标题生命周期和搜索跳转。
5. 执行 `W3-CONTEXT-E`、`W3-REVISION-E`，将 AI 改稿与基础编辑器结论分开。
6. 执行 `W4-TASK-E`、`W4-NAV-R` 和 `W4-RESP-R`，完成长任务、未保存、运行中和平台回归。
7. 每个门槛按 [UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md) 生成或复用脚本；测试人员完成本地运行和人工 UI 观察后才回填平台层结论。
8. 每次版本发布重跑 P0 及受影响的依赖域；模型、提示合同、输出 schema 或竞品证据改变时，重跑相关 E/R 门槛。

## 7. 当前版本阻断摘要

| 项目 | 当前状态 |
| --- | --- |
| 壳层结构 | 已有实现和历史单元测试；目标平台截图、直接渲染覆盖仍待补 |
| 导航 fixture | 计划已定义；脚本和隔离本地执行材料待补 |
| 会话语义标题 | 当前仅首次输入 28 字符 fallback；`CF-022` 待参考，`W2-NAV-E` 相关用例阻断 |
| 全局搜索面板 | 当前只有侧栏内联搜索；`CF-023` 待参考，目标入口/跳转用例阻断 |
| 真实模型链路 | 依赖测试人员在 macOS/Windows + Ollama/profile 环境回传 |

## 附录：相关文档

- [UI 设计总览](./UI_DESIGN.md)
- [应用壳层设计](./UI_DESIGN_SHELL.md)
- [项目与会话导航设计](./UI_DESIGN_NAVIGATION.md)
- [项目与会话导航验收](./acceptance/UI_ACCEPTANCE_NAVIGATION.md)
- [标题栏菜单专项验收](./acceptance/UI_ACCEPTANCE_TITLE_BAR_PLAN.md)
- [模型设置验收](./acceptance/UI_ACCEPTANCE_SETTINGS.md)
- [验收脚本设计规范](./UI_ACCEPTANCE_SCRIPT_SPEC.md)
