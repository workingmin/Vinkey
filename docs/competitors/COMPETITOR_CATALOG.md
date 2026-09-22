# 正式竞品名录

- 快照日期：`2026-09-22`
- 筛选方法：[竞品筛选方法论](SELECTION_METHODOLOGY.md)
- 名称规则：[竞品术语规范](TERMINOLOGY.md)
- 说明：只有通过市场认可充分条件的对象才进入本表。设计价值不等于正式竞品资格。
- 排序规则：先按类别分组，再按 Vinkey 领域相关性、市场认可度、维护可靠性排序；同分时按规范名称的拼音/ASCII 字母排序，详见[筛选方法论](SELECTION_METHODOLOGY.md#41-正式名录排序规则)。

## 1. 核心竞品：本地文档与 AI 工作台

组内按领域相关性评分降序；评分相同时按市场认可度、维护可靠性和规范名称排序。

| 规范名称 | 类型 | 公开存续/维护证据 | 用户反馈与市场认可 | 许可证/商业边界 | 评分 | Vinkey 用途 |
| --- | --- | --- | --- | --- | ---: | --- |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | 多提供商 AI 工作台 | 2024-05-24 创建，持续 Release 与问题处理 | GitHub 社区；约 52k Star、4.9k Fork | AGPL-3.0；不复制代码 | 22 | 提供商、模型、连接测试和多模型交互 |
| [NoteGen](https://github.com/codexu/note-gen) | 本地 Markdown + AI 工作台 | 仓库与 Release 持续更新；2024-08-06 创建，2026-09-14 最近推送 | GitHub Issue/Release；约 12.8k Star、971 Fork | GPL-3.0；仅参考行为和架构 | 21 | 工作区、会话、知识内容分层 |
| [MarkText](https://github.com/marktext/marktext) | Markdown 编辑器 | 2017-11-12 创建，持续 Release/维护 | GitHub 社区；约 61.7k Star、4.5k Fork | MIT | 20 | 编辑/预览、保存、文件状态 |

## 2. 开源 Agent 与开发者工作台

按 Vinkey 任务编排和上下文设计相关性排序；这些项目是生态参考，不是文学创作同层竞品。

| 规范名称 | 类型 | 公开验证快照 | 许可证/商业边界 | 评分 | Vinkey 用途 |
| --- | --- | --- | --- | ---: | --- |
| [Aider](https://github.com/Aider-AI/aider) | 终端 AI 编程 Agent | 2023-05-09 创建，公开 Release 和文档社区；约 49.1k Star、4.9k Fork | Apache-2.0 | 22 | 结构索引、上下文预算、可审阅改动 |
| [Cline](https://github.com/cline/cline) | IDE/SDK/CLI Agent | 2024-07-06 创建，持续 Release 与 Issue 响应；约 69k Star、7.4k Fork | Apache-2.0 | 21 | Tool Loop、审批、子 Agent 和权限模式 |
| [Continue](https://github.com/continuedev/continue) | 开源编码 Agent/上下文平台 | 2023-05-24 创建，持续提交、版本和扩展生态；约 36k Star、5.4k Fork | Apache-2.0 | 21 | 检索 Provider、上下文降级、扩展边界 |
| [OpenCode](https://github.com/anomalyco/opencode) | 开源终端编码 Agent | 2025-04-30 创建，持续 Release，2026-09-21 有正式版本；约 209k Star、27.5k Fork | MIT | 21 | 多模型 Agent CLI、会话和终端工作流 |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 开源 Agent 平台和开发环境 | 2024-03-13 创建，持续 Release 与社区维护；约 88.7k Star、11.6k Fork | MIT | 21 | Agent 任务、沙箱、后台执行和恢复 |

## 3. 多 Agent CLI 集成与代理工作台

这类产品不是单一模型或单一 CLI。它们统一接入多个 Agent CLI、远程会话、项目和任务控制面，是 Vinkey 需要补充的竞品类别。

排序按控制面与 Vinkey 的直接相关性：多 CLI 用户工作台 → 单 CLI GUI/Toolkit → 模型路由控制平面 → API 兼容代理。

| 规范名称 | 仓库/产品身份 | 主要接入或代理对象 | 公开验证快照 | Vinkey 取舍 |
| --- | --- | --- | --- | --- |
| [CloudCLI](https://github.com/siteboon/claudecodeui)（仓库名 `claudecodeui`，原 Claude Code UI） | 多 Agent CLI Web/移动工作台 | Claude Code、OpenCode、Cursor CLI、Codex | 2025-06-25 创建；2026-09-08 Release；约 13.8k Star、1.9k Fork；AGPL-3.0；官方描述明确覆盖多个 CLI | 正式生态参考；重点研究统一会话、项目、远程控制和多 CLI 适配，不复制 AGPL 实现 |
| [Opcode](https://github.com/winfunc/opcode) | Claude Code GUI/Toolkit | Claude Code 会话、自定义 Agent、后台 Agent | 2025-06-19 创建；2025-08-31 Release；约 22.4k Star、1.7k Fork；AGPL-3.0 | 正式生态参考；属于单 CLI GUI/Agent 工作台，不与 CloudCLI 混称 |
| [Claude Code Router](https://github.com/musistudio/claude-code-router) | 本地模型路由与控制平面 | Claude Code 请求、多个模型和 Provider | 2025-02-25 创建；2026-09-16 Release；约 37.3k Star、3.1k Fork；MIT | 正式生态参考；研究路由、Provider 抽象和本地控制面，不默认采用其认证模式 |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | 多模型 CLI/API 兼容代理 | Codex、Claude Code、Gemini、Grok 等 | 2025-07-01 创建；2026-09-22 持续推送；约 52.7k Star、7.9k Fork；MIT | 正式生态参考但高风险；只研究协议兼容和隔离，不复用第三方账号凭据 |

CloudCLI、Opcode、Claude Code Router 和 CLIProxyAPI 需要分开描述：CloudCLI 是多 CLI 用户工作台，Opcode 是 Claude Code GUI/Toolkit，Claude Code Router 是模型路由控制面，CLIProxyAPI 是 API 兼容代理。它们不是同一种“Agent CLI”。

## 4. 商业中文通用与长文本助手

这些产品是 Vinkey 在中文长文阅读、附件处理、研究摘要、结构化结果和写作辅助方面的商业参考。它们均满足本轮 90 天存续、近期版本维护、应用商店反馈和外部市场认可条件。数据为中国区 iOS App Store 快照，采集日期为 `2026-09-22`；评分和评价数会随时间变化，不能视为精确活跃用户数。

本组内先按“对 Vinkey 长文/文档工作流的直接性”排序，再按中国区采用信号、近期维护和反馈质量排序。`Kimi`、`豆包`、`千问`、`元宝`是直接长文参考；`DeepSeek`、`讯飞星火`、`文心`是中文通用/行业写作相邻参考，但仍满足正式竞品门槛。

| 规范名称 | 竞品层级 | 公开验证快照 | 中国区用户反馈与市场认可 | 相关性评分 | Vinkey 用途 |
| --- | --- | --- | --- | ---: | --- |
| [Kimi](https://kimi.moonshot.cn/) | 直接长文竞品 | 2024-01-12 上线；当前版本 3.1.2，2026-09-11 更新 | 中国区 App Store 4.90/5，约 19.4 万条评分；长期被行业榜单和中文长文讨论作为长上下文产品观察 | 5.0 | 长上下文、文件问答、研究结果和引用体验 |
| [豆包](https://www.doubao.com/) | 直接长文竞品 | 2023-08-24 上线；当前版本 15.2.0，2026-09-21 更新 | 中国区 App Store 4.65/5，约 445.6 万条评分；QuestMobile/公开行业榜单长期位居中国 AI 原生 App 前列 | 4.5 | 附件、耗时入口、文档式结果、中文创作入口 |
| [千问](https://www.qianwen.com/)（历史品牌：通义） | 直接长文竞品 | 2023-10-31 上线；当前版本 7.3.6，2026-09-20 更新 | 中国区 App Store 4.21/5，约 30.9 万条评分；QuestMobile 公开榜单进入中国 AI 应用前列 | 4.5 | 长文分析、搜索与多模态结果、模型/产品分层 |
| [元宝](https://yuanbao.tencent.com/) | 直接长文竞品 | 2024-05-29 上线；当前版本 2.86.0，2026-09-20 更新 | 中国区 App Store 4.11/5，约 24.5 万条评分；QuestMobile/公开行业榜单持续跟踪 | 4.0 | 搜索、附件、长结果和产品入口组织 |
| [DeepSeek](https://www.deepseek.com/) | 中文通用/推理相邻竞品 | 2025-01-10 上线；当前版本 2.5.2，2026-09-20 更新 | 中国区 App Store 3.87/5，约 8.81 万条评分；公开行业榜单、开发者生态和国际用户讨论形成强市场信号 | 4.0 | 推理、长上下文和模型能力边界 |
| [讯飞星火](https://xinghuo.xfyun.cn/) | 中文通用/行业写作相邻竞品 | 2023-06-13 上线；当前版本 5.11.4，2026-09-17 更新 | 中国区 App Store 4.83/5，约 8.61 万条评分；持续产品发布和教育/办公行业采用讨论 | 3.5 | 中文写作、语音输入、专业场景和长文处理 |
| [文心](https://yiyan.baidu.com/)（历史品牌：文小言） | 中文通用相邻竞品 | 2023-06-29 上线；当前版本 5.20.0，2026-09-22 更新 | 中国区 App Store 4.19/5，约 1.93 万条评分；百度持续维护，公开用户反馈可复查 | 3.5 | 中文写作、知识问答和产品品牌迁移 |

上一版报告曾将多个产品笼统称为“长文助手样本”，因此出现正式名录遗漏。本版已将豆包、Kimi、千问、元宝、DeepSeek、讯飞星火和文心逐一登记，报告中的描述必须引用这些规范名称。

## 5. 商业文档办公工作台

| 规范名称 | 类型 | 公开验证快照 | 用户反馈与市场认可 | Vinkey 用途 |
| --- | --- | --- | --- | --- |
| [WPS Office AI](https://www.wps.cn/) | 商业文档办公工作台 | WPS App 2013-02-25 上线；当前版本 26.9.1，2026-09-16 更新 | 中国区 App Store 4.78/5，约 182.2 万条评分；金山办公公开财报和行业报道持续披露 AI 使用增长 | 文档编辑、办公文档 AI、导出和稳定保存 |

WPS Office AI 不与豆包、Kimi 等通用助手混为一类：它的核心竞品价值来自文档格式、编辑器、版本和办公交付，而不是通用对话或长上下文品牌。

## 6. 商业开发者 Agent

商业产品的采用规模不公开统一指标，因此本表使用官方版本/产品历史、官方支持或社区反馈、独立讨论/评测和持续商业运营作为市场认可证据。详细证据链见[商业与 Agent 产品报告](COMMERCIAL_AGENT_REPORT.md)。

本组按 Agent 任务控制、上下文、审批和开发者工作流与 Vinkey 的直接相关性排序。

| 规范名称 | 类型 | 市场认可充分条件证据 | Vinkey 用途 |
| --- | --- | --- | --- |
| [OpenAI Codex](https://learn.chatgpt.com/docs/overview) | 第一方 Agent 产品体系 | 官方产品文档、持续更新的 CLI/云端/远程产品、公开用户社区和开发者生态 | 任务合同、审批、后台任务、diff、恢复 |
| [Claude Code](https://code.claude.com/docs/en/overview) | 第一方 Agent 产品 | 官方文档、持续版本与支持社区、开发者生态和公开使用反馈 | Tool Loop、权限、Artifacts、Skills、会话控制 |
| [Cursor](https://cursor.com/) | 商业 AI 编辑器 | 官方 Changelog、公开论坛、长期产品运营和独立用户讨论 | 相关性上下文、编辑器内 Agent、diff |
| [GitHub Copilot](https://github.com/features/copilot) | 商业开发者 AI 平台 | 长期商业运营、官方 Changelog/社区、企业和开发者采用 | 索引优先、Ask/Research 分层、组织权限 |

## 7. 商业文学创作工具

本组按文学资产建模、受控上下文和创作协作与 Vinkey 的直接相关性排序。

| 规范名称 | 类型 | 市场认可充分条件证据 | Vinkey 用途 |
| --- | --- | --- | --- |
| [Novelcrafter](https://www.novelcrafter.com/features) | 商业文学创作工具 | 持续产品运营、功能文档、用户社区和写作者反馈 | Novelcrafter Codex 资产卡、别名、受控创作上下文 |
| [Sudowrite](https://www.sudowrite.com/) | 商业 AI 写作工具 | 持续商业运营、产品功能迭代、写作者社区和独立讨论 | 创意、续写、Story Bible 的低摩擦体验 |

## 8. 本地知识与编辑器工作台

本组按本地知识组织、文档导航和编辑器工作流与 Vinkey 的直接相关性排序。

| 规范名称 | 类型 | 市场认可充分条件证据 | Vinkey 用途 |
| --- | --- | --- | --- |
| [Obsidian](https://obsidian.md/) | 非开源本地知识工作台 | 长期版本维护、官方论坛/插件生态和大量用户反馈 | 本地库、文档导航、插件边界 |
| [Typora](https://typora.io/) | 非开源本地 Markdown 编辑器 | 长期商业发行、版本记录、用户社区和持续维护 | 低干扰编辑、预览和保存体验 |

## 9. 本轮证据入口

### 中国区 App Store 快照

- [豆包](https://apps.apple.com/cn/app/%E8%B1%86%E5%8C%85-%E7%94%9F%E6%B4%BB%E5%B7%A5%E4%BD%9C-ai-%E5%8A%A9%E6%89%8B/id6459478672?uo=4)
- [Kimi](https://apps.apple.com/cn/app/kimi/id6474233312?uo=4)
- [元宝](https://apps.apple.com/cn/app/%E5%85%83%E5%AE%9D-%E8%85%BE%E8%AE%AF%E5%85%A8%E8%83%BDai%E5%8A%A9%E6%89%8B/id6480446430?uo=4)
- [千问](https://apps.apple.com/cn/app/%E5%8D%83%E9%97%AE-%E9%98%BF%E9%87%8Cai%E5%8A%A9%E6%89%8B/id6466733523?uo=4)
- [文心](https://apps.apple.com/cn/app/%E6%96%87%E5%BF%83-%E7%99%BE%E5%BA%A6%E6%97%97%E4%B8%8B%E5%85%A8%E8%83%BDai%E5%8A%A9%E6%89%8B/id6446882473?uo=4)
- [讯飞星火](https://apps.apple.com/cn/app/%E8%AE%AF%E9%A3%9E%E6%98%9F%E7%81%AB-%E6%87%82%E4%BD%A0%E7%9A%84ai%E5%8A%A9%E6%89%8B/id6449919551?uo=4)
- [DeepSeek](https://apps.apple.com/cn/app/deepseek-ai-%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/id6737597349?uo=4)
- [WPS Office](https://apps.apple.com/cn/app/wps-office-%E6%99%BA%E8%83%BDai%E5%8A%9E%E5%85%AC%E5%8A%A1%E5%8A%A9%E6%89%8B/id599852710?uo=4)

### 行业与产品维护证据

- [QuestMobile 研究报告入口](https://www.questmobile.com.cn/research/report-new)：用于复核中国 AI 原生 App 榜单、月活与行业趋势；榜单数字不替代产品自身的用户反馈证据。
- [QuestMobile 2025 年 AI 应用榜报道（观察者网）](https://www.guancha.cn/economy/2026_03_03_810328.shtml)：用于交叉核验豆包、DeepSeek、元宝、千问等产品的行业认知。
- [金山办公 WPS Office](https://www.wps.cn/)：用于复核 WPS Office 产品与 AI 文档工作台定位；财报和行业报道用于补充 AI 使用增长，不将 WPS AI 与通用助手混为一类。

## 10. 设计来源与观察对象（不属于正式竞品）

以下对象有局部设计启发，但本轮不满足市场认可充分条件，不能在正式竞品分析中写成成熟竞品：

| 对象 | 保留原因 | 未通过的主要条件 | 使用规则 |
| --- | --- | --- | --- |
| Knote | AI 修改提案和人工接受的设计启发 | 公开存续/采用规模不足 | 仅作为 DiffProposal 设计来源 |
| StorySphere | 人物、关系、事件抽取流水线 | Star、外部反馈和市场采用不足 | 仅作为人物资产 ETL 设计来源 |
| graphify-novel | 章节批处理、缓存和 review 思路 | 公开存续时间和市场证据不足 | 仅作为图谱增量处理设计来源 |
| NLP-Characters-Relationships | NER/共现候选抽取 | 维护和采用证据不足 | 仅作为候选生成实验来源 |
