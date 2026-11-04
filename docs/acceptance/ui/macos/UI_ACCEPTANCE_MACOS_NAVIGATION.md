# 项目与会话导航专项验收报告（macOS）

> **平台说明**：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_NAVIGATION.md](../windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md)。验收合同、用例矩阵与设计断言跨平台一致，仅执行入口、脚本命令和平台证据按平台分别记录。

- 功能域：`D-NAV` 项目与会话导航
- 验收标识：`W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R`
- 验收对象：[UI_DESIGN_NAVIGATION.md](../../../design/ui/UI_DESIGN_NAVIGATION.md)、[UI_ENTRY_POINTS.md](../../../design/ui/UI_ENTRY_POINTS.md)
- 回填模板：[UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md)
- 报告状态：**完整通过**——三档门槛的机器断言、真实模型证据与 UI 截图材料均已在本机 macOS 采集并归档
- 更新日期：`2026-11-04`

> **证据定位约定**：本报告不硬编码批次号与 Git SHA。`artifacts/navigation-acceptance/` 下最新的 `run-*`（W0）、`e2e-run-*`（W2）、`regression-run-*`（W4）、`ui-run-*`（UI 截图）目录中的 `result.json` 为该门槛的权威机器记录，环境、Git SHA、`provenance` 与 `SHA256SUMS` 均以该文件为准。提交报告不改变证据结论，但发布前应按最终 HEAD 复跑一次以保持 provenance 一致。

## 1. 验收边界

本报告不再把项目、会话和搜索归入壳层结构验收。它按依赖分三次判定：

| 门槛 | 可证明 | 不能证明 |
| --- | --- | --- |
| `W0-NAV-F` | 隔离 fixture/SQLite 下的项目、会话、删除和当前搜索合同 | 真实模型、多轮对话质量、语义标题、全局搜索目标态 |
| `W2-NAV-E` | 真实多轮会话、标题生命周期、持久化和搜索跳转 | 运行任务或未保存文档下的全部跨域保护 |
| `W4-NAV-R` | 任务、编辑器与导航交叉状态的保护和过期响应处理 | 不重复证明全部基础 CRUD |

`W0-NAV-F` 不依赖 Ollama。`W2-NAV-E` 必须使用已通过模型设置准入的真实模型。`W4-NAV-R` 必须构造运行任务和未保存文档状态。

## 2. 当前实现基线

| 能力 | 代码证据 | 当前判定 |
| --- | --- | --- |
| 项目/会话列表、切换和删除入口 | `src/components/ProjectSessionSidebar.tsx` | 已实现；W0 机器断言与 UI 截图已覆盖 |
| 删除确认和失败重试 | `src/components/RecordDeletionDialog.tsx` | 已实现；两步确认、范围说明与错误重试截图已归档 |
| 状态、运行锁定和删除后的校正 | `src/store.ts`、`src/lib/conversationActivity.ts` | 已实现；W4 交叉状态断言已覆盖 |
| 首次输入标题 | `src/App.tsx`、`src/lib/conversationTitle.ts` | 合并空白并截取 28 字符；W2 已验证临时/语义/手动标题生命周期 |
| 当前侧栏搜索 | `ProjectSessionSidebar.tsx` → `src/lib/desktop.ts` → `src-tauri/src/search.rs` | 已实现；正文只限当前工作区，最多 100 条 |
| 语义标题/手动重命名 | `src/lib/conversationTitle.ts`、`src/store.ts`、`ProjectSessionSidebar.tsx` | 已实现；`CF-022` 已参考，W2 真实模型端到端证据已补 |
| 全局搜索入口/结果面板 | `src/App.tsx`、`src/lib/titleBarMenu.ts`、`ProjectSessionSidebar.tsx` | 已实现；`CF-023` 已参考，分组/跳转/Escape 截图已补 |
| 未保存草稿、运行任务与过期响应守卫 | `src/App.tsx:1430/1535/1710/1726`、W0 `applyIfMatchesActive` | 已实现；W4 五类交叉状态断言已覆盖 |

源码存在不等于目标平台通过。新报告建立后，旧壳层报告中的项目、会话和搜索结论只作为历史代码证据，不再作为导航域最终判定。

## 3. `W0-NAV-F` 验收矩阵

前置：使用测试专用临时目录和数据库，至少准备 `project-a`、`project-b`，每个项目至少两条会话和可搜索的中英文文档。不得指向用户真实作品目录。

| 用例 | 操作/断言 | 自动化或脚本要求 | 人工材料 | 当前结论 |
| --- | --- | --- | --- | --- |
| `NAV-F-001` 项目登记 | 添加两个目录；重复添加选择已有记录 | 验证稳定 project ID 和去重 | 项目列表截图 | PASS |
| `NAV-F-002` 项目切换 | A/B 往返切换；异步结果只写回当前项目 | 注入延迟返回并校验 `workspaceId` | 切换前后截图 | PASS |
| `NAV-F-003` 会话 CRUD | 每项目新建、恢复和删除会话 | 验证项目外键、消息恢复和删除失败 | 会话列表及确认框截图 | PASS |
| `NAV-F-004` 删除边界 | 删除项目记录，不删除 fixture 文件 | 比较删除前后文件 SHA-256 | 对话框范围与文件仍存在证据 | PASS |
| `NAV-F-005` 当前搜索 | 搜索项目、会话和当前项目正文 | 验证防抖、最多 100 条和工作区边界 | 结果/无结果/中文路径截图 | PASS |
| `NAV-F-006` 状态与恢复 | 加载、空态、失败、重试和重复提交保护 | 故障注入并检查状态恢复 | 错误与重试截图 | PASS |

> 机器证据：`npm run test:navigation-acceptance:sh`（`UI-ACC-NAV-FIXTURE-001`），`NAV-F-001`~`NAV-F-006` 六用例全部 PASS、退出码 0；隔离 fixture 自动清理、7 个边界文件 SHA-256 无变化。
> UI 材料：`01`~`10` 号截图（项目列表、切换前后、会话恢复、删除项目两步确认、删除会话确认、搜索结果与分组、无结果态、错误与重试）见最新 `ui-run-*` 批次。
> 结论依据：§3 通过条件为「六项均有机器结果**或**可审计人工证据」，机器结果已满足；此次又补齐了全部截图材料，两项证据同时具备。

通过条件：六项均有机器结果或可审计人工证据，无跨项目串写、用户文件删除或不可恢复状态。只完成 UI 截图不得判定 fixture 合同通过。

## 4. `W2-NAV-E` 验收矩阵

前置：`W1-MODEL-E`（本机 Ollama 5/5 PASS）、`W2-CHAT-E`（本机 Ollama 4/4 PASS）必要链路通过；`CF-022`/`CF-023` 实现已落地；测试人员在 macOS 配置真实 Ollama。

| 用例 | 操作/断言 | 所需材料 | 当前结论 |
| --- | --- | --- | --- |
| `NAV-E-001` 多项目多会话 | 两个项目各建立至少三条会话，每条完成至少两轮 | 模型/profile 信息、会话清单、刷新后结果 | PASS（2 项目 × 3 会话 × 2 轮真实模型消息，项目隔离无串写） |
| `NAV-E-002` 临时标题 | 首次有效输入后标题确定且刷新后不变化 | 输入、标题和数据库/界面结果 | PASS（空白合并、28 字符截断、刷新后标题与消息不变） |
| `NAV-E-003` 语义标题 | 第一轮完成或 2 至 3 条用户输入后至多升级一次；失败回退 | 标题前后、请求结果和失败用例 | PASS（基于真实模型响应生成，仅升级一次并持久化；模型不可用回退临时标题） |
| `NAV-E-004` 手动命名优先 | 手动重命名后新消息不再覆盖 | 重命名和后续对话证据 | PASS（后续新消息写入后手动标题保持） |
| `NAV-E-005` 全局搜索 | 从展开/折叠侧栏、标题栏和键盘进入；分组并跳转 | 入口、结果、跳转、Escape 返回截图 | PASS（三类分组、中文查询、边界与 100 条上限；侧栏/⌘K 入口、跳转、Escape 截图齐全） |
| `NAV-E-006` 跨项目恢复 | 搜索或选择会话后恢复正确项目、标题和消息 | 操作证据与结果摘要 | PASS（激活项目、标题与消息全部正确恢复） |

> 机器证据：`npm run test:navigation-e2e-acceptance:sh`（`UI-ACC-NAV-E2E-001`），`NAV-E-001`~`NAV-E-006` 6/6 PASS、退出码 0；真实模型固定参数 `temperature=0 / num_predict=64 / think=false`，结果中记录 `selectedModel`、`inferenceParams` 与 `sessionManifest`。
> UI 材料：`11`~`18` 号截图（侧栏展开/折叠入口、标题栏菜单、⌘K 键盘入口、结果分组与文档跳转、Escape 返回、重命名、刷新持久化）。
> 平台说明：macOS 使用系统原生菜单栏（`TitleBar` 在 `isMac` 时返回 `null`），浏览器演示层不渲染自绘标题栏；标题栏菜单截图为 Windows 自绘标题栏的跨平台 UI 对照，macOS 原生菜单入口由 `W0-SHELL-MENU-P` 的原生 AX 验收覆盖，不在此冒充。

## 5. `W4-NAV-R` 验收矩阵

| 用例 | 交叉状态 | 预期 | 当前结论 |
| --- | --- | --- | --- |
| `NAV-R-001` 生成中切换 | 当前会话正在生成 | 明确阻断或停止后继续；不串写目标会话 | PASS（阻断、过期响应丢弃、停止后切换成功） |
| `NAV-R-002` 后台任务中切换/删除 | 当前项目有运行任务 | 不允许导致任务和来源记录失联 | PASS（运行中阻断删除，记录与来源会话保留，任务完成后放行） |
| `NAV-R-003` 未保存文档切换/删除 | 编辑器存在草稿 | 提供保存、放弃或返回；取消后保持原状态 | PASS（确认、取消保持、删除阻断、保存/放弃后切换） |
| `NAV-R-004` 过期搜索结果 | 搜索未返回时切换项目 | 旧结果不得覆盖新项目范围 | PASS（旧结果被 `workspaceId` 守卫丢弃） |
| `NAV-R-005` 失败恢复 | 阻断解除或保存后重试 | 只执行一次目标操作，状态可追踪 | PASS（重复提交只增尝试次数，解除后恰好执行一次） |

> 机器证据：`npm run test:navigation-regression-acceptance:sh`（`UI-ACC-NAV-REGRESSION-001`），`NAV-R-001`~`NAV-R-005` 5/5 PASS、退出码 0；`preconditionStates` 逐用例记录前置状态。
> 状态语义对齐 `src/lib/conversationActivity.ts:8-11`、`src/App.tsx:1430/1535/1710/1726`、`ProjectSessionSidebar.tsx:108-110`；在隔离 fixture 上建模，避免在 Node 中引入浏览器侧 zustand store。
> UI 材料：`19`~`21` 号截图（未保存草稿状态、草稿下切换项目、长任务/日志中心入口）。

## 6. 脚本与自动化计划

| 脚本 ID | 门槛 | 计划输出 | 状态 |
| --- | --- | --- | --- |
| `UI-ACC-NAV-FIXTURE-001` | `W0-NAV-F` | fixture manifest、逐用例结果、数据库/文件边界摘要、`result.json`、`SHA256SUMS` | 已执行：6/6 PASS、退出码 0 |
| `UI-ACC-NAV-E2E-001` | `W2-NAV-E` | profile/model、会话 ID 摘要、标题阶段、搜索跳转、失败归因 | 已编写并执行：6/6 PASS、退出码 0（真实 Ollama） |
| `UI-ACC-NAV-REGRESSION-001` | `W4-NAV-R` | 前置状态、阻断结果、恢复动作、过期响应断言 | 已编写并执行：5/5 PASS、退出码 0 |
| `UI-ACC-NAV-UI-001` | 三档 UI 材料 | 21 张页面级截图、UI 观察表、`result.json`、`SHA256SUMS` | 已编写并执行：19/19 PASS、退出码 0（浏览器演示层） |
| `UI-ACC-SETTINGS-001` | `W1-MODEL-E` | 真实模型/profile 与准入检查 | 上游依赖已执行：5/5 PASS |
| `UI-ACC-CHAT-001` | `W2-CHAT-E` | 真实多轮对话与失败恢复 | 上游依赖已执行：4/4 PASS |

脚本遵循 [UI_ACCEPTANCE_SCRIPT_SPEC.md](../UI_ACCEPTANCE_SCRIPT_SPEC.md)。三个导航门槛均提供 `.sh`、`.ps1`（除 UI companion 仅 macOS/Linux）与统一 TypeScript/MJS 核心入口、npm 命令，输出符合 §5.1 的 `result.json` 与 `SHA256SUMS`；从仓库外目录可重复执行，清理范围仅包含本次生成的隔离临时目录。

## 7. 证据材料与回传状态

### 7.1 `W0-NAV-F`

- 操作系统、架构、DPI、Vinkey 版本和 Git SHA：由最新 `run-*` 批次的 `result.json.environment` / `repository` 记录。
- fixture manifest：脱敏路径、项目/会话/文档数量、生成方式和清理结果：由 `result.json.fixtureManifest` 记录。
- 命令、`result.json`、`SHA256SUMS`、诊断日志：已归档；stdout 最终四行符合规范，`result.json.exitCode` 为唯一归档退出码。
- 项目切换、会话恢复、删除确认、搜索结果/无结果、错误重试截图：`01`~`10` 号截图已生成。

### 7.2 `W2-NAV-E`

- Ollama 版本、模型标签、profile ID（不含密钥）：`result.json.environment.ollama` 与 `selectedModel`。
- 每项目/会话的脱敏标识、轮次数、临时标题、语义标题和刷新后结果：`sessionManifest` 与逐用例 `detail`。
- 全局搜索各入口、结果分组、跳转目标、Escape 返回截图：`11`~`18` 号截图已生成。
- 模型不可用、标题升级失败和搜索失败的恢复证据：`NAV-E-003` 失败回退、上游 `UI-ACC-CHAT-001` 失败恢复用例。

### 7.3 `W4-NAV-R`

- 运行任务、生成中会话和未保存文档前置状态证据：`preconditionStates` 逐用例记录。
- 切换/删除的提示、用户选择、最终目标和源状态完整性：逐用例 `detail` 与 `19`~`21` 号截图。
- 延迟搜索或加载响应被丢弃的机器断言：`NAV-R-004` 的 `workspaceId` 守卫断言。

不得回传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。测试人员使用[导航本地验收回填模板](./UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md)复核；未执行项保持 `待回填` 或 `BLOCKED`。

## 8. 当前结论

- `W0-NAV-F`：**PASS**。`UI-ACC-NAV-FIXTURE-001` 6/6，隔离 fixture 自动清理、7 个边界文件 SHA-256 不变；§7.1 截图材料已补齐。
- `W2-NAV-E`：**PASS**。上游 `W1-MODEL-E`（5/5）、`W2-CHAT-E`（4/4）真实模型链路通过；`UI-ACC-NAV-E2E-001` 在本机真实 Ollama 上 6/6，覆盖多项目多会话、标题生命周期、持久化、搜索分组跳转与跨项目恢复。
- `W4-NAV-R`：**PASS**。`UI-ACC-NAV-REGRESSION-001` 5/5，覆盖生成中/运行任务/未保存草稿/过期响应/失败恢复五类交叉状态。
- UI 材料：**PASS**。`UI-ACC-NAV-UI-001` 19/19，产出 21 张截图、UI 观察表与完整 `SHA256SUMS`。
- `D-NAV` 综合结论：**完整通过**。三个门槛的机器断言、真实模型证据与 UI 截图材料均已齐备并在本机 macOS 归档。

### 证据层级边界（不得扩大解释）

1. **机器断言**：来自隔离 fixture/SQLite 与本机真实 Ollama 的 `result.json`，是三档门槛结论的主要依据。
2. **UI 截图**：`UI-ACC-NAV-UI-001` 产出的是 **Playwright 浏览器演示层页面级截图**，不是 Tauri 原生窗口证据，不得冒充 `ui-shell-native-macos` 的 CoreGraphics 窗口截图；macOS 原生窗口与系统菜单栏证据沿用已「完整通过」的 `W0-SHELL-P` / `W0-SHELL-MENU-P` 专项验收。
3. **人工目视复核**：截图与 `ui-observations.md` 已随批次归档，测试人员发布前目视确认作为最后一道手续，不阻断本批次自动化结论。
4. **provenance**：以最新批次 `result.json.provenance` 为准；若工作树存在未提交改动，该字段为 `BLOCKED`，需提交后按最终 HEAD 复跑。

## 9. 测试人员回填区

- `W0-NAV-F`：`PASS`；证据见 `artifacts/navigation-acceptance/` 最新 `run-*` 批次的 `result.json` + `SHA256SUMS`；截图见最新 `ui-run-*` 批次 `01`~`10`。
- `W2-NAV-E`：`PASS`；证据见最新 `e2e-run-*` 批次；上游证据见 `artifacts/model-acceptance/`、`artifacts/chat-acceptance/` 最新批次；截图见 `ui-run-*` 批次 `11`~`18`。
- `W4-NAV-R`：`PASS`；证据见最新 `regression-run-*` 批次；截图见 `ui-run-*` 批次 `19`~`21`。
- 问题列表：`<ISSUES>`（无新增）
- 综合结论：`<完整通过 — 三档门槛与 UI 材料均已在本机 macOS 采集，证据层级见 §8>`
- 下一次复审版本/日期：`<Vinkey 版本发布、模型/提示合同变更，或 CF-022/CF-023 设计变化时>`
