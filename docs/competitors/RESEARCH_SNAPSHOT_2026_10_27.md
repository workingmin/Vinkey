# 竞品资料复核快照 · 2026-10-27

本文件保存本轮可复查的文字事实，不存放竞品视觉素材。收录与设计结论见[正式名录](COMPETITOR_CATALOG.md)，证据规则见[筛选方法论](SELECTION_METHODOLOGY.md)。采集日为 2026-10-27；下表 API 时间均按 **UTC** 截取日期，不代表北京时间的发行日。

## 1. 本轮核验范围

- 独立市场资料：QuestMobile 2026 年三季度报告（2026-10-20 发布，办公 Agent 数据对应 9 月）。[原报告](https://www.questmobile.com.cn/research/report/2112396781593624578/)；前三产品和口径见名录第 2 节。类型 M。
- 12 个既有开源条目：GitHub 仓库 API 与最近发行列表。类型 O/P；不是逐行代码、全部 Issue 或完整 180 天维护审计。
- 8 个中国区 iOS 条目：Apple Lookup 分发信息。类型 P；不是桌面或网页实测。
- 商业产品：官方维护、文档与状态页，见第 4 节。类型 O，第三方报道另标 S。
- 用户直接体验：此前 WorkBuddy“分析小说”会话，类型 U；没有将图像写入仓库，也没有把这次观察扩展成所有版本行为。

采用规模、维护迹象、具体交互和设计结论分别记录。本轮未登录各商业产品账号，不声称核验所有平台、套餐与当前界面。

## 2. 开源仓库快照

请求方式为 GitHub REST `GET /repos/{owner}/{repo}` 与 `GET /repos/{owner}/{repo}/releases?per_page=3`。仓库创建日不等于产品上线日，最后推送不等于实质维护；Star/Fork 不等于安装用户或中国区市场份额。所有 12 个仓库的 `archived` 在本次响应中均为 `false`。

| 仓库 / 元数据来源 | 创建日 | 最后推送 | Star / Fork | 仓库级许可证标识 |
| --- | --- | --- | ---: | --- |
| [CherryHQ/cherry-studio](https://api.github.com/repos/CherryHQ/cherry-studio) | 2024-05-24 | 2026-10-27 | 53,017 / 5,134 | AGPL-3.0 |
| [codexu/note-gen](https://api.github.com/repos/codexu/note-gen) | 2024-08-06 | 2026-10-27 | 12,924 / 977 | GPL-3.0 |
| [marktext/marktext](https://api.github.com/repos/marktext/marktext) | 2017-11-12 | 2026-10-27 | 63,164 / 4,667 | MIT |
| [Aider-AI/aider](https://api.github.com/repos/Aider-AI/aider) | 2023-05-09 | 2026-05-22 | 49,771 / 5,106 | Apache-2.0 |
| [cline/cline](https://api.github.com/repos/cline/cline) | 2024-07-06 | 2026-10-27 | 70,911 / 7,769 | Apache-2.0 |
| [continuedev/continue](https://api.github.com/repos/continuedev/continue) | 2023-05-24 | 2026-10-27 | 36,344 / 5,526 | Apache-2.0 |
| [anomalyco/opencode](https://api.github.com/repos/anomalyco/opencode) | 2025-04-30 | 2026-10-27 | 222,112 / 29,715 | MIT |
| [OpenHands/OpenHands](https://api.github.com/repos/OpenHands/OpenHands) | 2024-03-13 | 2026-10-27 | 91,970 / 12,217 | MIT |
| [siteboon/claudecodeui](https://api.github.com/repos/siteboon/claudecodeui) | 2025-06-25 | 2026-10-27 | 14,303 / 2,078 | AGPL-3.0 |
| [winfunc/opcode](https://api.github.com/repos/winfunc/opcode) | 2025-06-19 | 2026-09-18 | 22,421 / 1,707 | AGPL-3.0 |
| [musistudio/claude-code-router](https://api.github.com/repos/musistudio/claude-code-router) | 2025-02-25 | 2026-10-10 | 37,868 / 3,178 | MIT |
| [router-for-me/CLIProxyAPI](https://api.github.com/repos/router-for-me/CLIProxyAPI) | 2025-07-01 | 2026-10-27 | 56,544 / 8,644 | MIT |

### 本次返回的发行记录

记录接口返回的至多三条发行，保留渠道与预发行标记。列表不保证覆盖所有产品渠道；“非预发行”仅指 GitHub 的标记，不自动代表企业、网页或所有操作系统的稳定版。

| 仓库 | 发行记录（UTC；按接口返回顺序） |
| --- | --- |
| [CherryHQ/cherry-studio](https://api.github.com/repos/CherryHQ/cherry-studio/releases?per_page=3) | [v2.1.8](https://github.com/CherryHQ/cherry-studio/releases/tag/v2.1.8) · 2026-10-26 · 非预发行；[v2.1.7](https://github.com/CherryHQ/cherry-studio/releases/tag/v2.1.7) · 2026-10-19 · 非预发行；[v2.1.6](https://github.com/CherryHQ/cherry-studio/releases/tag/v2.1.6) · 2026-10-11 · 非预发行 |
| [codexu/note-gen](https://api.github.com/repos/codexu/note-gen/releases?per_page=3) | [note-gen-v0.39.0](https://github.com/codexu/note-gen/releases/tag/note-gen-v0.39.0) · 2026-10-25 · 非预发行；[note-gen-v0.38.3](https://github.com/codexu/note-gen/releases/tag/note-gen-v0.38.3) · 2026-10-18 · 非预发行；[note-gen-v0.38.2](https://github.com/codexu/note-gen/releases/tag/note-gen-v0.38.2) · 2026-10-09 · 非预发行 |
| [marktext/marktext](https://api.github.com/repos/marktext/marktext/releases?per_page=3) | [v0.23.0](https://github.com/marktext/marktext/releases/tag/v0.23.0) · 2026-10-21 · 非预发行；[v0.22.0](https://github.com/marktext/marktext/releases/tag/v0.22.0) · 2026-10-18 · 非预发行；[v0.21.2](https://github.com/marktext/marktext/releases/tag/v0.21.2) · 2026-10-11 · 非预发行 |
| [Aider-AI/aider](https://api.github.com/repos/Aider-AI/aider/releases?per_page=3) | [v0.86.0](https://github.com/Aider-AI/aider/releases/tag/v0.86.0) · 2025-08-09 · 非预发行；[v0.85.0](https://github.com/Aider-AI/aider/releases/tag/v0.85.0) · 2025-06-27 · 非预发行；[v0.84.0](https://github.com/Aider-AI/aider/releases/tag/v0.84.0) · 2025-05-30 · 非预发行 |
| [cline/cline](https://api.github.com/repos/cline/cline/releases?per_page=3) | [v4.1.26](https://github.com/cline/cline/releases/tag/v4.1.26) · 2026-10-26 · 非预发行；[sdk/sdk/v0.2.0](https://github.com/cline/cline/releases/tag/sdk/sdk/v0.2.0) · 2026-10-26 · 非预发行；[desktop-v0.0.49](https://github.com/cline/cline/releases/tag/desktop-v0.0.49) · 2026-10-26 · 非预发行 |
| [continuedev/continue](https://api.github.com/repos/continuedev/continue/releases?per_page=3) | [v2.1.0-vscode](https://github.com/continuedev/continue/releases/tag/v2.1.0-vscode) · 2026-06-19 · 预发行；[v2.0.0-vscode](https://github.com/continuedev/continue/releases/tag/v2.0.0-vscode) · 2026-06-19 · 非预发行；[v1.3.40-vscode](https://github.com/continuedev/continue/releases/tag/v1.3.40-vscode) · 2026-06-15 · 预发行 |
| [anomalyco/opencode](https://api.github.com/repos/anomalyco/opencode/releases?per_page=3) | [v1.19.4](https://github.com/anomalyco/opencode/releases/tag/v1.19.4) · 2026-10-22 · 非预发行；[v1.19.3](https://github.com/anomalyco/opencode/releases/tag/v1.19.3) · 2026-10-16 · 非预发行；[v1.19.2](https://github.com/anomalyco/opencode/releases/tag/v1.19.2) · 2026-10-16 · 非预发行 |
| [OpenHands/OpenHands](https://api.github.com/repos/OpenHands/OpenHands/releases?per_page=3) | [v1.33.0](https://github.com/OpenHands/OpenHands/releases/tag/v1.33.0) · 2026-10-23 · 非预发行；[v1.32.0](https://github.com/OpenHands/OpenHands/releases/tag/v1.32.0) · 2026-10-23 · 非预发行；[v1.31.0](https://github.com/OpenHands/OpenHands/releases/tag/v1.31.0) · 2026-10-22 · 非预发行 |
| [siteboon/claudecodeui](https://api.github.com/repos/siteboon/claudecodeui/releases?per_page=3) | [v1.37.5](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.5) · 2026-10-17 · 非预发行；[v1.37.4](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.4) · 2026-10-09 · 非预发行；[v1.37.3](https://github.com/siteboon/claudecodeui/releases/tag/v1.37.3) · 2026-09-08 · 非预发行 |
| [winfunc/opcode](https://api.github.com/repos/winfunc/opcode/releases?per_page=3) | [v0.2.0](https://github.com/winfunc/opcode/releases/tag/v0.2.0) · 2025-08-31 · 非预发行；[v0.1.0](https://github.com/winfunc/opcode/releases/tag/v0.1.0) · 2025-08-15 · 非预发行 |
| [musistudio/claude-code-router](https://api.github.com/repos/musistudio/claude-code-router/releases?per_page=3) | [v3.1.3](https://github.com/musistudio/claude-code-router/releases/tag/v3.1.3) · 2026-10-09 · 非预发行；[v3.1.2](https://github.com/musistudio/claude-code-router/releases/tag/v3.1.2) · 2026-10-08 · 非预发行；[v3.1.1](https://github.com/musistudio/claude-code-router/releases/tag/v3.1.1) · 2026-09-16 · 非预发行 |
| [router-for-me/CLIProxyAPI](https://api.github.com/repos/router-for-me/CLIProxyAPI/releases?per_page=3) | [v8.0.44](https://github.com/router-for-me/CLIProxyAPI/releases/tag/v8.0.44) · 2026-10-26 · 非预发行；[v8.0.43](https://github.com/router-for-me/CLIProxyAPI/releases/tag/v8.0.43) · 2026-10-25 · 非预发行；[v8.0.42](https://github.com/router-for-me/CLIProxyAPI/releases/tag/v8.0.42) · 2026-10-24 · 非预发行 |

复核结论：Aider 的公开发行和最后推送均较久，Opcode 的公开发行较久，二者进入维护复核；不声称它们已归档或已停止服务。Continue 有近期推送，但本次返回的 VS Code 发行较早，且最新条目为预发行，须按渠道复核。许可证仅为 API 标识，使用代码前仍需文件级审查。

## 3. 中国区 iOS 快照

通过 Apple Lookup 的 `country=cn` 查询。评分为五分制，保留两位小数；评价数是所有版本累计评分数，不是当前版本评论数，也不代表活跃或付费用户。首次发行日期来自商店字段，不等于该品牌或网页产品创立日期。

| 产品 / 分发入口 | 版本 | 本版发行日 | 首次发行日 | 评分 / 评价数 | 查询来源 |
| --- | --- | --- | --- | ---: | --- |
| [豆包](https://apps.apple.com/cn/app/id6459478672) | 15.5.0 | 2026-10-26 | 2023-08-24 | 4.64 / 5,052,336 | [Apple Lookup](https://itunes.apple.com/lookup?id=6459478672&country=cn) |
| [Kimi](https://apps.apple.com/cn/app/id6474233312) | 3.1.6 | 2026-10-24 | 2024-01-12 | 4.89 / 195,128 | [Apple Lookup](https://itunes.apple.com/lookup?id=6474233312&country=cn) |
| [元宝](https://apps.apple.com/cn/app/id6480446430) | 2.90.10 | 2026-10-26 | 2024-05-29 | 4.11 / 253,107 | [Apple Lookup](https://itunes.apple.com/lookup?id=6480446430&country=cn) |
| [千问](https://apps.apple.com/cn/app/id6466733523) | 7.5.2 | 2026-10-25 | 2023-10-31 | 4.26 / 343,419 | [Apple Lookup](https://itunes.apple.com/lookup?id=6466733523&country=cn) |
| [文心](https://apps.apple.com/cn/app/id6446882473) | 5.21.0 | 2026-10-22 | 2023-06-29 | 4.19 / 19,414 | [Apple Lookup](https://itunes.apple.com/lookup?id=6446882473&country=cn) |
| [讯飞星火](https://apps.apple.com/cn/app/id6449919551) | 5.11.7 | 2026-10-17 | 2023-06-13 | 4.83 / 86,088 | [Apple Lookup](https://itunes.apple.com/lookup?id=6449919551&country=cn) |
| [DeepSeek](https://apps.apple.com/cn/app/id6737597349) | 2.7.1 | 2026-10-23 | 2025-01-10 | 3.85 / 91,401 | [Apple Lookup](https://itunes.apple.com/lookup?id=6737597349&country=cn) |
| [WPS Office](https://apps.apple.com/cn/app/id599852710) | 26.10.1 | 2026-10-23 | 2013-02-25 | 4.79 / 1,871,684 | [Apple Lookup](https://itunes.apple.com/lookup?id=599852710&country=cn) |

这些快照更新旧版 2026-09-22 的数值。它们不证明网页/桌面过程文案、默认折叠层数或具体长文能力。WPS Office 数据覆盖整套应用，不单独证明 WPS AI 采用；豆包、千问、Kimi 等通用应用的数据不转给各自办公 Agent。

## 4. 官方维护与服务状态核验

本表的版本/日期是本轮可读取记录，未注明日期的页面不补造发布日期。来源角色 O=官方，S=新闻转述；产品的市场认可另由名录中的市场/平台证据支持。

| 对象 | 来源与本轮所见记录 | 可支持范围与限制 |
| --- | --- | --- |
| WorkBuddy | O：[Changelog](https://www.codebuddy.cn/docs/workbuddy/Changelog)，2026-03-04 上线，10-20 的 5.9.0 | 身份与维护；[Conversation](https://www.codebuddy.cn/docs/workbuddy/Conversation)及[任务管理](https://www.codebuddy.cn/docs/workbuddy/Task-Management)支持声明的交互范围；默认界面需实测 |
| 百度搭子个人版 | O：[更新动态](https://cloud.baidu.com/doc/Dumate/s/cmmu7shvw)，03-23 起有记录，10-24 的 v1.0.88 | 个人版维护；[FAQ](https://cloud.baidu.com/discover/dumate-faq-guide-help.html)支持声明的过程可见性；不外推企业版 |
| 千问办公 | O：[阿里云文档](https://help.aliyun.com/zh/qwenwork)、[桌面日志](https://docs.qwenwork.cn/release-notes/desktop)，10-15 的 1.3.1、10-09 的 1.2.5 | 身份与连续修复；公开问题记录不是独立体验复测 |
| TRAE / 原 TraeWork | O：[旧日志](https://docs.trae.cn/work_changelog)，08-21 的 v0.1.49～0.1.52；[迁移说明](https://docs.trae.cn/work_traework-to-traecode-data-migration) | 旧版维护与融合方向；迁移说明未标日期，不能替新产品补造版本/统计 |
| QClaw | O：[产品入口](https://qclaw.qq.com/)的迁移/停服提示；S：[澎湃 09-24 报道](https://www.thepaper.cn/newsDetail_forward_34140067)称腾讯确认 12-24 00:00 停服 | 未来停服计划；10-27 时未到停服日 |
| Kimi Work | O：[10-08 官方介绍](https://www.kimi.com/resources/kimi-work-introduction) | 新桌面任务产品身份；长期稳定性与独立采用待核验 |
| OpenAI Codex | O：[官方资料](https://developers.openai.com/learn/codex)、[CLI 稳定发行](https://github.com/openai/codex/releases/tag/rust-v0.164.0)，10-23 | 通过 [latest API](https://api.github.com/repos/openai/codex/releases/latest)确认非预发行；10-27 的 alpha 标签不当稳定版 |
| Claude Code | O：[v2.1.311](https://github.com/anthropics/claude-code/releases/tag/v2.1.311)，10-26 UTC | CLI 发行；不替代其他产品渠道版本 |
| Cursor | O：[Changelog](https://cursor.com/changelog)，10-20 | 有产品更新，不等于已复测全部 Agent 交互 |
| GitHub Copilot | O：[官方更新索引](https://github.blog/changelog/label/copilot/)，10-26 | 有产品更新；各 IDE/套餐行为分开 |
| Novelcrafter | O：[10-19 更新](https://www.novelcrafter.com/changelog/october-19th-2026) | 导入与创作资产维护，不证明中文市场采用 |
| Sudowrite | O：[更新/反馈入口](https://feedback.sudowrite.com/changelog)，10-23 | 产品维护与反馈入口，不证明中文生成质量 |
| Obsidian | O：[更新日志](https://obsidian.md/changelog/)，10 月桌面/移动记录 | 保留渠道区分，不以早期访问版本代表公开稳定版 |
| Typora | O：[稳定发行](https://www.typora.io/releases/stable.html)，1.14.15 | 版本记录可查，该条无明确日期，不将采集日当发行日 |

## 5. 未完成的核验

- 豆包工作等候选的独立官方身份、当前更新与中文文档任务实测，见名录候选表；不使用仿站补证。
- 各正式竞品的真实中文字符串、展开默认值、历史重开和失败控制；官方功能描述不能替代界面观察。
- 全部商业产品的中国区收入/付费份额，以及跨端活跃去重；本轮不作这些结论。
- 旧研究来源 SoloMD、Knote、StorySphere、graphify-novel、NLP-Characters-Relationships 没有完成全面刷新，维持观察身份。
