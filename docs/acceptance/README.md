# 验收文档审核入口

本目录集中维护验收计划、脚本规范、专项报告和执行回填模板，供验收人员与审核人员统一查阅。

## UI 验收

先查阅[UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md)，确认功能域、验收门槛和前置依赖，再审核对应专项报告及执行证据。平台执行类文档按 macOS / Windows 分版维护于 `ui/macos/` 与 `ui/windows/`，两版共享同一验收合同与脚本规范，仅执行入口和证据按平台区分；跨平台合同类文档（计划、脚本规范、原生复验清单）继续留在 `ui/` 根目录。文档按「计划 → 规范 → 专项验收 → 回填模板」分类维护。

### 计划

| 文档 | 用途 |
| --- | --- |
| [UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md) | 功能域、波次、依赖和验收范围 |
| [UI 验收脚本编写计划](ui/UI_ACCEPTANCE_SCRIPT_PLAN.md) | 脚本建设与执行安排 |
| [标题栏与功能菜单专项验收计划（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) | 菜单平台与业务入口验收（macOS） |
| [标题栏与功能菜单专项验收计划（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) | 菜单平台与业务入口验收（Windows） |

### 规范

| 文档 | 用途 |
| --- | --- |
| [UI 验收脚本设计规范](ui/UI_ACCEPTANCE_SCRIPT_SPEC.md) | 执行合同、结果格式和证据要求 |

### 专项验收

| 文档 | 用途 |
| --- | --- |
| [应用壳层与入口专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SHELL.md) | 壳层平台与结构验收报告（macOS，完整通过） |
| [应用壳层与入口专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SHELL.md) | 壳层平台与结构验收报告（Windows，待执行） |
| [项目与会话导航专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md) | 导航合同、端到端和回归验收（macOS） |
| [项目与会话导航专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md) | 导航合同、端到端和回归验收（Windows） |
| [模型设置专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SETTINGS.md) | 设置与真实模型服务验收报告（macOS） |
| [模型设置专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md) | 设置与真实模型服务验收报告（Windows） |
| [长任务/日志中心专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) | 日志/长任务真实端到端验收报告模板（macOS） |
| [长任务/日志中心专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md) | 日志/长任务真实端到端验收报告模板（Windows） |
| [长任务过程原生复验清单](ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md) | Windows/macOS 桌面通用的原生复验清单 |

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

## IntentRouter 验收

- [IntentRouter 测试与验收](intent-router/TEST_ACCEPTANCE.md)：测试矩阵、本地模型评测、执行命令和验收标准。
- 关联设计与测试计划见 [IntentRouter 专项设计](../design/agent/intent-router/README.md)。

## 维护约定

- 新增验收文档统一放入本目录，按功能领域分类并更新本索引；UI 验收使用 `ui/`（平台执行文档按 macOS/Windows 放入 `ui/macos/`、`ui/windows/`），并归入「计划 / 规范 / 专项验收 / 回填模板」对应小节；IntentRouter 验收使用 `intent-router/`。
- 设计文档继续由 [`design/`](../design/) 维护，验收文档通过相对链接关联设计依据、实现和测试入口。
- 报告与回填模板分开维护；审核结论以报告及实际执行证据为准，计划、模板和占位内容不代表验收通过。
- 可执行脚本保存在 [`scripts/`](../../scripts/README.md)，自动化测试保存在 [`tests/`](../../tests/README.md)。
