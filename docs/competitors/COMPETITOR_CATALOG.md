# 正式竞品名录

- 快照日期：`2026-09-22`
- 筛选方法：[竞品筛选方法论](SELECTION_METHODOLOGY.md)
- 名称规则：[竞品术语规范](TERMINOLOGY.md)
- 说明：只有通过市场认可充分条件的对象才进入本表。设计价值不等于正式竞品资格。

## 1. 核心竞品

| 规范名称 | 类型 | 公开存续/维护证据 | 用户反馈与市场认可 | 许可证/商业边界 | 评分 | Vinkey 用途 |
| --- | --- | --- | --- | --- | ---: | --- |
| [NoteGen](https://github.com/codexu/note-gen) | 本地 Markdown + AI 工作台 | 仓库与 Release 持续更新；2024-08-06 创建，2026-09-14 最近推送 | GitHub Issue/Release；约 12.8k Star、971 Fork | GPL-3.0；仅参考行为和架构 | 21 | 工作区、会话、知识内容分层 |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | 多提供商 AI 工作台 | 2024-05-24 创建，持续 Release 与问题处理 | GitHub 社区；约 52k Star、4.9k Fork | AGPL-3.0；不复制代码 | 22 | 提供商、模型、连接测试和多模型交互 |
| [MarkText](https://github.com/marktext/marktext) | Markdown 编辑器 | 2017-11-12 创建，持续 Release/维护 | GitHub 社区；约 61.7k Star、4.5k Fork | MIT | 20 | 编辑/预览、保存、文件状态 |
| [Aider](https://github.com/Aider-AI/aider) | 终端 AI 编程 Agent | 2023-05-09 创建，公开 Release 和社区反馈 | GitHub、文档社区；约 49.1k Star、4.9k Fork | Apache-2.0 | 22 | 结构索引、上下文预算、可审阅改动 |
| [Continue](https://github.com/continuedev/continue) | 开源编码 Agent/上下文平台 | 2023-05-24 创建，持续提交和版本更新 | GitHub、社区和扩展生态；约 36k Star、5.4k Fork | Apache-2.0 | 21 | 检索 Provider、上下文降级、扩展边界 |
| [Cline](https://github.com/cline/cline) | IDE/SDK/CLI Agent | 2024-07-06 创建，持续 Release 与 Issue 响应 | GitHub、社区、扩展生态；约 69k Star、7.4k Fork | Apache-2.0 | 21 | Tool Loop、审批、子 Agent 和权限模式 |
| [OpenCode](https://github.com/anomalyco/opencode) | 开源终端编码 Agent | 2025-04-30 创建，持续 Release；2026-09-21 有正式版本 | GitHub、社区和生态；约 209k Star、27.5k Fork | MIT | 21 | 多模型 Agent CLI、会话和终端工作流 |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 开源 Agent 平台/开发环境 | 2024-03-13 创建，持续 Release 与社区维护 | GitHub、社区、部署生态；约 88.7k Star、11.6k Fork | MIT | 21 | Agent 任务、沙箱、后台执行和恢复 |

## 2. 多 Agent CLI 集成与代理工作台

这类产品不是单一模型或单一 CLI。它们统一接入多个 Agent CLI、远程会话、项目和任务控制面，是 Vinkey 需要补充的竞品类别。

| 规范名称 | 仓库/产品身份 | 主要接入或代理对象 | 公开验证快照 | Vinkey 取舍 |
| --- | --- | --- | --- | --- |
| [CloudCLI](https://github.com/siteboon/claudecodeui)（仓库名 `claudecodeui`，原 Claude Code UI） | 多 Agent CLI Web/移动工作台 | Claude Code、OpenCode、Cursor CLI、Codex | 2025-06-25 创建；2026-09-08 Release；约 13.8k Star、1.9k Fork；AGPL-3.0；官方描述明确覆盖多个 CLI | 正式生态参考；重点研究统一会话、项目、远程控制和多 CLI 适配，不复制 AGPL 实现 |
| [Opcode](https://github.com/winfunc/opcode) | Claude Code GUI/Toolkit | Claude Code 会话、自定义 Agent、后台 Agent | 2025-06-19 创建；2025-08-31 Release；约 22.4k Star、1.7k Fork；AGPL-3.0 | 正式生态参考；属于单 CLI GUI/Agent 工作台，不与 CloudCLI 混称 |
| [Claude Code Router](https://github.com/musistudio/claude-code-router) | 本地模型路由与控制平面 | Claude Code 请求、多个模型和 Provider | 2025-02-25 创建；2026-09-16 Release；约 37.3k Star、3.1k Fork；MIT | 正式生态参考；研究路由、Provider 抽象和本地控制面，不默认采用其认证模式 |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | 多模型 CLI/API 兼容代理 | Codex、Claude Code、Gemini、Grok 等 | 2025-07-01 创建；2026-09-22 持续推送；约 52.7k Star、7.9k Fork；MIT | 正式生态参考但高风险；只研究协议兼容和隔离，不复用第三方账号凭据 |

CloudCLI、Opcode、Claude Code Router 和 CLIProxyAPI 需要分开描述：CloudCLI 是多 CLI 用户工作台，Opcode 是 Claude Code GUI/Toolkit，Claude Code Router 是模型路由控制面，CLIProxyAPI 是 API 兼容代理。它们不是同一种“Agent CLI”。

## 3. 商业产品与第一方 Agent 产品

商业产品的采用规模不公开统一指标，因此本表使用官方版本/产品历史、官方支持或社区反馈、独立讨论/评测和持续商业运营作为市场认可证据。详细证据链见[商业与 Agent 产品报告](COMMERCIAL_AGENT_REPORT.md)。

| 规范名称 | 类型 | 市场认可充分条件证据 | Vinkey 用途 |
| --- | --- | --- | --- |
| [OpenAI Codex](https://learn.chatgpt.com/docs/overview) | 第一方 Agent 产品体系 | 官方产品文档、持续更新的 CLI/云端/远程产品、公开用户社区和开发者生态 | 任务合同、审批、后台任务、diff、恢复 |
| [Claude Code](https://code.claude.com/docs/en/overview) | 第一方 Agent 产品 | 官方文档、持续版本与支持社区、开发者生态和公开使用反馈 | Tool Loop、权限、Artifacts、Skills、会话控制 |
| [Cursor](https://cursor.com/) | 商业 AI 编辑器 | 官方 Changelog、公开论坛、长期产品运营和独立用户讨论 | 相关性上下文、编辑器内 Agent、diff |
| [GitHub Copilot](https://github.com/features/copilot) | 商业开发者 AI 平台 | 长期商业运营、官方 Changelog/社区、企业和开发者采用 | 索引优先、Ask/Research 分层、组织权限 |
| [Obsidian](https://obsidian.md/) | 本地知识工作台 | 长期版本维护、官方论坛/插件生态和大量用户反馈 | 本地库、文档导航、插件边界 |
| [Typora](https://typora.io/) | 本地 Markdown 编辑器 | 长期商业发行、版本记录、用户社区和持续维护 | 低干扰编辑、预览和保存体验 |
| [Novelcrafter](https://www.novelcrafter.com/features) | 商业文学创作工具 | 持续产品运营、功能文档、用户社区和写作者反馈 | Codex 资产卡、别名、受控创作上下文 |
| [Sudowrite](https://www.sudowrite.com/) | 商业 AI 写作工具 | 持续商业运营、产品功能迭代、写作者社区和独立讨论 | 创意、续写、Story Bible 的低摩擦体验 |

## 4. 设计来源与观察对象（不属于正式竞品）

以下对象有局部设计启发，但本轮不满足市场认可充分条件，不能在正式竞品分析中写成成熟竞品：

| 对象 | 保留原因 | 未通过的主要条件 | 使用规则 |
| --- | --- | --- | --- |
| Knote | AI 修改提案和人工接受的设计启发 | 公开存续/采用规模不足 | 仅作为 DiffProposal 设计来源 |
| StorySphere | 人物、关系、事件抽取流水线 | Star、外部反馈和市场采用不足 | 仅作为人物资产 ETL 设计来源 |
| graphify-novel | 章节批处理、缓存和 review 思路 | 公开存续时间和市场证据不足 | 仅作为图谱增量处理设计来源 |
| NLP-Characters-Relationships | NER/共现候选抽取 | 维护和采用证据不足 | 仅作为候选生成实验来源 |

