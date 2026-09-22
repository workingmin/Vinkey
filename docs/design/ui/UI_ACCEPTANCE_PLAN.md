# UI 功能域测试验收工作计划

- 版本基线：当前版本 `0.1.0`
- 计划日期：2026-09-22
- 适用范围：Windows、macOS 桌面应用，以及浏览器演示模式的可交互部分
- 统一流程：功能域 → 竞品证据 → 设计决策 → 前后端实现 → 自动化测试代码 → 本地环境验收脚本 → 测试人员执行与证据回传 → 验收报告 → 遗留项复审

## 1. 目的与判定口径

本计划把 UI 评审从“页面看起来完成”扩展为可追踪的业务链路验收：用户从功能入口开始，经过表单、状态、异步操作和错误恢复，最终得到可解释且可持久化的业务结果。竞品材料用于说明设计来源和取舍，不作为“功能已经正确”的替代证据。由于真实 Ollama、系统凭据库、窗口行为和平台依赖无法由当前开发环境代替，自动化测试之后必须保留本地脚本执行和测试人员证据回传两个阶段。

每个功能域在验收时必须回答八个问题：

1. 用户从哪里进入，前置条件和返回路径是什么？
2. 交互过程中有哪些加载、空态、失败、禁用和恢复状态？
3. 哪些设计有正式竞品证据，哪些是组合改造或 Vinkey 原创？
4. 前端 UI、桌面桥接、Rust/SQLite 数据边界是否与设计一致？
5. 自动化测试和手工 UI 测试覆盖了哪些业务链路，未覆盖什么？
6. 结论是通过、条件通过还是不通过，遗留风险和下一次复审是什么？
7. 本地环境脚本使用了什么 OS、模型、profile、套件版本、命令和退出码？
8. 测试人员上传了哪些机器输出、人工观察、截图/录屏和 SHA-256，哪些项目仍待回填？

## 2. 统一阶段与交付物

| 阶段 | 核对内容 | 必交付物 | 通过条件 |
| --- | --- | --- | --- |
| 1. 功能域定义 | 入口、目标、前置条件、状态和跨页返回 | `BF-*`/`EP-*` 登记；业务链路图 | 每项业务目标都有入口和结果 |
| 2. 竞品证据 | 正式竞品、具体功能、来源、观察日期、证据等级 | 竞品证据卡；引用 `COMPETITOR_CATALOG.md`、`FEATURE_DECISIONS.md` | 直接参考、组合改造、原创、暂不采用明确分栏 |
| 3. 决策设计 | 采用范围、隐私边界、失败策略、响应式和无障碍 | 对应 `UI_DESIGN_*.md`；设计决策编号 | 每个 `UI-*` 关联有效 `BF-*`/`EP-*` |
| 4. 实现追踪 | React 组件、桌面 API、Rust 命令、数据表和权限 | 源码路径；数据/状态说明 | 实现状态与源码一致，无“文档先行完成” |
| 5. 测试设计 | 组件、纯函数、桥接、数据库、跨平台手工场景 | 测试矩阵；自动化测试文件 | 高影响操作有成功、失败、禁用和恢复用例 |
| 6. 本地验收脚本 | 参数、跨平台入口、真实模型/服务、JSON、日志和退出码 | `scripts/<domain>/`、CLI 合同测试、脚本规范 | 从仓库外目录可重复执行；失败和阻断可区分 |
| 7. 测试人员执行与回传 | macOS/Windows 环境、真实 Ollama、人工 UI、截图/录屏和脱敏 | `result.json`、stdout/stderr、观察表、SHA-256 | 原始证据可追溯；未执行项不计为通过 |
| 8. 验收报告 | 通过项、失败项、风险、缺口和后续动作 | `acceptance/UI_ACCEPTANCE_<DOMAIN>.md` | 报告能反向定位设计、代码、脚本和测试 |
| 9. 复审 | 竞品维护变化、用户反馈、回归和版本变更 | 复审记录和名次变更原因 | 正式竞品每季度复审，快速变化 Agent 每月复核 |

## 3. 当前版本工作计划表

排序按用户影响和跨层风险：先验收设置与模型边界，再验收会话/文档主链路，最后验收长任务和低频边界。

| 优先级 | 功能域 | 主要入口 | 竞品证据链 | 实现与测试范围 | 当前状态 | 产出 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | 模型设置 | `EP-SETTINGS-001`、`EP-MODEL-001` 至 `EP-MODEL-005` | Cherry Studio、SoloMD 的提供商/模型/连接测试分离；CloudCLI、Claude Code Router、CLIProxyAPI 仅作控制面观察；复合身份、密钥边界为 Vinkey 原创安全约束 | `SettingsPage.tsx`、`desktop.ts`、`models.rs`、`hardware.rs`、`store.ts`；组件、隐私、准入、硬件测试 | 代码验收通过；桌面实机待执行 | [模型设置专项验收](./acceptance/UI_ACCEPTANCE_SETTINGS.md) |
| P0 | 应用壳层与入口 | `EP-WORKSPACE-*`、`EP-NAV-*`、`EP-SETTINGS-001` | Cherry Studio、Obsidian、Typora 的设置/工作区职责边界；平台菜单为 Vinkey 适配 | `App.tsx`、`ProjectSessionSidebar.tsx`、`TitleBar`；导航、快捷键、窗口状态测试 | 待本轮执行 | `UI_ACCEPTANCE_SHELL.md` |
| P0 | 对话与模型状态 | `EP-CONVERSATION-*`、`EP-MODEL-001` | OpenAI Codex、Claude Code、Cursor 的模型状态、任务入口和结果分层；消息活动与 Vinkey 任务状态组合改造 | `App.tsx`、`MessageActivity.tsx`、路由/运行时；组件和链路测试 | 部分覆盖 | `UI_ACCEPTANCE_CHAT.md` |
| P1 | 文件与编辑器 | `EP-DOCUMENT-*` | MarkText、Typora、Obsidian 的编辑/预览/保存；DiffProposal 为 Vinkey 审阅原创约束 | `FileWorkspace`、`EditorPanel`、`CodeEditor`、文件 API；保存、冲突、越界、提案测试 | 部分实现 | `UI_ACCEPTANCE_EDITOR.md` |
| P1 | 日志中心与长任务 | `EP-LOG-*`、`EP-TASK-*` | OpenAI Codex、Claude Code、豆包的进度、后台任务、Artifact 和恢复；源快照校验为 Vinkey 组合改造 | `LogCenter`、`ConversationTaskControls`、Worker/TaskJob；暂停、失败、恢复、结果测试 | 部分实现 | `UI_ACCEPTANCE_LOGS.md` |
| P1 | 工作区上下文与分析 | `EP-CONTEXT-*`、`EP-ANALYSIS-*` | Aider、Continue、GitHub Copilot 的索引优先和预算控制；文学证据窗口为 Vinkey 原创领域适配 | Context/Workspace Analysis、权限策略、来源收据；召回、隐私、超限测试 | 部分实现 | `UI_ACCEPTANCE_CONTEXT.md` |
| P2 | 主题与响应式 | `EP-SHELL-*`、页面内响应式入口 | 桌面编辑器通用布局经验；尺寸 token、断点和平台差异由 Vinkey 设计系统定义 | `UI_DESIGN_SYSTEM.md`、各页面 CSS；Windows/macOS/窄窗口手工验收 | 待集中执行 | `UI_ACCEPTANCE_RESPONSIVE.md` |

文件名是计划产物约定；专项报告应在执行前创建，不能以空文件代表通过。

## 4. 证据链记录模板

每个功能域的报告使用下表，证据来源必须使用正式名称和规范术语：

| 链路节点 | 必填内容 | 模型设置示例 |
| --- | --- | --- |
| 功能域 | `BF-*`、`EP-*`、用户目标、前置条件 | `BF-MODEL-001`：选择当前模型 |
| 竞品参考 | 规范竞品名、具体功能、证据 URL、观察日期、等级 | Cherry Studio：提供商/当前模型/连接测试分离，A/B 级公开资料 |
| 决策设计 | `CF-*`、采用/改造/原创/暂不采用、理由 | `CF-002` 已参考；复合身份和密钥不落盘为 Vinkey 原创安全约束 |
| UI 设计 | `UI-*`、入口、状态、无障碍、响应式 | `UI-MODEL-PICKER`、`UI-CONNECTION-SAVE-CHECK` |
| 实现 | 前端、桥接、后端、存储、权限路径 | `SettingsPage.tsx` → `desktop.ts` → `models.rs`/`store.ts` |
| 测试 | 自动化测试、手工场景、环境和命令 | `SettingsPage.test.tsx`、`modelPrivacy.test.ts`、`NODE_ENV=production npm test` |
| 验收结论 | 通过/条件通过/不通过、阻断项、遗留风险 | 代码链路通过；Windows/macOS 实机和凭据库仍待执行 |

## 5. 统一结论等级

- **通过**：关键入口和业务链路通过，自动化测试和必要平台验收完成，无 P0/P1 阻断。
- **条件通过**：代码和测试满足当前范围，但有明确的环境、平台或手工验收待办；不得宣称完整发布通过。
- **不通过**：关键入口不可达、数据/权限边界失效、错误恢复缺失，或测试存在无法解释的业务失败。
- **阻断**：测试基础设施、构建环境或外部依赖使业务结论不可得；应记录复现方式，不把阻断误报为功能失败。

## 6. 执行顺序与复审

1. 先完成 P0 模型设置专项，确认统一流程可用于后续功能域。
2. 按 [UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md) 编写脚本，并按 [UI_ACCEPTANCE_SCRIPT_PLAN.md](./UI_ACCEPTANCE_SCRIPT_PLAN.md) 排期。
3. 测试人员完成本地 Ollama/桌面执行后，使用对应回填模板上传机器结果和人工观察；未回传不得把平台层标记为通过。
4. 根据专项报告模板补齐应用壳层、对话、编辑器和日志中心。
5. 每个功能域完成后更新 `UI_INVENTORY.md`、对应 `UI_DESIGN_*.md` 和 `FEATURE_DECISIONS.md` 的交叉链接。
6. 正式竞品按 `docs/competitors/SELECTION_METHODOLOGY.md` 复审；竞品名称或产品层级变化先更新 `TERMINOLOGY.md`。
