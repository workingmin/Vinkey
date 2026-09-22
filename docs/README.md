# Vinkey 文档目录

文档按维护职责和评审场景分层，文件名保持稳定的领域前缀；新增文档应放入已有分类，只有形成独立维护边界时才新增目录。

## 目录结构

| 目录 | 内容 | 入口 |
| --- | --- | --- |
| [`design/ui/`](design/ui/) | 页面、交互、视觉系统、入口、状态和 UI 现状基线 | [UI 设计总览](design/ui/UI_DESIGN.md) |
| [`design/agent/`](design/agent/) | Agent/Skill 建设计划、流程模板和厂商流程对比 | [Agent 流程模板](design/agent/AGENT_FLOW_TEMPLATES.md) |
| [`design/agent/intent-router/`](design/agent/intent-router/) | IntentRouter 架构、实现、测试计划与验收手册 | [IntentRouter 专项设计](design/agent/intent-router/) |
| [`architecture/`](architecture/) | 技术选型、业务链路和 Runtime 分层 | [AI 业务链路架构](architecture/AI_BUSINESS_CHAINS.md) |
| [`research/`](research/) | 外部项目调研和候选能力方案 | [GitHub 同类项目调研](research/GITHUB_REFERENCE.md) |
| [`competitors/`](competitors/) | 竞品分析报告、功能决策台账和验证模板 | [竞品分析总览](competitors/) |
| [`runtime/`](runtime/) | 模型、硬件和运行时准入基线 | [单模型准入与硬件基线](runtime/MODEL_ADMISSION.md) |

## 维护约定

- UI 页面或交互域变更写入 `design/ui/`；跨域入口、现状盘点和视觉 token 仍由 UI 总览文档索引。
- Agent、Skill、Workflow 和消息流模板写入 `design/agent/`；业务链路的系统边界写入 `architecture/`。
- 调研结论与待验证方案写入 `research/`，落地后的稳定运行约束迁移或同步到 `architecture/` 或 `runtime/`。
- 竞品观察、跨项目功能比较和“已参考/待参考/不采用”决策写入 `competitors/`；原始仓库调研仍维护在 `research/`。
- 从仓库根目录引用文档时使用完整路径，例如 `docs/design/ui/UI_DESIGN_CHAT.md`；文档内部优先使用相对于当前文件的链接。
- 移动或重命名文档时必须同步更新本目录、根目录 `README.md` 和文档内链接，并执行链接检查。

## 当前文档清单

### UI 与交互设计

- [UI 设计总览](design/ui/UI_DESIGN.md)
- [UI 功能入口](design/ui/UI_ENTRY_POINTS.md)
- [UI 现状盘点](design/ui/UI_INVENTORY.md)
- [应用壳层](design/ui/UI_DESIGN_SHELL.md)
- [标题栏与功能菜单](design/ui/TITLE_BAR_DESIGN.md)
- [对话页](design/ui/UI_DESIGN_CHAT.md)
- [文件与编辑器](design/ui/UI_DESIGN_EDITOR.md)
- [日志中心](design/ui/UI_DESIGN_LOGS.md)
- [模型设置](design/ui/UI_DESIGN_SETTINGS.md)
- [视觉与组件系统](design/ui/UI_DESIGN_SYSTEM.md)
- [状态、流程与验收](design/ui/UI_DESIGN_STATES.md)
- [临时交互状态](design/ui/TEMPORARY_INTERACTION_STATES.md)
- [UI 验收工作计划](design/ui/UI_ACCEPTANCE_PLAN.md)
- [UI 验收脚本设计规范](design/ui/UI_ACCEPTANCE_SCRIPT_SPEC.md)
- [UI 验收脚本编写计划](design/ui/UI_ACCEPTANCE_SCRIPT_PLAN.md)
- [模型设置专项验收](design/ui/acceptance/UI_ACCEPTANCE_SETTINGS.md)
- [模型设置本地验收回填模板](design/ui/acceptance/UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md)

### Agent 与架构

- [Agent 与 Skill 建设计划](design/agent/AGENT_SKILL_PLAN.md)
- [IntentRouter 专项设计](design/agent/intent-router/)
- [IntentRouter 三层架构](design/agent/intent-router/ARCHITECTURE.md)
- [IntentRouter 测试计划](design/agent/intent-router/TEST_PLAN.md)
- [IntentRouter 测试与验收](design/agent/intent-router/TEST_ACCEPTANCE.md)
- [Agent 流程模板](design/agent/AGENT_FLOW_TEMPLATES.md)
- [Agent 流程模板对比](design/agent/AGENT_FLOW_COMPARISON.md)
- [开发框架与技术选型](architecture/DEVELOPMENT_FRAMEWORK.md)
- [AI 业务链路架构](architecture/AI_BUSINESS_CHAINS.md)

### 调研与运行基线

- [GitHub 同类项目调研](research/GITHUB_REFERENCE.md)
- [轻量级联网搜索设计](research/LIGHTWEIGHT_WEB_RESEARCH.md)
- [竞品分析总览](competitors/)
- [竞品筛选方法论](competitors/SELECTION_METHODOLOGY.md)
- [正式竞品名录](competitors/COMPETITOR_CATALOG.md)
- [竞品术语规范](competitors/TERMINOLOGY.md)
- [竞品功能决策总表](competitors/FEATURE_DECISIONS.md)
- [开源项目分析报告](competitors/OPEN_SOURCE_REPORT.md)
- [商业与 Agent 产品分析报告](competitors/COMMERCIAL_AGENT_REPORT.md)
- [单模型准入与硬件基线](runtime/MODEL_ADMISSION.md)
