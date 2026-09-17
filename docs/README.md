# Vinkey 文档目录

文档按维护职责和评审场景分层，文件名保持稳定的领域前缀；新增文档应放入已有分类，只有形成独立维护边界时才新增目录。

## 目录结构

| 目录 | 内容 | 入口 |
| --- | --- | --- |
| [`design/ui/`](design/ui/) | 页面、交互、视觉系统、入口、状态和 UI 现状基线 | [UI 设计总览](design/ui/UI_DESIGN.md) |
| [`design/agent/`](design/agent/) | Agent/Skill 建设计划、流程模板和厂商流程对比 | [Agent 流程模板](design/agent/AGENT_FLOW_TEMPLATES.md) |
| [`architecture/`](architecture/) | 技术选型、业务链路和 Runtime 分层 | [AI 业务链路架构](architecture/AI_BUSINESS_CHAINS.md) |
| [`research/`](research/) | 外部项目调研和候选能力方案 | [GitHub 同类项目调研](research/GITHUB_REFERENCE.md) |
| [`runtime/`](runtime/) | 模型、硬件和运行时准入基线 | [单模型准入与硬件基线](runtime/MODEL_ADMISSION.md) |

## 维护约定

- UI 页面或交互域变更写入 `design/ui/`；跨域入口、现状盘点和视觉 token 仍由 UI 总览文档索引。
- Agent、Skill、Workflow 和消息流模板写入 `design/agent/`；业务链路的系统边界写入 `architecture/`。
- 调研结论与待验证方案写入 `research/`，落地后的稳定运行约束迁移或同步到 `architecture/` 或 `runtime/`。
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
- [任务中心](design/ui/UI_DESIGN_TASKS.md)
- [模型设置](design/ui/UI_DESIGN_SETTINGS.md)
- [视觉与组件系统](design/ui/UI_DESIGN_SYSTEM.md)
- [状态、流程与验收](design/ui/UI_DESIGN_STATES.md)
- [临时交互状态](design/ui/TEMPORARY_INTERACTION_STATES.md)

### Agent 与架构

- [Agent 与 Skill 建设计划](design/agent/AGENT_SKILL_PLAN.md)
- [Agent 流程模板](design/agent/AGENT_FLOW_TEMPLATES.md)
- [Agent 流程模板对比](design/agent/AGENT_FLOW_COMPARISON.md)
- [开发框架与技术选型](architecture/DEVELOPMENT_FRAMEWORK.md)
- [AI 业务链路架构](architecture/AI_BUSINESS_CHAINS.md)

### 调研与运行基线

- [GitHub 同类项目调研](research/GITHUB_REFERENCE.md)
- [轻量级联网搜索设计](research/LIGHTWEIGHT_WEB_RESEARCH.md)
- [单模型准入与硬件基线](runtime/MODEL_ADMISSION.md)
