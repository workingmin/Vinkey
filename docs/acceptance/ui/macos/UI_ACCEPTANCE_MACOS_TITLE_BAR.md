# 标题栏与功能菜单专项验收报告（macOS）

> **平台说明**：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)。两版共享同一功能域、用例合同与判定规则，仅执行入口和证据按平台分别记录。**Windows M5 尚未执行（`NOT_EXECUTED`）**，本报告只给 macOS 结论，不得据此宣称跨平台发布通过。

- 功能域：`D-SHELL` 标题栏、平台菜单与窗口命令（与 [UI 验收工作计划](../UI_ACCEPTANCE_PLAN.md) §3 功能域定义一致）
- W0 大批次：`W0-SHELL-MENU`
- 平台/结构子门槛：`W0-SHELL-MENU-P` — **条件通过（含待人工复核项）**
- fixture 业务链路子门槛：`W0-SHELL-MENU-F` — **BLOCKED**（缺 `W0-EDITOR-F`）
- 父验收：`W0-SHELL-P`
- 验收计划：[标题栏与功能菜单专项验收计划（macOS）](./UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)
- 设计依据：[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)、[FEATURE_DECISIONS.md](../../../competitors/FEATURE_DECISIONS.md)
- 壳层报告：[UI_ACCEPTANCE_MACOS_SHELL.md](./UI_ACCEPTANCE_MACOS_SHELL.md)；导航报告：[UI_ACCEPTANCE_MACOS_NAVIGATION.md](./UI_ACCEPTANCE_MACOS_NAVIGATION.md)
- 脚本入口：`npm run test:title-bar-acceptance:sh`（`scripts/title-bar/run-title-bar-acceptance.mjs`，`UI-ACC-TITLE-BAR-001`）
- 报告状态：**条件通过**——**不是「专项通过」，也不是「完整通过」**；`W0-SHELL-MENU-F` 单独阻断
- 更新日期：`2026-11-04`

> **证据定位约定**：本报告不硬编码批次号与 Git SHA。`artifacts/title-bar-acceptance/` 下最新的 `title-bar-w0-p-*` 批次目录中，`result.json` 是该门槛唯一权威机器记录；环境、应用构建溯源、`provenance`、逐用例全字段、SHA-256 清单均以该文件为准。报告提交会改变 HEAD，故发布前必须按最终 HEAD 复跑一次以保持 `provenance.status=PASS`；复跑不改变用例清单与判定规则。

## 1. 验收范围与忠实性声明

功能域严格按计划 §1 锁定为 `D-SHELL` 的标题栏、平台菜单与窗口命令，**不**覆盖项目/会话完整生命周期、全局搜索索引、真实模型请求、真实多轮对话和文件编辑器基础链路；那些能力分别归 `D-NAV`、`D-MODEL`、`D-CHAT`、`D-EDITOR` 的独立门槛。

| 忠实性约束 | 本批次的落实 |
| --- | --- |
| 用例清单不得删减、合并、改名 | 计划 §3 的 `TB-MENU-001`~`TB-MENU-012` 共 12 项，加上 §3 第 62 行的 `TB-MENU-003-GLOBAL-SEARCH` 遗留项，合计 **13 项**；`coverage.plannedCount=13`、`executedCount=13`、ID 集合完全一致 |
| `P` / `F` 必须分别判定 | `subsets` 分别给出 `W0-SHELL-MENU-P` 与 `W0-SHELL-MENU-F` 结论；`F` 不是 `P` 的附属 PASS，也不因 `P` 结果自动升级 |
| `F` 缺依赖必须单独 `BLOCKED` | `W0-NAV-F` 已 PASS、`W0-EDITOR-F` 在脚本计划矩阵仍为「待编写」，故 `F=BLOCKED` |
| `CF-023` 未完成不得用侧栏搜索凑数 | `TB-MENU-003-GLOBAL-SEARCH` 保持 `NOT_APPLICABLE` 且**保留在覆盖率清单内**；实现偏差另记入 §6，不删除、不改写为 PASS |
| 不得放宽断言凑绿 | `TB-MENU-008` 全屏态未被 AX 确认即记 `BLOCKED`；`TB-MENU-010` 先建立真实 WebView 焦点再断言关闭后焦点恢复 |
| 平台证据不得互相冒充 | 原生 AX/CoreGraphics 批次与 M3 Playwright/WebView companion 分层归档，见 §5 |

**本批次没有修改测试范围**：13 个计划用例 ID 全部逐项执行并逐项留痕，未因 `CF-023`、`W0-EDITOR-F` 或全屏态不可自动化而把任何一项从清单中移除。

## 2. 执行批次与环境

| 项目 | 本机记录 |
| --- | --- |
| 目标应用 | `/Applications/Vinkey.app`，bundle `com.vinkey.desktop`，进程 `Vinkey`；版本与构建号取自 `Contents/Info.plist`，嵌入 Git SHA 取自隔离 Profile 的 `vinkey-runtime.jsonl` 的 `app.start.fields.commitSha`（计划 §2 溯源前置） |
| 溯源 | `result.json.application.gitSha` / `gitShaEvidence` / `buildTimeEpochMs` / `workingTreeDirtyAtBuild` / `sourceIdenticalToHead`；`result.json.provenance.status` 为 `PASS` 或 `REVIEW`，`repositoryClean` 记录工作树状态。构建 SHA 与 HEAD 不同时，以 `src/`、`src-tauri/src/`、`index.html` 零差异证明界面代码同版本 |
| 平台 | macOS `26.6.2` / arm64（满足计划 §2 的 macOS 15+ 下限），Node `v22.22.2`，Swift `6.3.2` |
| 权限路径 | `osascript` + `System Events` 在本会话返回 `-10004` 权限违例，按计划 §4.1 改走**纯 Accessibility AX C API**（`AXIsProcessTrusted()`、`kAXMenuBarAttribute`、`AXUIElementPerformAction`、`CGEvent`）；helper 源码为 `scripts/title-bar/menu-ax-helper.swift`，同批归档为 `native-automation.swift`。helper 另提供 `activate`（把应用切到前台）与 `dismiss`（只关闭帮助/诊断类弹窗）命令，见 §10 |
| 截图机制 | 窗口截图由 `CGWindowListCreateImage` 按窗口 ID 捕获；菜单展开截图用 `screencapture -R0,0,760,190` 只截系统菜单栏与下拉菜单区域；`display-info.txt` + `display-metadata.json` 记录显示器/缩放原始信息 |
| 应用状态 | 两阶段：无项目空隔离 Profile；复用 `W0-NAV-F` fixture 的已打开项目 Profile（`VINKEY_ACCEPTANCE_DATA_DIR` 注入），不触碰用户真实数据 |
| 模型 | 按计划 §2，Ollama / profile / 真实会话**不是**本专项前置条件，记为 `N/A`，不因未启动模型判菜单结构失败 |
| 平台差异 | 本机 `AXMenuBarItem` 不暴露 `AXExpanded`；以 `AXSelected=1` 与 `AXChildren` 中的 `AXMenu` 表示展开态，完整属性清单归档为 `states/menu-attrs.json`，作为计划 §4.1 步骤 2 的等价核对证据，未删掉展开态断言 |

## 3. 用例矩阵（13/13，逐项与计划 §3 对齐）

计划 §3 要求每个用例记录平台、前置状态、动作、预期、实际、证据和退出码；**全字段以 `result.json.cases[]` 为准**，下表为审核摘要。所有用例 `platform=macOS`、`exitCode=0`。

| 用例 | 场景 | 子集 | 前置状态 | 实际结果摘要 | 结论 | 主要证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `TB-MENU-001` | 一级菜单树 | P | 已打开项目 | 业务一级菜单 `Vinkey / 项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助` 与计划顺序文案一致；`Apple` 系统项单独标记；无「文件」 | PASS | `menu-tree.json`、`states/menu-tree.json`、`screenshots/03-native-menu-expanded.png`、`states/menu-attrs.json` |
| `TB-MENU-002` | 项目菜单 | F | 两阶段 | 无项目时「刷新当前项目」`enabled=false`、「添加本地项目…」`enabled=true`；有项目时刷新后 `project-records` 会话总数 `4 → 4`（未清除） | PASS | `screenshots/01-no-project-menu-tree.png`、`states/click-refresh-project.json`、`screenshots/04-after-refresh-project.png` |
| `TB-MENU-003` | 会话菜单 | F | 两阶段 | 无项目时「新建会话」点击可达并显示「还没有添加项目 / 未打开项目」提示；有项目时点击成功。另记录「搜索项目与会话」只聚焦侧栏输入框的实现偏差 | PASS | `states/click-new-conversation-no-project.json`、`screenshots/02-no-project-new-conversation.png`、`states/click-search-sessions.json` |
| `TB-MENU-003-GLOBAL-SEARCH` | 全局搜索（CF-023 后续入口） | F | 已打开项目 | `CF-023=已参考`（不表示功能完备）、`TB-GAP-006` 未实现；按计划 §3 第 62 行保留为遗留项 | **NOT_APPLICABLE** | `states/click-search-sessions.json`、`screenshots/06-after-search-menu.png`、`menu-tree.json` |
| `TB-MENU-004` | 编辑焦点分派 | F | 已打开项目 | 在对话输入框建立 `AXTextArea` 焦点后，撤销/重做/剪切/复制/粘贴/全选 6 项原生菜单均可点击且焦点保持在 `AXTextArea`；但三类输入控件完整组合依赖 `W0-EDITOR-F`，该门槛待编写 | **BLOCKED** | `states/focus-chat-input.json`、`states/edit-0-state.json`、`states/texts-after-edit.json`、`screenshots/07-after-edit-commands.png` |
| `TB-MENU-005` | 查看页面切换 | P | 已打开项目 | 对话工作台 / 项目文件 / 任务与日志三次点击成功，页面文本签名去重后 3 种；同一隔离 fixture 保持基础容器状态 | PASS | `screenshots/08-view-chat.png`~`10-view-logs.png`、`states/view-*-texts.json` |
| `TB-MENU-006` | 主题菜单 | P | 已打开项目 | 切换前后窗口截图像素内容变化；切换后仍有 12 条 WebView 文本，业务选择未清空 | PASS | `screenshots/11-theme-before.png`、`12-theme-after.png`、`states/click-theme.json` |
| `TB-MENU-007` | 设置归属 | P | 已打开项目 | `Vinkey` 应用菜单含「设置…」；「查看」不含设置；菜单点击与 `Cmd+,` 均可达，设置页文本 31 条 | PASS | `screenshots/13-settings-open.png`、`states/click-settings.json`、`states/key-cmd-comma.json` |
| `TB-MENU-008` | 窗口控制 | P | 已打开项目 | 窗口菜单必需项齐全；最小化后 `AXMinimized=true` 并可恢复；缩放后尺寸 `[1710,1107]`；「进入全屏」已触发，但 `AXFullScreen` 跨批次出现过 `false`/`true`；「关闭窗口」已触发，关闭后窗口是否隐藏也跨批次不稳定。全屏目视复核与 Dock/Reopen 恢复均依赖人工观察，故该用例**恒定 `BLOCKED`**，不因某次 `AXFullScreen=true` 升级为 PASS | **BLOCKED** | `states/window-minimize.json`、`window-zoom.json`、`window-fullscreen-state.json`、`window-after-close.json`、`screenshots/16-before-window-actions.png` |
| `TB-MENU-009` | 帮助和诊断 | P | 已打开项目 | 快捷键 / 窗口诊断信息 / 应用诊断日志三项均可触发并 Escape 关闭；「关于 Vinkey」位于应用菜单；`window.alert` 仅计「动作可触发」 | PASS | `screenshots/14-help-0.png`~`14-help-2.png`、`menu-tree.json` |
| `TB-MENU-010` | 菜单关闭与焦点 | P | 已打开项目 | 激活应用后点击对话输入框并**读回验证**焦点为 `AXTextArea`；展开「查看」后展开态 `["查看"]`，Escape 后 `expanded=[]` 且焦点回到 `AXTextArea`；断言与截图同时归档 | PASS | `screenshots/15a-menu-expanded-state.png`、`15b-menu-closed-focus.png`、`states/menu-close-final.json` |
| `TB-MENU-011` | 中文菜单审计 | P | 已打开项目 | 自有菜单项英文残留 `[]`；系统注入服务项单独标记 13 条（`Quit and Keep Windows`、`AutoFill`、`Start Dictation…`、`Minimize All` 等），品牌/格式/协议字段按计划允许保留 | PASS | `menu-tree.json` |
| `TB-MENU-012` | 首版菜单减法审计 | P | 已打开项目 | 菜单中禁止项 `[]`（无全局停止生成、侧栏折叠、文档保存/关闭）；降级入口由 M3 companion 复核存在 | PASS | `webview/result.json`、`menu-tree.json` |

计数：`caseCount=13`、`passed=10`、`failed=0`、`blocked=2`、`notApplicable=1`；`result.json.exitCode=0`，进程退出码与之一致。

> **关于「F 子门槛 BLOCKED 但部分 F 用例 PASS」**：`result.json.cases[]` 的单项 PASS 只表示该用例的本机动作观察成立；`W0-SHELL-MENU-F` 的结论由计划 §1 第 19 行与 §7 第 114 行的依赖规则独立判定，缺 `W0-EDITOR-F` 时门槛仍为 `BLOCKED`。单项 PASS **不得**被累加为 F 通过，M3 companion 的 `TB-MENU-004` PASS 也**不得**用来升级 F。

## 4. 子门槛判定

### 4.1 `W0-SHELL-MENU-P` — 条件通过（含待人工复核项）

P 子集 9 个用例（13 项扣除 4 个 F 归属用例）：`8 PASS / 0 FAIL / 1 BLOCKED`（`TB-MENU-008`）。唯一阻断项是窗口控制：全屏状态未被 AX 确认、Dock/系统 Reopen 恢复需人工目视复核。

- 不因 `F` 阻断而降格，也**不吸收** `F` 结果；P 只证明壳层与平台承载能力。
- 不反向把 P 结论写入 `W0-SHELL-P` 或 `D-NAV`；壳层报告 §1 与导航报告 §8 的边界继续有效。
- 按计划 §6，含 `BLOCKED` 用例即不满足「专项通过」要求的「所有适用用例均 PASS」，故 P 不能记为 PASS。

### 4.2 `W0-SHELL-MENU-F` — BLOCKED

| 依赖 | 状态 | 依据 |
| --- | --- | --- |
| `W0-SHELL-MENU-P` | 条件通过（含待人工复核项） | 本批次 P 子集 |
| `W0-NAV-F` | PASS | 本机已执行 6/6，见导航报告 §8 |
| `W0-EDITOR-F` | **BLOCKED（脚本待编写）** | [脚本编写计划](../UI_ACCEPTANCE_SCRIPT_PLAN.md) §3 矩阵仍为「待编写，可并行」 |

本批次仍逐项执行了 `TB-MENU-002`/`003`/`004` 的菜单动作与隔离 fixture 状态观察，但它们只是**过程证据**：`TB-MENU-004` 明确记 `BLOCKED`，`TB-MENU-003-GLOBAL-SEARCH` 明确记 `NOT_APPLICABLE`。计划矩阵中 `UI-ACC-TITLE-BAR-FIXTURE-001` 作为 F 的独立脚本 ID 尚未建立，本批次由 `UI-ACC-TITLE-BAR-001` 一个 runner 同时产出 P/F 子集与 M3 companion；这不构成 F 门槛已具备独立脚本或已通过。

## 5. 证据材料与证据层级

### 5.1 计划 §5 输出集逐项核对

| 计划要求 | 本批次 |
| --- | --- |
| `result.json` | 有；含用例全字段、覆盖率、子集结论、环境与 `provenance` |
| `SHA256SUMS` | 有；批次内所有文件（含 `result.json` 与 `webview/` 子目录）逐条登记，`shasum -c` 全部 `OK`、0 `FAILED`；`webview/SHA256SUMS` 自身亦校验通过 |
| `screenshots/` | 20 张原生窗口/菜单区域截图 |
| `events.txt` | 有；按时间顺序记录初始化、helper 调用、截图、溯源与用例结论 |
| `automation-stderr.txt` | 有；空文件按计划保留 |
| `display-info.txt` | 有；另有 `display-metadata.json` 记录 CoreGraphics 显示器元数据 |
| `native-automation.*` | `native-automation.swift`（AX C API helper 源码）；计划写的是 AppleScript 操作源，本机 `System Events` 不可用，故按 §4.1 走纯 Accessibility，此处为**平台实现偏差并如实记录** |
| `webview/` | 有；M3 companion `result.json` + `SHA256SUMS` + 9 张截图，4/4 PASS |

额外归档：`menu-tree.json`（完整原生菜单树）、`states/`（逐次 AX 状态 JSON，含 `activate-*` 应用激活、`focus-*` 焦点读回验证、`help-*-dismiss.json` 弹窗关闭记录）、`app-runtime.log`。stdout 只输出套件结论、`Results:`、`SHA256SUMS:`、`exit=<n>` 四行；详细用例与环境信息以 `result.json` 为准。

### 5.2 证据层级（不得扩大解释）

1. **原生证据**：真实启动 `/Applications/Vinkey.app`，AX C API 直接读取/点击 `AXMenuBar` / `AXMenuItem`，`CGWindowListCreateImage` 按窗口 ID 捕获 20 张原生截图。这是本专项结论的主要依据。
2. **M3 WebView companion**：Playwright 在 Win32 上下文渲染自绘标题栏（`macOS` 下 `TitleBar` 返回 `null`），为 `TB-MENU-004`、`TB-MENU-005`、`TB-MENU-010`、`TB-MENU-012` 提供结构证据，4/4 PASS、9 张截图。它**不能**证明 macOS 原生菜单、交通灯、系统窗口按钮或物理 DPI，也**不能**升级任何 `BLOCKED` 用例或 `F` 子门槛。
3. **人工观察**：目录选择取消/失败保留原状态、全屏状态目视复核、关闭窗口后 Dock/系统 Reopen 恢复、低保真诊断弹窗视觉质量与焦点返回，均保留为人工观察或条件通过遗留项，未被写成 PASS。

### 5.3 `provenance`

以最新批次 `result.json.provenance.status` 为准。工作树存在未提交改动时为 `REVIEW`，应用构建 SHA 缺失或源码一致性不成立时按计划 §2/§6 阻断；提交报告与脚本后**必须按最终 HEAD 复跑**一次，使 `repositoryClean=true`、`provenance.status=PASS`，并重新校验 `SHA256SUMS`。报告本身不硬编码批次号与 SHA，避免自引用失配。

## 6. 遗留项与实现偏差（不得据此宣称通过）

1. **`CF-023` / `TB-GAP-006` 实现偏差（重点）**：`FEATURE_DECISIONS.md` 中 `CF-023` 状态为 `已参考`，文件第 5 行明确「`已参考` 不表示功能完备」；`TITLE_BAR_DESIGN.md` 的 `TB-GAP-006` 仍为「未实现，保持独立阻断」，§5 审计表要求 `CF-023` 前「无原生菜单项」。但 macOS 原生「会话」菜单已提前挂载「搜索项目与会话 ⌘K」（`src/App.tsx` 的 `installMacMenu` + `searchSessions`），其 `focusGlobalSearch` 只执行 `document.getElementById('global-search-input')?.focus()`，而该 id 是 `ProjectSessionSidebar.tsx` 的**侧栏搜索框**（`class=sidebar-search`），并非设计 §3.2 的统一搜索结果面板。这正是计划 §1 禁止的「侧栏搜索冒充全局搜索」。本专项**没有删除用例、没有改写计划、没有写 PASS**，而是把 `TB-MENU-003-GLOBAL-SEARCH` 保留为 `NOT_APPLICABLE` 遗留项并在 `result.json.issues` 记录偏差。
2. **跨文档口径需产品/设计复核**：`UI_ACCEPTANCE_PLAN.md` §7 第 112 行与导航报告 §2 第 36 行把「全局搜索入口/结果面板」描述为已实现；导航报告 `NAV-E-005` 的 PASS 实际证明的是当前工作区「项目/会话/文档」三类分组搜索与跳转（`scripts/navigation/navigation-e2e-acceptance.ts` 的 `grouped` 断言），**不等于** `CF-023` 统一面板完成。本专项不改变 `D-NAV` 结论，也不借用其 PASS 为 `CF-023` 背书；两处描述的一致性需另行复核，不在本专项里修改测试范围。
3. **`TB-MENU-008` 窗口动作未全通过**：「进入全屏」已触发，但 `AXFullScreen` 在不同批次出现 `false` / `true`；「关闭窗口」后主窗口是否隐藏也跨批次不稳定；Dock/系统 Reopen 恢复从未自动激活。全屏目视复核、关闭隐藏复核与 Reopen 恢复全部转人工观察，因此该用例**恒定 `BLOCKED`**，不因某次 `AXFullScreen=true` 就宣称窗口动作全部通过（见 §10）。
4. **低保真诊断弹窗**：快捷键/窗口诊断/应用诊断日志由 `window.alert` 或简易弹窗承载，按计划 §6 只计「动作可触发」，计入条件通过遗留项。
5. **`W0-EDITOR-F` 待编写**：`F` 子门槛硬依赖缺失，`TB-MENU-004` 保持 `BLOCKED`；M3 companion 的 WebView 结构证据不能替代。
6. **Windows M5 未执行**：`decision.windowsPlatform=NOT_EXECUTED`，不得宣称跨平台发布通过；Windows 自绘菜单、窗口控制、DPI 与截图仍待目标桌面执行。
7. **平台自动化偏差**：`System Events` 权限违例、`AXExpanded` 缺失、菜单展开区域截图收窄、helper 由 AppleScript 改为 Swift AX C API，均已在 `result.json.environment` / `privacy` 与本报告 §2 如实记录。

## 7. 与其他专项的边界

| 关联专项 | 本报告的处理 |
| --- | --- |
| `W0-SHELL-P` | 壳层报告 §1/§4 明确不判定菜单树与菜单命令；本报告不把 P 结果反向写入 `W0-SHELL-P`，也不改写其 24/24 结论 |
| `D-NAV` | 导航报告「完整通过」只针对 `D-NAV`；其 §8 不把菜单专项当证据。本专项复用 `W0-NAV-F` 的 fixture 生成器只是为了构造「已打开项目」前置状态，**不重复判定导航业务链路** |
| `W1-MODEL-E` | `TB-MENU-007` 只验收「进入/返回设置」与壳层恢复；模型保存、连接和凭据由 `W1-MODEL-E` 负责 |
| 脚本计划状态 | `W0-SHELL-MENU-P/F` 由「待验收、不得假定通过」更新为「已执行：P 条件通过（含待人工复核项）/ F BLOCKED」，**仍不是「已通过」**；`W0-EDITOR-F` 继续保留「待编写」 |

## 8. 结论（逐条对照计划 §6）

| §6 判定 | 是否满足 | 依据 |
| --- | --- | --- |
| **专项通过** | **否** | 要求所有适用用例均 PASS；本批次 `TB-MENU-008`、`TB-MENU-004` 为 `BLOCKED`，`TB-MENU-003-GLOBAL-SEARCH` 为 `NOT_APPLICABLE`，Windows 未执行，帮助弹窗低保真 |
| **条件通过** | **是（本次结论）** | 菜单结构与核心动作通过、macOS 目标平台证据已采集、`exitCode=0`、哈希清单可核验；按 §6 必须列出遗留项且**不能宣称跨平台发布通过** |
| **不通过** | 否 | `failed=0`；无旧「文件」一级菜单、设置不在「查看」、编辑命令未作用于错误焦点、菜单关闭断言与截图一致、最小化/缩放/关闭窗口动作成功 |
| **阻断** | 整体否 / F 子集是 | 应用包可启动、平台权限具备、结果文件完整且可证明来自目标包；仅 `W0-SHELL-MENU-F` 因缺 `W0-EDITOR-F` 单独 `BLOCKED` |

**最终结论**：`D-SHELL` 标题栏与功能菜单专项（macOS）为 **条件通过**；`W0-SHELL-MENU-P` = **条件通过（含待人工复核项）**，`W0-SHELL-MENU-F` = **BLOCKED**；计划用例覆盖率 **13/13**，ID 集合与计划 §3 完全一致。`result.json.exitCode=0`。该结论**不**代表专项通过、跨平台发布通过，也不代表 `D-NAV` / `D-CHAT` / `D-EDITOR` 通过。

## 9. 测试人员回填区

- `W0-SHELL-MENU-P`：`条件通过（含待人工复核项）`；证据见 `artifacts/title-bar-acceptance/` 最新 `title-bar-w0-p-*` 批次的 `result.json` + `SHA256SUMS` + `screenshots/`（20 张原生截图）+ `states/` + `menu-tree.json`。
- `W0-SHELL-MENU-F`：`BLOCKED`；依赖状态见 `result.json.subsets['W0-SHELL-MENU-F'].dependency`；解阻条件为 `W0-EDITOR-F` 完成并使 `TB-MENU-004` 具备三类输入控件完整组合。
- M3 companion：`4/4 PASS`；证据见同批次 `webview/result.json` + `webview/SHA256SUMS` + 9 张截图；**仅为 WebView 结构证据**。
- 人工复核清单：`<① 全屏状态目视确认（AXFullScreen 跨批次不稳定）；② 关闭窗口后主窗口隐藏状态与 Dock/系统 Reopen 恢复；③ 目录选择取消/失败后原状态保留；④ 低保真诊断弹窗视觉质量与焦点返回；⑤ Windows M5 目标桌面执行>`
- 问题列表：`<① CF-023/TB-GAP-006 实现偏差（原生菜单项提前挂载、只聚焦侧栏搜索）；② TB-MENU-008 全屏与 Reopen 待人工确认；③ 诊断弹窗低保真；④ W0-EDITOR-F 待编写；⑤ Windows 未执行；⑥ 跨文档 CF-023 口径待产品/设计复核>`
- 综合结论：`<条件通过 — P 条件通过（含待人工复核项）、F 阻断；13/13 用例覆盖；不得宣称专项通过或跨平台发布通过>`
- 下一次复审版本/日期：`<W0-EDITOR-F 完成、CF-023 全局搜索面板实现、Windows M5 执行、Vinkey 版本发布，或菜单树/设计合同变更时>`

## 10. 本版修正记录（自动化稳定性，非放宽断言）

1. **首次按最终 HEAD 复跑出现 `1 FAIL`**：`TB-MENU-010` 因 `kAXFocusedUIElementAttribute` 全程返回空对象而失败，`TB-MENU-004` 焦点为 `unknown`；同时 `TB-MENU-008` 因 `AXFullScreen=true` 被写成 PASS。该批次结论为「不通过」，归档保留在 `artifacts/title-bar-acceptance/` 对应 `title-bar-w0-p-*` 目录中，**未删除、未改写**。
2. **根因**：目标应用未切到前台时，`CGEvent` 点击不会落到 WebView，AX 焦点读回为空；低保真「应用诊断日志」弹窗有时 Escape 不关闭，残留弹窗继续抢占焦点。窗口动作的 `AXFullScreen`、关闭后窗口是否隐藏同样受前台状态影响，跨批次不稳定。
3. **修正方式（只加固前置条件，不改判定规则、不删用例）**：
   - helper 新增 `activate`（`NSRunningApplication.activate`）与 `dismiss`（只按「关闭 + 诊断/快捷键/关于」匹配弹窗关闭按钮）；启动阶段与焦点敏感用例前均激活应用。
   - 新增 `establishFocus()`：激活 → 点击 `AXTextArea` → **读回验证**焦点角色，最多 4 次；`TB-MENU-004`、`TB-MENU-010` 都以此建立可判定的前置状态。
   - 若前置焦点始终无法建立，`TB-MENU-010` 记 `BLOCKED` 并转人工观察（计划 §4.1 步骤 5），而不是把「无法判定」误写成产品 FAIL；**前置已建立但菜单关闭或焦点恢复断言失败时仍判 `FAIL`**。
   - `TB-MENU-008` 改为**恒定 `BLOCKED`**：计划 §3 要求全屏、关闭隐藏与 Reopen 恢复整体成立，而 Reopen 依赖 Dock 激活、脚本从未自动验证；单次 `AXFullScreen=true` 不足以把用例升为 PASS。
4. **修正后结果**：加固批次 `conclusion=条件通过`、`exitCode=0`、`10 PASS / 0 FAIL / 2 BLOCKED / 1 N/A`、13/13 覆盖；`TB-MENU-010` 读回焦点 `AXTextArea` 后 PASS，`TB-MENU-008` 保持 BLOCKED。报告结论与最新批次一致；先前 FAIL 批次作为自动化稳定性问题的原始证据保留，不作为最终结论依据，也不被抹去。
