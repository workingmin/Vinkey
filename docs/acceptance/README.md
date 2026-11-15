# 验收文档审核入口

本目录集中维护验收计划、脚本规范、专项报告和执行回填模板，供验收人员与审核人员统一查阅。

## UI 验收

先查阅[UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md)，确认功能域、验收门槛和前置依赖，再审核对应专项报告及执行证据。平台执行类文档（含长任务过程原生复验清单的执行任务）按 macOS / Windows 分版维护于 `ui/macos/` 与 `ui/windows/`，两版共享同一验收合同与脚本规范，仅执行入口和证据按平台区分；跨平台合同类文档（计划、脚本规范）与原生复验清单的共享合同、平台任务分派索引继续留在 `ui/` 根目录。文档按「计划 → 回填模板 → 规范 → 专项验收」分类维护。

### 计划

| 文档 | 用途 |
| --- | --- |
| [UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md) | 功能域、波次、依赖和验收范围 |
| [UI 验收脚本编写计划](ui/UI_ACCEPTANCE_SCRIPT_PLAN.md) | 脚本建设与执行安排 |
| [标题栏与功能菜单专项验收计划（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) | 菜单平台与业务入口验收（macOS；已执行一次，结论见专项报告） |
| [标题栏与功能菜单专项验收计划（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) | 菜单平台与业务入口验收（Windows；M5 待执行） |

### 回填模板

| 文档 | 用途 |
| --- | --- |
| [应用壳层与入口回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SHELL_RUN_TEMPLATE.md) | 壳层本地执行记录（macOS） |
| [应用壳层与入口回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md) | 壳层本地执行记录（Windows） |
| [项目与会话导航回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md) | 导航本地执行记录（macOS） |
| [项目与会话导航回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md) | 导航本地执行记录（Windows） |
| [模型设置回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SETTINGS_RUN_TEMPLATE.md) | 设置本地执行记录（macOS） |
| [模型设置回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SETTINGS_RUN_TEMPLATE.md) | 设置本地执行记录（Windows） |
| [长任务/日志中心回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md) | 长任务本地执行记录（macOS） |
| [长任务/日志中心回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md) | 长任务本地执行记录（Windows） |

### 规范

| 文档 | 用途 |
| --- | --- |
| [UI 验收脚本设计规范](ui/UI_ACCEPTANCE_SCRIPT_SPEC.md) | 执行合同、结果格式和证据要求 |

### 专项验收

> **本表通用口径**（适用于下列所有「专项验收（macOS）」栏，统一在此说明，不在各栏重复）：
> - **结论范围**：各栏结论均为**对应平台的单平台结论**；凡标注「专项通过」者，均指 **Alpha 客观自动化范围**内的专项通过——客观用例全部 PASS 且机器证据链（`result.json`、`SHA256SUMS`、`provenance`、退出码）可核验，不代表视觉/体验已验收、功能完备或完整发布通过。其他栏的「完整通过」等字样亦限于对应功能域的单平台范围，不等同于完整发布通过。
> - **人工复核统一后置**：需人工观察、专家判断或用户意见才能判定的 UI 交互与主观验收项，按 [总计划 §8.3](ui/UI_ACCEPTANCE_PLAN.md) 登记为 `DEFERRED_AFTER_ALPHA`（共 12 项），已从各功能域验收范围摘除并集中至 [§8.5 人工复核统一批次](ui/UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理)，待**所有自动化验收脚本跑完后**统一处理；不计入各专项结论、不作为阻断项，不得写成 `PASS` 或删除，结论单独记录且不回溯改写功能域 `result.json`。
> - **平台边界**：Windows 平台执行属独立 Windows 专项；macOS 专项不执行 Windows 独立专项，其 `NOT_EXECUTED` 不计入 macOS 结论，反之亦然。因此任何单平台专项通过**均不宣称跨平台发布通过 / 完整发布通过**。
> - 各栏只写该专项自身结论与证据；审核结论以专项报告及最新批次 `result.json` 为准。

| 文档 | 用途 |
| --- | --- |
| [应用壳层与入口专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SHELL.md) | 壳层平台与结构验收报告（macOS，完整通过） |
| [标题栏与功能菜单专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md) | 标题栏/原生菜单与窗口命令验收报告（macOS，**专项通过**；`W0-SHELL-MENU-P=PASS`（`TB-MENU-008` 全屏/Reopen 已客观 PASS）、`W0-SHELL-MENU-F=PASS`（独立脚本 `UI-ACC-TITLE-BAR-FIXTURE-001`）、`provenance=PASS`，13/13 计划用例覆盖） |
| [应用壳层与入口专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SHELL.md) | 壳层平台与结构验收报告（Windows，待执行） |
| [项目与会话导航专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md) | 导航合同、端到端和回归验收报告（macOS，完整通过；含真实应用原生窗口证据） |
| [项目与会话导航专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md) | 导航合同、端到端和回归验收（Windows） |
| [模型设置专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SETTINGS.md) | 设置与真实模型服务验收报告（macOS，**专项通过**；`W1-MODEL-E` 双协议 10/10 PASS、`UI-ACC-SETTINGS-KEYCHAIN-001` 5/5 PASS、组件 17/17、Rust 模型域全绿、`provenance=PASS`；外部独立 OpenAI-compatible 服务仍为客观遗留） |
| [模型设置专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md) | 设置与真实模型服务验收报告（Windows） |
| [长任务/日志中心专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) | 日志/长任务真实端到端验收报告（macOS，**专项通过**；`UI-ACC-LOGS-001` 7/7 机器用例 PASS、真实任务 `completed` 且 `pipelineCompleted=true`、事件 sequence 连续且终态事件均带 `endedAt`、真实 Ollama 调用次数大于零、`provenance=PASS`、合同测试全绿；证据由 CLI 驱动 + 生产 pipeline + 真实 Ollama 产出，非桌面 UI 发起） |
| [长任务/日志中心专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md) | 日志/长任务真实端到端验收报告（Windows，`NOT_EXECUTED`） |
| [长任务过程原生复验清单（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md) | `NT-001..NT-005` 的 macOS 平台执行任务（`NT-MAC-001`~`005`，待执行）与证据入口 |
| [长任务过程原生复验清单（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md) | `NT-001..NT-005` 的 Windows 平台执行任务（`NT-WIN-001`~`005`，独立专项客观后置）与证据入口 |
| [长任务过程原生复验清单（共享合同与平台任务分派索引）](ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md) | 5 个原用例编号与通过标准、平台任务分派索引及共性口径 |

> 标题栏与功能菜单专项的 Windows 报告尚未建立，当前仅有 [Windows 版计划](ui/windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)（M5 待执行）。该专项 macOS 侧的补充证据：`TB-MENU-003-GLOBAL-SEARCH=PASS`、`TB-MENU-008=PASS`、13/13 覆盖、构建溯源 `provenance=PASS`；`W0-EDITOR-F` 目标平台 WebView 客观证据已由 `UI-ACC-EDITOR-WEBVIEW-001` 采集，目录取消保态已由 AX/CG 双信号客观判定为 `preserved`。

## IntentRouter 验收

- [IntentRouter 测试与验收](intent-router/TEST_ACCEPTANCE.md)：测试矩阵、本地模型评测、执行命令和验收标准。
- 关联设计与测试计划见 [IntentRouter 专项设计](../design/agent/intent-router/README.md)。

## 维护约定

- 新增验收文档统一放入本目录，按功能领域分类并更新本索引；UI 验收使用 `ui/`（平台执行文档按 macOS/Windows 放入 `ui/macos/`、`ui/windows/`；长任务过程原生复验清单的执行任务同样按平台分版，`ui/` 根目录只保留其共享合同与分派索引），并归入「计划 / 回填模板 / 规范 / 专项验收」对应小节；IntentRouter 验收使用 `intent-router/`。
- 设计文档继续由 [`design/`](../design/) 维护，验收文档通过相对链接关联设计依据、实现和测试入口。
- 报告与回填模板分开维护；审核结论以报告及实际执行证据为准，计划、模板和占位内容不代表验收通过。
- 可执行脚本保存在 [`scripts/`](../../scripts/README.md)，自动化测试保存在 [`tests/`](../../tests/README.md)。
