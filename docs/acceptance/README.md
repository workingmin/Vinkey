# 验收文档审核入口

本目录集中维护验收计划、脚本规范、专项报告和执行回填模板，供验收人员与审核人员统一查阅。

## UI 验收

先查阅[UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md)，确认功能域、验收门槛和前置依赖，再审核对应专项报告及执行证据。

| 文档 | 用途 |
| --- | --- |
| [UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md) | 功能域、波次、依赖和验收范围 |
| [UI 验收脚本设计规范](ui/UI_ACCEPTANCE_SCRIPT_SPEC.md) | 执行合同、结果格式和证据要求 |
| [UI 验收脚本编写计划](ui/UI_ACCEPTANCE_SCRIPT_PLAN.md) | 脚本建设与执行安排 |
| [应用壳层与入口专项验收](ui/UI_ACCEPTANCE_SHELL.md) | 壳层平台与结构验收报告 |
| [应用壳层与入口回填模板](ui/UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md) | 壳层本地执行记录 |
| [标题栏与功能菜单专项验收计划](ui/UI_ACCEPTANCE_TITLE_BAR_PLAN.md) | 菜单平台与业务入口验收 |
| [项目与会话导航专项验收](ui/UI_ACCEPTANCE_NAVIGATION.md) | 导航合同、端到端和回归验收 |
| [项目与会话导航回填模板](ui/UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md) | 导航本地执行记录 |
| [模型设置专项验收](ui/UI_ACCEPTANCE_SETTINGS.md) | 设置与真实模型服务验收报告 |
| [模型设置回填模板](ui/UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md) | 设置本地执行记录 |

## IntentRouter 验收

- [IntentRouter 测试与验收](intent-router/TEST_ACCEPTANCE.md)：测试矩阵、本地模型评测、执行命令和验收标准。
- 关联设计与测试计划见 [IntentRouter 专项设计](../design/agent/intent-router/README.md)。

## 维护约定

- 新增验收文档统一放入本目录，按功能领域分类，并更新本索引；UI 验收使用 `ui/`，IntentRouter 验收使用 `intent-router/`。
- 设计文档继续由 [`design/`](../design/) 维护，验收文档通过相对链接关联设计依据、实现和测试入口。
- 报告与回填模板分开维护；审核结论以报告及实际执行证据为准，计划、模板和占位内容不代表验收通过。
- 可执行脚本保存在 [`scripts/`](../../scripts/README.md)，自动化测试保存在 [`tests/`](../../tests/README.md)。
