# 正式竞品名录

- 复核日期：**2026-10-27**。市场统计月份、产品版本和资料发布日期分别记录，不把采集日当作数据所属日。
- 产品定位：**Vinkey 是本地中文创作工作台**。中国区同类产品的中文界面、任务过程、文档操作与交付文案是优先参考；本地文件、创作资产与人工审稿是独立评估维度。
- 收录方法：[筛选方法论](SELECTION_METHODOLOGY.md)；名称边界：[术语规范](TERMINOLOGY.md)；可复查数据：[本轮资料快照](RESEARCH_SNAPSHOT_2026_10_27.md)。
- 本版撤销 WorkBuddy、百度搭子此前以“用户指定”为依据的收录结论，按统一的产品身份、同类市场采用、持续维护与场景相关性重新评估。下文结论来自证据，不设置指定产品例外。

## 1. 名录如何使用

名录区分**正式竞品、专项参考、观察对象、维护复核**。正式竞品不表示已实测所有功能，也不表示应集成其服务。专项参考只对特定设计问题成立；观察对象不与已核验产品并列作成熟度背书。

| 设计问题 | 优先参考 | 补充参考 | Vinkey 的取舍依据 |
| --- | --- | --- | --- |
| 中文任务状态、继续执行、过程折叠与历史查阅 | 中国区办公类 AI Agent：WorkBuddy、百度搭子、千问办公 | 中文通用助手；开发者 Agent 的执行机制 | 中文用户是否读得懂，状态是否对应实际事件，过程能否自主查阅 |
| 本地中文文稿、工作区与模型连接 | NoteGen、Cherry Studio；WPS 的文档操作 | MarkText、Obsidian、Typora | 本地文件归属、中文输入、保存/恢复、正文外发边界 |
| 长文阅读、附件与分析结果 | Kimi、豆包、千问、元宝 | DeepSeek、讯飞星火、文心 | 中文长文、引用、范围、结果可读性；聊天与办公模式分开验证 |
| 人物、设定、章节与创作审核 | 中文创作任务的实际需求；Novelcrafter、Sudowrite 的专项设计 | 通用文档工具 | 文学领域能力具有专项优先级，海外产品的英文文案不能直接成为中文规范 |
| 上下文、工具循环、权限与恢复 | 已验证的开发者 Agent、开源生态 | 历史实现与研究项目 | 可用于机制研究；不以开发者术语主导创作者界面 |

以上是设计参考顺序，不是综合市场排名。中文同类产品对界面与文案更有参考价值，但不能由中文品牌推断离线运行、本地存储或隐私保证。旧版未附逐项证据的综合分数撤下，改为说明具体用途与证据范围。

## 2. 中国区办公类 AI Agent

### 2.1 分类与市场依据

本类指面向中国区用户，能够围绕办公/文档目标推进多步任务、调用工具并交付结果的用户产品。纯模型、通用聊天入口、API 代理和仅面向编码的 IDE 不因带有“Agent”字样自动归入本类。包含办公能力的产品如发生定位迁移，另记当前状态。

**独立市场证据 M1：** QuestMobile 于 2026-10-20 发布的《2026 年三季度 AI 应用市场发展报告》，列出 2026 年 9 月典型办公类 Agent 的合计活跃用户规模。报告正文给出的前三为：

| 报告内顺位 | 产品 | 2026 年 9 月合计活跃用户 |
| --- | --- | ---: |
| 1 | WorkBuddy | 3235.3 万 |
| 2 | 百度搭子 | 977 万 |
| 3 | 千问办公 | 790.5 万 |

来源：[QuestMobile 原报告](https://www.questmobile.com.cn/research/report/2112396781593624578/)；[上海证券报报道（东方财富转载）](https://finance.eastmoney.com/a/202610203901402234.html)交叉核对统计口径。报道转载同一调查，不计为第二份独立测量。

**本轮可以确认 WorkBuddy、百度搭子在该报告、该月份、该典型办公 Agent 统计中的活跃规模居前二。** 该指标涵盖 App、PC 网页和 PC 客户端的合计活跃规模；本轮未独立核实跨端去重方法与完整市场分母，不据此计算百分比，也不写成收入、付费用户或全部办公软件的“市占率前二”。不同机构的访问量榜单、仅 PC 榜单和 AI 原生 App 榜单不能混排。

### 2.2 重新评估后的正式竞品

| 产品与比较范围 | 官方身份与维护证据 | 市场/使用证据 | 收录结论与 Vinkey 用途 | 仍需验证 |
| --- | --- | --- | --- | --- |
| **[WorkBuddy](https://www.codebuddy.cn/docs/workbuddy/Conversation)**，腾讯；以中国区桌面任务对话为主要比较表面 | [更新日志](https://www.codebuddy.cn/docs/workbuddy/Changelog)：2026-03-04 上线，10-20 有 5.9.0 记录；[任务管理](https://www.codebuddy.cn/docs/workbuddy/Task-Management)说明任务状态与继续处理 | M1 的独立采用数据；会话内“分析小说”实际观察；[App Store 分发](https://apps.apple.com/cn/app/id6761374913)可定位 | **正式竞品，中文过程交互优先参考。** 产品存续、持续维护、同类采用与多步文档任务证据相互支持；研究推进段、状态、过程与结果关联 | 当前桌面版本的默认展开值、历史重开、异常恢复；用户截图版本未核定，不外推全端行为 |
| **[百度搭子](https://dumate.baidu.com/app)**（DuMate），以个人版为主要比较范围 | [个人版更新动态](https://cloud.baidu.com/doc/Dumate/s/cmmu7shvw)：2026-03-23 起有版本记录，10-24 有 v1.0.88；[常见问题](https://cloud.baidu.com/discover/dumate-faq-guide-help.html)描述过程中的文件、脚本和浏览器操作；[订阅协议](https://cloud.baidu.com/doc/Dumate/s/ymowkv4zo)明确服务身份 | M1 的独立采用数据；[开发者社区体验文章](https://developer.baidu.com/article/detail.html?id=8272707)为使用线索，作者内容不当作官方承诺 | **正式竞品，中文办公任务优先参考。** 采用、维护和任务执行能力均有可定位来源；研究动作对象、任务归属、文件交付 | 个人版精确中文标签、折叠行为与中断恢复待实测；企业版资料不能替代个人版 |
| **[千问办公](https://qwenwork.cn/)**（QwenWork），桌面与网页分别观察 | [阿里云官方产品文档](https://help.aliyun.com/zh/qwenwork)确认产品与办公执行范围；[桌面更新日志](https://docs.qwenwork.cn/release-notes/desktop)：2026-10-09 的 1.2.5、10-15 的 1.3.1，涉及执行、历史与反馈问题修复 | M1 的独立采用数据；更新日志提供具体使用问题及修复记录，尚未完成独立体验复测 | **正式竞品，中文任务文案优先参考。** 有同类采用与持续维护证据；研究等待、长耗时活动、权限记录、历史恢复和产物交付 | 各端实际布局、默认折叠值及修复后的行为；不以“千问”App 数据代替其市场数据 |

“优先参考”是研究优先级，不等于认为它们的所有交互更优。中文任务文案应在同一任务下比较，并由 Vinkey 的真实事件和用户需求决定。

### 2.3 同类候选与产品迁移

除前三外，[快科技报道（站长之家转载）](https://www.chinaz.com/2026/1021/1783126.shtml)还列出 QClaw、豆包工作、TRAE Work、Qoderwork、AutoClaw、QwenPaw、LobsterAI。以下保留同类检索范围，但不把报道列名视为完成产品与体验核验。

| 对象 | 本轮可确认情况 | 当前登记与下一步 |
| --- | --- | --- |
| **豆包工作** | 上述市场报道单列该产品；不能借用豆包通用 App 的版本、评分或月活来证明桌面办公体验 | **优先观察**。补齐官方独立产品/模式入口、更新记录及真实任务操作；尤其是中文过程、文件交付和历史查询 |
| **TRAE / 原 TraeWork**（榜单名 TRAE Work） | [旧产品日志](https://docs.trae.cn/work_changelog)有 2026-08-21 更新；[官方迁移说明](https://docs.trae.cn/work_traework-to-traecode-data-migration)现已说明 TraeWork 与 TraeCode 融合为 TRAE，重心转向 Agent 与 IDE 开发流程 | **专项参考，迁移复核**。保留旧办公表面的历史价值；当前入口需重新实测，不把 9 月旧名称统计直接解释为新产品采用量。迁移页面未标发布日期，本轮仅记录核对日 |
| **QClaw** | [官方入口](https://qclaw.qq.com/)出现迁移/停服提示；[澎湃报道](https://www.thepaper.cn/newsDetail_forward_34140067)于 2026-09-24 报道腾讯确认将于 **2026-12-24 00:00** 停服 | **退出跟踪**。截至本轮日期尚未到停服日；不作为长期现役交互基准，可观察历史迁移与结果保存 |
| **Kimi Work** | [官方介绍](https://www.kimi.com/resources/kimi-work-introduction)更新于 2026-10-08，说明桌面持续任务与过程介入 | **优先观察**。单独核验新产品的维护与采用；Kimi 通用 App 的成熟度不能整体转移到此产品 |
| Qoderwork、AutoClaw、QwenPaw、LobsterAI | 上述市场报道有列名，本轮未逐项完成官方身份、当前维护和中文文档场景核验 | **候选观察**。先核验官方来源与产品边界，再决定是否升级；不因规模小直接排除 |

## 3. 本地文档与中文 AI 工作台

以下以官方仓库身份、发行记录和社区采用作为证据；具体数据见[仓库快照](RESEARCH_SNAPSHOT_2026_10_27.md#2-开源仓库快照)。GitHub 采用信号不等于中国区用户份额。

| 产品 | 本轮维护记录（UTC 日期） | 收录与参考重点 | 边界 |
| --- | --- | --- | --- |
| [NoteGen](https://github.com/codexu/note-gen) | note-gen-v0.39.0，2026-10-25；10 月多次发行 | **正式竞品**；本地 Markdown、中文内容工作区、会话与文档组织 | GPL-3.0；参考产品行为，独立实现；实际中文创作流程需持续观察 |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | v2.1.8，2026-10-26；10 月多次发行 | **正式竞品**；多模型工作台、连接状态、模型配置与中文交互 | AGPL-3.0；多模型丰富度不等于文学创作适配度 |
| [MarkText](https://github.com/marktext/marktext) | v0.23.0，2026-10-21 | **编辑器专项参考**；编辑/预览、文件与保存状态 | MIT；不再把纯编辑器与完整 AI 工作台按总分混排 |

## 4. 中国区通用助手与文档办公产品

这组是正式的相邻竞品，用于中文阅读、写作、附件与结果表达。它们不自动归入办公 Agent。下表为 **2026-10-27 采集的中国区 iOS 版本**；版本日期为 UTC，不能替代网页、桌面或各 Agent 模式的版本。评分、评价数和原始查询入口见[商店快照](RESEARCH_SNAPSHOT_2026_10_27.md#3-中国区-ios-快照)。表内不作市场排名。

| 产品 | iOS 版本 / 更新日 | Vinkey 的参考场景 | 必须分开的对象 |
| --- | --- | --- | --- |
| [Kimi](https://www.kimi.com/) | 3.1.6 / 2026-10-24 | 长文阅读、文件问答、分析结果 | 通用 App、网页 Agent、Kimi Work、Kimi Code |
| [豆包](https://www.doubao.com/) | 15.5.0 / 2026-10-26 | 中文创作、附件、长结果表达 | 通用助手与豆包工作 |
| [千问](https://www.qianwen.com/) | 7.5.2 / 2026-10-25 | 中文长文、多模态与结果组织 | 通用 App、千问办公与 Qwen 模型 |
| [元宝](https://yuanbao.tencent.com/) | 2.90.10 / 2026-10-26 | 附件、搜索与长结果导航 | 元宝、WorkBuddy 与 CodeBuddy |
| [DeepSeek](https://www.deepseek.com/) | 2.7.1 / 2026-10-23 | 中文推理结果和回答组织 | 用户应用与模型/API |
| [讯飞星火](https://xinghuo.xfyun.cn/) | 5.11.7 / 2026-10-17 | 中文写作、语音输入与专业文档入口 | 通用产品与行业方案 |
| [文心](https://yiyan.baidu.com/) | 5.21.0 / 2026-10-22 | 中文写作、知识问答与品牌迁移 | 文心应用、模型与百度搭子 |
| [WPS Office AI](https://www.wps.cn/) | WPS Office 26.10.1 / 2026-10-23 | 文档编辑、修改、保存、导出与格式交付 | 整套 WPS 的商店评价不等于 AI 功能采用，更不等于独立办公 Agent 月活 |

上述版本和商店评价可以证明分发、维护与用户反馈入口；不能单独证明长文本上限、桌面交互、AI 使用增长或某项能力优劣。本轮不沿用缺少直接财报出处的增长结论。

## 5. 文学创作、本地知识与编辑器专项参考

中文交互优先，并不排除文学结构或本地编辑方面更贴近需求的专项产品。以下保留正式专项参考身份，不声称拥有已核验的中国区市场份额。

| 产品 | 本轮官方维护核验 | 专项价值与边界 |
| --- | --- | --- |
| [Novelcrafter](https://www.novelcrafter.com/features) | [2026-10-19 更新](https://www.novelcrafter.com/changelog/october-19th-2026)涉及小说导入和 Codex 问题修复 | 人物/设定资产、章节与受控上下文；Novelcrafter Codex 不是 OpenAI Codex；中文文案另行设计 |
| [Sudowrite](https://www.sudowrite.com/) | [官方更新与反馈](https://feedback.sudowrite.com/changelog)有 2026-10-23 记录 | 创意、续写和 Story Bible 的创作流程；不由英文体验推断中文生成质量 |
| [Obsidian](https://obsidian.md/) | [更新日志](https://obsidian.md/changelog/)持续有 2026-10 月记录，含桌面/移动及早期访问渠道 | 本地库、文档导航与链接；渠道分别核对，不把 Catalyst 版本写成公开稳定版；非开源产品 |
| [Typora](https://typora.io/) | [稳定发行页](https://www.typora.io/releases/stable.html)列出 1.14.15；页面未给该条明确发布日期 | 低干扰 Markdown 编辑、保存/导出；不能据采集日补造发布日期；非开源产品 |

## 6. 开发者 Agent 与集成生态专项参考

这组对运行机制、上下文、权限和恢复有价值，**在中文创作者界面与任务文案研究中的优先级低于同类中文产品**。收录为参考不等于当前集成计划、依赖推荐或许可证审查通过。

### 6.1 商业开发者 Agent

| 产品 | 本轮核验来源/记录 | 参考范围 |
| --- | --- | --- |
| [OpenAI Codex](https://developers.openai.com/learn/codex) | [CLI 稳定发行 rust-v0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0)，2026-10-23；不以 alpha 标签代表稳定版 | 任务、权限与可审阅修改；CLI、IDE、云端分开观察，通用 ChatGPT 页面不直接证明 Codex 专属行为 |
| [Claude Code](https://code.claude.com/docs/en/overview) | [v2.1.311](https://github.com/anthropics/claude-code/releases/tag/v2.1.311)，2026-10-26 UTC | 工具循环、权限、会话控制；终端表达不能直接成为中文创作工作台文案 |
| [Cursor](https://cursor.com/) | [Changelog](https://cursor.com/changelog)有 2026-10-20 更新 | 上下文、修改审阅、任务控制；本地与后台 Agent 分开 |
| [GitHub Copilot](https://github.com/features/copilot) | [官方更新](https://github.blog/changelog/label/copilot/)有 2026-10-26 记录 | 索引、上下文与组织权限；不同 IDE、计划和企业设置分别验证 |

### 6.2 开源 Agent、工作台与代理

仓库、发行与许可证数据来自[本轮快照](RESEARCH_SNAPSHOT_2026_10_27.md#2-开源仓库快照)。日期为 UTC；许可证字段是仓库级标识，不代替文件级审查。

| 产品 | 可核验发行/维护记录 | 当前分类与用途 |
| --- | --- | --- |
| [Cline](https://github.com/cline/cline) | v4.1.26，2026-10-26；SDK/桌面另有版本 | **专项参考**：工具循环、审批和执行记录；Apache-2.0 |
| [Continue](https://github.com/continuedev/continue) | 2026-10-27 有推送；本次 Release 列表中 VS Code 稳定版 v2.0.0 为 06-19，v2.1.0 为预发行 | **专项参考，渠道复核**：上下文 Provider；仓库活跃不能证明每个发行渠道及时更新；Apache-2.0 |
| [OpenCode](https://github.com/anomalyco/opencode) | v1.19.4，2026-10-22 | **专项参考**：多模型 CLI、会话；MIT |
| [OpenHands](https://github.com/OpenHands/OpenHands) | v1.33.0，2026-10-23 | **专项参考**：任务、隔离、后台执行；仓库 API 标识 MIT，具体模块另查 |
| [CloudCLI](https://github.com/siteboon/claudecodeui)（仓库 claudecodeui） | v1.37.5，2026-10-17 | **专项参考**：多 Agent CLI 的项目/会话控制面；AGPL-3.0 |
| [Claude Code Router](https://github.com/musistudio/claude-code-router) | v3.1.3，2026-10-09 | **生态参考**：模型路由控制面；不是完整用户 Agent；MIT |
| [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) | v8.0.44，2026-10-26 | **生态参考**：API 兼容与隔离；不是创作工作台，不默认复用认证模式；MIT |
| [Aider](https://github.com/Aider-AI/aider) | 最新公开 Release v0.86.0 为 **2025-08-09**；最后推送 **2026-05-22**；未归档 | **维护复核 / 历史专项参考**：保留 repo map、上下文预算的历史价值，撤下“当前持续活跃”背书；Apache-2.0 |
| [Opcode](https://github.com/winfunc/opcode) | 最新公开 Release v0.2.0 为 **2025-08-31**；最后推送 2026-09-18；未归档 | **维护复核 / 历史专项参考**：单 CLI GUI；一次推送不足以证明稳定发行与支持；AGPL-3.0 |

## 7. 研究来源与待补证对象

以下对象保留历史研究价值，本轮没有完整刷新其采用与维护证据，不写成“已核实不支持”或“已停更”：

| 对象 | 保留用途 | 升级为正式参考所需证据 |
| --- | --- | --- |
| SoloMD | 本地 Markdown、BYOK 与提供商配置 | 当前官方版本、持续维护与真实采用 |
| Knote | 修改提案和人工接受 | 当前产品身份、维护与真实采用 |
| StorySphere | 人物、关系、事件抽取 | 当前仓库、反馈和可比创作场景 |
| graphify-novel | 章节批处理、缓存与 review | 当前存续、维护与采用 |
| NLP-Characters-Relationships | NER/共现候选抽取 | 维护与实际效果证据；实验实现不等于成熟产品 |

## 8. 本版变更与后续研究

| 旧结论 | 本版调整 | 原因 |
| --- | --- | --- |
| WorkBuddy、百度搭子以用户指定例外收录 | 撤销旧依据，按中国区办公 Agent 重新正式收录 | 同类别独立采用数据、官方身份及连续更新已核实 |
| 办公 Agent 只有两个补录条目 | 增加千问办公正式条目及同类候选表 | 依据同一类别检索，避免围绕已知名字选择证据 |
| 各类产品混用总分、Star 与市场地位 | 分类说明采用、维护、用途与限制 | 指标不可互换，中文创作需求决定设计参考顺序 |
| 通用 App 的表现被借给同品牌 Agent | 拆分产品/模式/端别 | 千问办公、豆包工作、Kimi Work 各有独立证据需求 |
| Aider、Opcode 默认为活跃成熟生态 | 标注维护复核，保留历史方法价值 | 发行与推送记录不能支持原维护判断 |
| 9 月统计作为当前事实 | 刷新 12 个仓库、8 个中国区 iOS 条目及商业维护来源 | 保留渠道、时间与可核验范围，不声称全端实测完成 |

下一轮界面研究优先用同一中文文稿任务比较 WorkBuddy、百度搭子、千问办公：提交后准备/等待、长任务多次推进、活动展开、补充要求、失败重试、完成交付与历史重开。官方文档已支持的行为与用户实测分开记录；仍缺的精确文案与默认折叠值可由用户会话观察补充。

所有竞品视觉材料仅在会话中观察，仓库保留文字证据与链接。具体任务过程方案见[文案评审草案](../design/ui/TASK_PROCESS_COPY_DESIGN.md)；本版调整研究依据与优先级，不据市场排名直接修改已确定的过程保留和两层折叠设计。
