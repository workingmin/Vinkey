# 标题栏与功能菜单专项验收计划（macOS）

- 功能域：`D-SHELL` 标题栏、平台菜单与窗口命令
- W0 大批次：`W0-SHELL-MENU`
- 平台/结构子门槛：`W0-SHELL-MENU-P`
- fixture 业务链路子门槛：`W0-SHELL-MENU-F`
- 父验收：`W0-SHELL-P`
- 设计依据：[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)
- 壳层报告：[UI_ACCEPTANCE_MACOS_SHELL.md](./UI_ACCEPTANCE_MACOS_SHELL.md)；Windows 平台版：[UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)
- 入口总表：[UI_ENTRY_POINTS.md](../../../design/ui/UI_ENTRY_POINTS.md)
- 计划更新：`2026-11-10`
- 适用阶段：Alpha（`0.1.0`）；主观类验收项按 [总验收计划 §8](../UI_ACCEPTANCE_PLAN.md) 划到后续版本，本文件只引用、不另建清单

> 实现基线：目标菜单树、设置归属、焦点命令桥接和菜单选择器已实现。`W0-SHELL-MENU-F` 的机器 fixture 脚本（`UI-ACC-TITLE-BAR-FIXTURE-001`）与 `W0-SHELL-MENU-P` 的机器层脚本（`UI-ACC-TITLE-BAR-001`）已就绪，当前仍为“待验收”，不是 `W0-SHELL-MENU-P/F` 已通过。

## 1. 目的与边界

本计划覆盖系统标题栏和功能菜单的结构、平台承载、菜单动作、焦点语义，以及菜单入口到隔离 fixture 业务状态的最小链路。它不验收项目/会话完整生命周期、全局搜索索引、真实模型请求或真实多轮对话；这些能力分别由 `D-NAV`、`D-MODEL`、`D-CHAT` 和 `D-EDITOR` 的后续门槛负责。

本计划必须拆分回填：`P` 子集只证明壳层和平台能力；`F` 子集证明菜单动作可以到达已有业务入口并保持隔离 fixture 状态。`W0-SHELL-MENU-F` 不是 `W0-SHELL-MENU-P` 的自动附属 PASS，缺少 `W0-NAV-F` 或 `W0-EDITOR-F` 时应单独记为 `BLOCKED`。

本专项以 `TITLE_BAR_DESIGN.md` 的目标菜单为准：

- macOS：`Vinkey / 项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助`；Windows 平台菜单树见 [Windows 版计划](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)。
- “文件”不作为全局一级菜单；文档新建、保存、关闭由文件页工具栏、文档标签和 `Ctrl/Cmd+S` 承担。
- “停止当前生成”由对话输入区停止按钮和 `Esc` 路径承担，不作为首版全局菜单项。
- “展开/折叠项目与会话栏”由侧栏按钮承担，不在“查看”重复呈现。
- 全局搜索 `Cmd+K` 只有 `CF-023` 完成后才加入“会话”菜单；侧栏搜索不计入本专项通过（Alpha 客观范围）。

`W0-SHELL-P` 的 Playwright 与 macOS 原生脚本在截图前只执行“菜单合同守卫”：检查一级文案已转为目标版本，防止旧“文件”菜单污染壳层截图。该守卫不展开菜单、不执行业务命令，其 PASS 不能代替本专项 PASS。原生窗口自动化在绿色交通灯离开 AX 树时使用的 `menu-recovery` 只负责恢复窗口，也不能作为本专项证据。

## 2. 前置条件

| 条件 | 要求 | 不满足时 |
| --- | --- | --- |
| 目标应用 | 使用待验收的 Tauri 安装包；记录版本、构建号和嵌入 Git SHA | `BLOCKED`，不得用浏览器结果代替 |
| 平台 | macOS 15+ 桌面；需要 `swiftc`、Accessibility/System Events 和屏幕录制权限 | 目标平台项 `BLOCKED` |
| 应用状态 | 可启动到工作台；无模型也可执行本专项；准备一个无项目状态和一个已打开项目状态 | 无法区分入口前置条件时 `BLOCKED` |
| 编辑目标 | 至少准备对话输入框、可编辑文档、搜索/设置输入框 | 编辑焦点用例 `BLOCKED` |
| 证据归档 | 可保存截图、事件日志、自动化 stderr、结果 JSON 和 SHA-256 清单 | 不能形成可追溯批次时 `BLOCKED` |

Ollama、模型 profile 和真实会话不是本专项前置条件。测试人员仍应在报告中填写 `N/A`，不得因为未启动 Ollama 把菜单结构误判为失败。

## 3. 用例清单

状态值使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_APPLICABLE` 四态，不新增状态值（[脚本计划 §8](../UI_ACCEPTANCE_SCRIPT_PLAN.md)：`result.json` 的 `cases[].status` 只用这四种取值）。每个用例必须记录平台、前置状态、动作、预期、实际结果、证据文件和退出码。

> `NOT_APPLICABLE` 有两种互不混用的语义：① 用例本身不适用（用例在当前版本无适用对象），仍按 §6 计入专项阻断；② 批次归属不适用——F 归属用例在 `W0-SHELL-MENU-P` 原生批次中记 `NOT_APPLICABLE`，表示该批次不判定该用例，权威结论由 `W0-SHELL-MENU-F` 独立门槛给出。② 不改变用例适用性、不作为专项阻断项，必须在 `actual` 与引用字段中写明权威批次。两种语义不得互相替代或用来凑 PASS。

| 用例 ID | 场景 | macOS | 核心断言 | 关联缺口 |
| --- | --- | --- | --- | --- |
| `TB-MENU-001` | 一级菜单树 | 原生菜单显示 `Vinkey / 项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助`，语义同设计；不存在文件 | 文案、顺序和平台差异符合设计 | P；`TB-GAP-001` |
| `TB-MENU-002` | 项目菜单 | 同名原生菜单动作：添加本地项目、刷新当前项目 | 选择失败保留原状态；刷新不清除会话和草稿 | F；`TB-GAP-001`；依赖 `W0-NAV-F` |
| `TB-MENU-003` | 会话菜单 | 同名原生菜单动作：新建会话；无项目时给出可达提示 | 新会话进入对话页；不把侧栏搜索冒充全局搜索 | F；`TB-GAP-001`；依赖 `W0-NAV-F` |
| `TB-MENU-004` | 编辑焦点分派 | 原生编辑项（撤销/重做/剪切/复制/粘贴/全选）作用于 WebView 当前焦点 | 无有效编辑目标时禁用或明确无动作；不切页、不丢选区 | F；`TB-GAP-004`；依赖 `W0-EDITOR-F` |
| `TB-MENU-005` | 查看页面切换 | 同名原生菜单动作：对话工作台、项目文件、任务与日志 | 一次切换一个内容页；基础容器状态不被清除；业务数据保持另由对应域确认 | P；含 fixture 状态保持时依赖 `W0-NAV-F`/`W0-EDITOR-F` |
| `TB-MENU-006` | 主题菜单 | 同名原生菜单动作：切换浅色/深色 | 菜单、侧栏和窗口主题同步；业务选择保持 | P；`TB-GAP-005` |
| `TB-MENU-007` | 设置归属 | Vinkey 应用菜单有“设置…”；实现后验证 `Cmd+,`；查看中不存在设置 | W0 只验收进入/返回和壳层恢复；模型保存、连接和凭据由 `W1-MODEL-E` 验收 | P；设置业务链路依赖 `D-MODEL` |
| `TB-MENU-008` | 窗口控制 | 原生最小化、缩放窗口、全屏、关闭隐藏及 Reopen 恢复 | 窗口状态真实改变；最大化/还原恢复前尺寸；macOS 关闭后无可见窗口且再次打开可恢复 | P；平台证据门槛 |
| `TB-MENU-009` | 帮助和诊断 | 快捷键、窗口诊断、应用诊断日志；关于在 Vinkey 应用菜单 | 触发、关闭、焦点返回、敏感信息脱敏；`alert` 只能计为动作可触发 | P；构建溯源/脱敏 |
| `TB-MENU-010` | 菜单关闭与焦点 | 原生菜单关闭后 WebView 焦点恢复 | 不残留展开菜单；不能仅凭脚本无条件写 PASS | P；`SHELL-P-001` |
| `TB-MENU-011` | 中文菜单审计 | 自有菜单和快捷键说明无 File/View/Settings 等英文残留；系统注入服务项单独标记 | 品牌、格式、协议字段可保留原文 | P；`TB-GAP-005` |
| `TB-MENU-012` | 首版菜单减法审计 | 不出现全局停止生成、侧栏折叠、文档保存/关闭 | 降级入口仍可从对话/侧栏/文件页到达 | P/F：入口存在性为 P，局部动作可达性依赖对应域 |

`TB-MENU-003` 的全局搜索由独立的 `TB-MENU-003-GLOBAL-SEARCH` 用例判定：`CF-023` 统一搜索面板已落地，该用例为客观 `PASS`；侧栏内联输入框只作「快速筛选」，不能代替全局搜索。

> Alpha 范围声明：上表 12 个用例加 `TB-MENU-003-GLOBAL-SEARCH` 共 13 个 ID，一个都不删、不合并、不改名、不放宽断言。仅用例内部的「主观判断部分」按 [总验收计划 §8](../UI_ACCEPTANCE_PLAN.md) 划到后续版本：
> - `TB-MENU-009` 的弹窗视觉质量/交互完成度划出（`DEFER-UI-001`），触发、关闭、焦点返回、脱敏与构建溯源仍须验；
> - `TB-MENU-011` 的文案语义得体性、`TB-MENU-012` 的减法产品价值判断划出（`DEFER-UI-010`），英文残留字符串审计与禁止项存在性检查仍是客观断言；
> - `TB-MENU-008` 的「全屏目视复核」划出（`DEFER-UI-005`），但全屏 AX/CG 状态、Reopen 恢复、关闭后隐藏仍是客观项，必须留在 Alpha 并继续推进自动化，不得借延期跳过。

## 4. 平台执行步骤（macOS）

### 4.1 macOS

1. 启动 `/Applications/Vinkey.app` 或指定验收包，确认辅助功能和屏幕录制权限。
2. 通过 Accessibility/System Events 读取 `AXMenuItem`，核对 `Vinkey / 项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助` 菜单树和 `AXExpanded` 状态。
3. 执行项目、会话、查看、主题、窗口和帮助动作；在 WebView companion 中复核页面和焦点状态。
4. 在 `Vinkey` 应用菜单确认“关于 Vinkey”和（实现后）“设置…”；确认设置不再位于“查看”。
5. 执行原生编辑命令时，先在三类输入控件中建立选区，再检查命令是否作用于当前 WebView；记录无法自动读取的项目为人工观察。
6. 验证原生交通灯、最小化、缩放窗口、全屏和关闭；保留 `display-info.txt` 与窗口截图。

浏览器/Playwright 只能作为 WebView companion。它不能证明 macOS 原生菜单、交通灯、系统窗口按钮或物理 DPI；Windows 自绘窗口行为见 [Windows 版计划](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)。

## 5. 结果输出集

每次运行使用独立批次目录，例如 `title-bar-w0-p-<YYYYMMDD>-<platform>/`：

```text
result.json              # 唯一机器结果源：用例、状态、计数、exitCode、应用/仓库溯源
SHA256SUMS               # 结果目录内相对路径的哈希清单
screenshots/             # 菜单树、动作后页面、关闭状态、窗口控制和尺寸截图
events.txt               # 按时间顺序的操作与观察事件
automation-stderr.txt    # 自动化器 stderr；空文件也应保留
display-info.txt         # 平台显示器/缩放原始信息；macOS 15+ 可得时提供
native-automation.*      # AppleScript 操作源（macOS）
webview/                 # 同批次 Playwright companion 结果（如执行）
```

脚本 stdout 只输出套件结论、`Results:`、`SHA256SUMS:` 和 `exit=<n>` 四行；详细用例和环境信息以 `result.json` 为准。进程退出码必须等于 `result.json.exitCode`。原始路径可以存在于本地中间产物，但最终报告引用时必须脱敏。

## 6. 判定规则

- 专项通过（Alpha 客观范围）：`TB-MENU-001` 至 `TB-MENU-012` 中所有适用用例均 `PASS`；全局搜索 `TB-MENU-003-GLOBAL-SEARCH` 在 `CF-023` 完成后已转为客观 `PASS`（由原生菜单项存在性 + M3 companion 面板分组/Escape 验证），不再标记 `NOT_APPLICABLE`；macOS 至少一次目标平台证据；`result.json.exitCode=0` 且哈希清单可核验。
- 条件通过：菜单结构和核心动作通过、macOS 目标平台证据已采集，但仍存在客观遗留项（如构建溯源未按最终 HEAD 定稿、目录取消保态未客观达成）时，只能条件通过；必须列出客观遗留项，不能宣称跨平台发布通过。`W0-EDITOR-F` 人工 UI 观察与帮助弹窗视觉质量/交互完成度（`DEFER-UI-001`）等主观/人工项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本 macOS 专项的遗留项或条件通过原因（见本计划 §6 Alpha 判定补充）；Windows 平台执行属独立 Windows 专项，不计入本 macOS 专项判定。帮助弹窗的低保真实现只按 `TB-MENU-009` 的客观断言（触发、关闭、焦点返回、脱敏、构建溯源）判定，其视觉质量与交互完成度属 `DEFER-UI-001`，已集中至 §8.5 人工复核事项。
- 不通过：仍出现旧“文件”一级菜单、设置仍在“查看”、编辑命令作用于错误焦点、菜单关闭断言与截图冲突，或窗口动作失败。
- 阻断：应用包无法启动、平台权限缺失、结果文件不完整或无法证明结果来自目标包。

Alpha 判定补充（仅调整前置条件，不修改上述四条判定规则的通过条件）：

1. 按 [总验收计划 §8](../UI_ACCEPTANCE_PLAN.md) 登记的 `DEFER-UI-001`、`DEFER-UI-005`、`DEFER-UI-010`、`DEFER-UI-011`、`DEFER-UI-012` 等主观项，已从本功能域验收范围摘除、集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项；在 Alpha 内不作为结论前置条件，也不作为本专项的遗留项或条件通过原因；它们不参与「所有适用用例均 PASS」的计数，也不得写成 `PASS` 或从报告删除。
2. 上述主观/人工项不因本节消失，但已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本 macOS 专项遗留项或阻断项：`W0-EDITOR-F` 人工 UI 观察与 `DEFER-UI-001` 仍按 §8.5 逐项登记，但不阻断 `专项通过（Alpha 客观范围）`；`TB-MENU-008`、`TB-MENU-003-GLOBAL-SEARCH`、构建溯源、`W0-EDITOR-F` 目标平台 WebView 客观证据与目录取消保态 `preserved` 均已客观达成，不再作为遗留项。Windows 平台执行属独立 Windows 专项（见本计划 §1 与专项报告平台说明），不计入本 macOS 专项判定，其未执行不压低本 macOS 结论，仅作为跨平台发布提示。
3. 结论口径以最新权威批次为准：专项整体达成 `专项通过（Alpha 客观范围）`（P `PASS`、F `PASS`、13/13 覆盖、`provenance=PASS`、`specialityPass=true`）；人工项已摘除至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本专项遗留项；整体仍不宣称跨平台发布通过 / 整体发布通过（Windows 独立专项未执行 + 人工复核事项统一后置）。
4. 发布说明须同时列明客观遗留项与总计划 §8.3 全表。

标题栏专项通过（Alpha 客观范围）不会自动代表 `D-NAV`、`D-CHAT`、`D-EDITOR` 通过；反之，导航或模型域失败也不应掩盖已独立确认的菜单结构结果。

## 7. 计划与责任

| 阶段 | 工作 | 产出 | 责任 |
| --- | --- | --- | --- |
| M1 | 设计和源码审计 | `TITLE_BAR_DESIGN.md` 审计表、缺口清单 | 产品/设计/开发 |
| M2 | 菜单迁移和焦点桥接 | 项目/会话菜单、设置归属、编辑命令实现 | 开发；已完成，待验收 |
| M3 | Playwright/WebView companion 与 fixture 脚本 | `TB-MENU-004`、`TB-MENU-005`、`TB-MENU-010` 结构证据；`scripts/title-bar/` 生成 `W0-SHELL-MENU-F` 与 `W0-SHELL-MENU-P` 机器证据 | 开发/测试；脚本已实现并执行 |
| M4 | macOS 原生执行 | Accessibility 菜单、交通灯、窗口动作、哈希归档；入口 `npm run test:title-bar-native-mac` | 测试人员 |
| M5 | Windows 桌面执行 | 自绘菜单、窗口控制、DPI 和截图；见 [Windows 版计划](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) | 测试人员 |
| M6 | 报告复审（Alpha） | 逐项结果、客观遗留项与延期登记完整性；不含对主观项的专家签字 | 测试/产品 |
| M7 | 人工复核统一批次（Alpha 自动化脚本全部跑完后统一后置） | 按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 集中处理 §8.3 全表 `DEFER-UI-*` 与各功能域人工 UI 观察：视觉评审、专家判断、用户调研与签字；未完成项继续延期，不回溯改写自动化批次 `result.json` | 产品/设计/用户研究/测试 |

执行顺序建议为 `M1 → M2 → M3 → W0-SHELL-MENU-P → W0-NAV-F/W0-EDITOR-F → W0-SHELL-MENU-F → M4 → M6`（macOS 版；Windows 执行见 M5 对应计划）。`W0-SHELL-MENU-P` 可以先于业务 fixture 执行；`W0-SHELL-MENU-F` 必须等待 `W0-NAV-F`、`W0-EDITOR-F` 的必要用例通过。`W0-SHELL-MENU-F` 的机器 fixture 证据由 `npm run test:title-bar-acceptance` 单独归档，不得与 P 子集或导航脚本混报；目标平台原生菜单仍需 M4 桌面执行。M7 为人工复核统一批次（总计划 §8.5），不构成 `专项通过（Alpha 客观范围）` 的前置条件，待全部功能域自动化验收脚本跑完后统一后置处理；本 macOS 专项在客观项全 PASS 后即达成「专项通过（Alpha 客观范围）」。

`TB-MENU-004` 与 `W0-EDITOR-F` 的判定权/次序（本计划 §1 第 19 行、§7 第 114 行的具体化）：该用例为 F 归属且依赖 `W0-EDITOR-F`（三类输入中「可编辑文档」的 `EDIT-F-001`~`006` 合同），权威判定归属 `W0-SHELL-MENU-F` 独立门槛，不留在 P 原生批次。`W0-SHELL-MENU-P` 原生 runner 先于业务 fixture 执行，只能记录 macOS AX 焦点与六项编辑命令的过程证据；该用例在本批次记 `NOT_APPLICABLE`（§3 的「批次归属不适用」，非用例不适用），并用 `authoritativeGate` 登记权威判定所在的脚本 ID、复跑命令与归档目录，不得自行写 `PASS`、`FAIL` 或 `BLOCKED`。`cases[].status` 一律只用四态，不引入 `DEFERRED` 等第五态（[脚本计划 §8](../UI_ACCEPTANCE_SCRIPT_PLAN.md)）；`DEFERRED_AFTER_ALPHA` 只是计划层排期状态，不进入 JSON schema。权威结论在 `W0-NAV-F` / `W0-EDITOR-F` 真实 PASS 之后由 `W0-SHELL-MENU-F` 独立门槛读取其真实 `result.json` 给出，缺任一依赖时由该门槛按 §1 第 19 行单独记 `BLOCKED`。13 项用例 ID 不删减、覆盖计数可核对；专项结论不因该项在 P 批次的状态变化而自动升级。`W0-EDITOR-F` 的目标平台 WebView 客观证据已由 `UI-ACC-EDITOR-WEBVIEW-001` 采集；其人工 UI 观察回传属后续版本验收登记项，与本用例的 F 门槛判定分开记录，不得混为 `BLOCKED` 依据。

## 8. Alpha 延期边界（引用）

本专项不另建延期清单，统一引用 [总验收计划 §8](../UI_ACCEPTANCE_PLAN.md) 的唯一权威登记表。

- 与本专项直接相关：`DEFER-UI-001`（弹窗视觉质量/交互完成度）、`DEFER-UI-005`（发布前目视手续）、`DEFER-UI-010`（中文文案语义与减法价值判断）、`DEFER-UI-011`（跨文档 `CF-023` 口径复核）、`DEFER-UI-012`（M6 中针对主观项的签字）；上述项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不计入本 macOS 专项判定。其余各项按总计划 §8.3 全局生效。
- 本专项不划出：13 个 `TB-MENU-*` 用例 ID、`P` / `F` 子门槛分离规则、全部机器断言与哈希清单、`TB-MENU-008` 的客观窗口行为、`TB-MENU-011` 英文残留审计、`TB-MENU-006` 主题像素比对、Windows 平台执行、`CF-023` 全局搜索客观断言。
- 计划层边界：`scripts/title-bar/` 的判定逻辑、`artifacts/title-bar-acceptance/` 与 `artifacts/title-bar-fixture-acceptance/` 各批次的 `result.json` 结论不追溯改写；[专项报告](./UI_ACCEPTANCE_MACOS_TITLE_BAR.md) 中帮助/诊断弹窗的视觉质量与交互完成度按总计划 §8 登记为 `DEFER-UI-001`，已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，其客观断言仍留在 Alpha（见 §6 的 `专项通过（Alpha 客观范围）` 规则与专项报告 §4.1/§5.2/§6/§8/§9）。
