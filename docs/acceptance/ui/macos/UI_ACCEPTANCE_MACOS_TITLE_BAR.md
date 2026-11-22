# 标题栏与功能菜单专项验收报告（macOS）

> 平台说明：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](../windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)。两版共享同一功能域、用例合同与判定规则，仅执行入口和证据按平台分别记录。Windows M5 尚未执行（`NOT_EXECUTED`），本报告只给 macOS 结论，不得据此宣称跨平台发布通过。

- 功能域：`D-SHELL` 标题栏、平台菜单与窗口命令（与 [UI 验收工作计划](../UI_ACCEPTANCE_PLAN.md) §3 功能域定义一致）
- W0 大批次：`W0-SHELL-MENU`
- 平台/结构子门槛：`W0-SHELL-MENU-P` — PASS（P 子集 9/9 全 PASS；构建溯源 `provenance=PASS`）
- fixture 业务链路子门槛：`W0-SHELL-MENU-F` — PASS（独立脚本 `UI-ACC-TITLE-BAR-FIXTURE-001` 已建立；`W0-NAV-F`、`W0-EDITOR-F` 均真实 PASS）
- 父验收：`W0-SHELL-P`
- 验收计划：[标题栏与功能菜单专项验收计划（macOS）](./UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)
- 设计依据：[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)、[FEATURE_DECISIONS.md](../../../competitors/FEATURE_DECISIONS.md)
- 壳层报告：[UI_ACCEPTANCE_MACOS_SHELL.md](./UI_ACCEPTANCE_MACOS_SHELL.md)；导航报告：[UI_ACCEPTANCE_MACOS_NAVIGATION.md](./UI_ACCEPTANCE_MACOS_NAVIGATION.md)
- 脚本入口：
  - P 原生批次 `UI-ACC-TITLE-BAR-001`：`npm run test:title-bar-native-acceptance`（`scripts/title-bar/run-title-bar-native-acceptance.mjs`）
  - F 独立门槛 `UI-ACC-TITLE-BAR-FIXTURE-001`：`npm run test:title-bar-fixture-acceptance:sh`（`scripts/title-bar/title-bar-fixture-acceptance.ts`）
  - F 机器合同层：`npm run test:title-bar-acceptance:sh`（`scripts/title-bar/title-bar-acceptance.ts`，由独立门槛脚本内部调用）
  - `W0-EDITOR-F` 目标平台 WebView 客观证据 `UI-ACC-EDITOR-WEBVIEW-001`：`npm run test:editor-webview-native-mac`（`scripts/editor/run-editor-webview-native-macos.mjs`）
- 报告状态：专项通过（Alpha 客观范围）——macOS 客观范围内所有适用用例 PASS、构建溯源定稿、F 门槛独立解锁，故本 macOS 专项达成专项通过（Alpha 客观范围）；但不是「跨平台发布通过」、也不是「通过（功能域单平台范围）」（Windows 独立专项未执行 + 人工复核事项统一后置）。`W0-SHELL-MENU-P` 原生批次 `subsets['W0-SHELL-MENU-P'].conclusion=PASS`（P 子集 9/9 全 PASS，`TB-MENU-008` 全屏/Reopen 客观判据达成）；`W0-SHELL-MENU-F` 独立门槛 `overallConclusion=专项通过`（`TB-MENU-004=PASS`、`13/13` 覆盖）。`CF-023` 统一搜索面板已实现，`TB-MENU-003-GLOBAL-SEARCH` 为客观 PASS（原生菜单项存在性 + Escape 返回 + M3 companion 面板分组）。`TB-MENU-004` 的判定归入 `W0-SHELL-MENU-F` 独立门槛：P 原生批次记 `NOT_APPLICABLE`（批次归属不适用）+ `authoritativeGate` 引用（只留 AX 过程证据），`cases[].status` 只用 `PASS/FAIL/BLOCKED/NOT_APPLICABLE` 四态。构建溯源已按最终 HEAD 定稿：app 按最终 HEAD 重建，内嵌 SHA = HEAD、`sourceIdenticalToHead=true`、`repositoryClean=true`、`provenance.status=PASS`。人工 UI 观察与帮助弹窗视觉/无障碍评审（`DEFER-UI-001`，弹窗已升级为应用内模态）等主观项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不计入本 macOS 专项判定或阻断项；Windows 独立专项未执行不计入本 macOS 结论。`W0-EDITOR-F` 目标平台 WebView 结构/内容/保存状态栏客观证据已由 `UI-ACC-EDITOR-WEBVIEW-001` 采集，目录取消保态已由 AXSheet + CG 面板窗口双信号客观判定为 `preserved`，二者为客观已达成项。Windows 平台验收属独立 Windows 专项，不计入本 macOS 专项结论。
- 更新日期：`2026-11-12`

> 证据定位约定：本报告不硬编码批次号与 Git SHA。`artifacts/title-bar-acceptance/` 下最新的 `title-bar-w0-p-*` 批次是 P 子门槛与 macOS 原生证据的唯一权威机器记录；`artifacts/title-bar-fixture-acceptance/` 下最新的 `title-bar-w0-f-*` 批次是 `W0-SHELL-MENU-F` 的唯一权威机器记录。`W0-EDITOR-F` 目标平台 WebView 客观证据另以 `artifacts/editor-webview-native-macos/` 下最新 `editor-wv-*` 批次为准。环境、应用构建溯源、`provenance`、逐用例全字段、SHA-256 清单均以各自 `result.json` 为准。报告提交会改变 HEAD，故每次提交后须按最终 HEAD 复跑一次以保持 `provenance.status=PASS`；复跑不改变用例清单与判定规则。

## 1. 验收范围与忠实性声明

功能域严格按计划 §1 锁定为 `D-SHELL` 的标题栏、平台菜单与窗口命令，不覆盖项目/会话完整生命周期、全局搜索索引、真实模型请求、真实多轮对话和文件编辑器基础链路；那些能力分别归 `D-NAV`、`D-MODEL`、`D-CHAT`、`D-EDITOR` 的独立门槛。

| 忠实性约束 | 本批次的落实 |
| --- | --- |
| 用例清单不得删减、合并、改名 | 计划 §3 的 `TB-MENU-001`~`TB-MENU-012` 共 12 项，加上 §3 第 62 行的 `TB-MENU-003-GLOBAL-SEARCH` 追加项，合计 13 项；`coverage.plannedCount=13`、`executedCount=13`、ID 集合完全一致 |
| `P` / `F` 必须分别判定 | `subsets` 分别给出 `W0-SHELL-MENU-P` 与 `W0-SHELL-MENU-F` 结论；`F` 不是 `P` 的附属 PASS，也不因 `P` 结果自动升级。`F` 已由独立脚本 `UI-ACC-TITLE-BAR-FIXTURE-001` 单独归档；P 原生批次对 F 归属用例记 `NOT_APPLICABLE`（批次归属不适用）并以 `authoritativeGate` 引用该门槛，不写死 F 结论、不新增状态值 |
| `F` 缺依赖必须单独 `BLOCKED` | 由独立脚本读取 `W0-NAV-F`、`W0-EDITOR-F` 真实 `result.json` 判定，依赖均 PASS 后 `F=PASS`。依赖结论不硬编码 |
| `CF-023` 不得用侧栏搜索冒充全局搜索 | `TB-MENU-003-GLOBAL-SEARCH` 保留在覆盖率清单内；`CF-023` 已实现 `UnifiedSearchPanel`（按项目/会话/当前项目文档分组、Escape 返回），侧栏内联输入框降级为「快速筛选」不再冒充；该用例转为客观用例（原生菜单项存在性 + M3 companion 面板 DOM 验证），不删除、不改写为 PASS 凑绿；原生层还要求面板打开与关闭两侧都读回为真，且投递 Escape 前须先激活应用、点击搜索输入框并读回真实 WebView 焦点 |
| 不得放宽断言凑绿 | `TB-MENU-008` 现由客观判据真实达成而升 PASS：自定义全屏菜单项 + 多信号几何交叉（三信号 `score=3`）+ LaunchServices Dock Reopen（窗口数 `0→1`）；判定阈值未降低，`AXFullScreen=true` 仍为必要主条件，几何信号仅由「尺寸等于整屏」修正为「边界对齐覆盖可见工作区」，以适配 macOS 原生全屏让出 34px 菜单栏的事实；`TB-MENU-010` 先建立真实 WebView 焦点再断言关闭后焦点恢复 |
| 平台证据不得互相冒充 | 原生 AX/CoreGraphics 批次与 M3 Playwright/WebView companion 分层归档，见 §5 |

本批次没有修改测试范围：13 个计划用例 ID 全部逐项执行并逐项留痕，未因 `CF-023`、`W0-EDITOR-F` 或全屏态不可自动化而把任何一项从清单中移除。新增独立 F 门槛脚本后，两套批次（P 原生 / F 独立）的 `plannedCaseIds` 与 `executedCaseIds` 都仍是同一组 13 个 ID，`coverage.idsMatch=true`；F 批次对 P 归属用例只引用最新原生批次状态并标注来源，不重复判定、不缩减。

## 2. 执行批次与环境

| 项目 | 本机记录 |
| --- | --- |
| 目标应用 | `/Applications/Vinkey.app`，bundle `com.vinkey.desktop`，进程 `Vinkey`；版本与构建号取自 `Contents/Info.plist`，嵌入 Git SHA 取自隔离 Profile 的 `vinkey-runtime.jsonl` 的 `app.start.fields.commitSha`（计划 §2 溯源前置） |
| 溯源 | `result.json.application.gitSha` / `gitShaEvidence` / `buildTimeEpochMs` / `workingTreeDirtyAtBuild` / `sourceIdenticalToHead`；`result.json.provenance.status` 为 `PASS` 或 `REVIEW`，`repositoryClean` 记录工作树状态。构建 SHA 与 HEAD 不同时，以 `src/`、`src-tauri/src/`、`index.html` 零差异证明界面代码同版本 |
| 平台 | macOS `26.6.2` / arm64（满足计划 §2 的 macOS 15+ 下限），Node `v22.22.2`，Swift `6.3.2` |
| 权限路径 | `osascript` + `System Events` 在本会话返回 `-10004` 权限违例，按计划 §4.1 改走纯 Accessibility AX C API（`AXIsProcessTrusted()`、`kAXMenuBarAttribute`、`AXUIElementPerformAction`、`CGEvent`）；helper 源码为 `scripts/title-bar/menu-ax-helper.swift`，同批归档为 `native-automation.swift`。helper 另提供 `activate`（把应用切到前台）与 `dismiss`（只关闭帮助/诊断类弹窗）命令 |
| 截图机制 | 窗口截图由 `CGWindowListCreateImage` 按窗口 ID 捕获；菜单展开截图用 `screencapture -R0,0,760,190` 只截系统菜单栏与下拉菜单区域；`display-info.txt` + `display-metadata.json` 记录显示器/缩放原始信息 |
| 应用状态 | 两阶段：无项目空隔离 Profile；复用 `W0-NAV-F` fixture 的已打开项目 Profile（`VINKEY_ACCEPTANCE_DATA_DIR` 注入），不触碰用户真实数据 |
| 模型 | 按计划 §2，Ollama / profile / 真实会话不是本专项前置条件，记为 `N/A`，不因未启动模型判菜单结构失败 |
| 平台差异 | 本机 `AXMenuBarItem` 不暴露 `AXExpanded`；以 `AXSelected=1` 与 `AXChildren` 中的 `AXMenu` 表示展开态，完整属性清单归档为 `states/menu-attrs.json`，作为计划 §4.1 步骤 2 的等价核对证据，未删掉展开态断言 |

## 3. 用例矩阵（13/13，逐项与计划 §3 对齐）

计划 §3 要求每个用例记录平台、前置状态、动作、预期、实际、证据和退出码；全字段以两套批次的 `result.json.cases[]` 为准，下表为审核摘要。所有用例 `exitCode=0`。

复合判定规则（不改变计划范围）：P 归属 9 项取 `UI-ACC-TITLE-BAR-001` 最新原生批次；F 归属 4 项（`TB-MENU-002`、`003`、`004`、`003-GLOBAL-SEARCH`）取 `UI-ACC-TITLE-BAR-FIXTURE-001` 最新独立批次。P 原生批次中 F 归属用例的观察值只是原生过程证据，不作为 F 门槛结论；F 批次中 P 归属用例也只是带来源的引用。两套批次均 13/13 覆盖、ID 集合与计划 §3 完全一致。

| 用例 | 场景 | 子集 | 前置状态 | 实际结果摘要 | 结论 | 主要证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `TB-MENU-001` | 一级菜单树 | P | 已打开项目 | 业务一级菜单 `Vinkey / 项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助` 与计划顺序文案一致；`Apple` 系统项单独标记；无「文件」 | PASS | `menu-tree.json`、`states/menu-tree.json`、`screenshots/03-native-menu-expanded.png`、`states/menu-attrs.json` |
| `TB-MENU-002` | 项目菜单 | F | 两阶段 | 无项目时「刷新当前项目」`enabled=false`、「添加本地项目…」`enabled=true`；有项目时刷新后 `project-records` 会话总数 `4 → 4`（未清除） | PASS | `screenshots/01-no-project-menu-tree.png`、`states/click-refresh-project.json`、`screenshots/04-after-refresh-project.png` |
| `TB-MENU-003` | 会话菜单 | F | 两阶段 | 无项目时「新建会话」点击可达并显示「还没有添加项目 / 未打开项目」提示；有项目时点击成功。「会话 > 搜索项目与会话 ⌘K」已挂载 `CF-023` 统一搜索面板入口 | PASS | `states/click-new-conversation-no-project.json`、`screenshots/02-no-project-new-conversation.png`、`states/click-search-sessions.json` |
| `TB-MENU-003-GLOBAL-SEARCH` | 全局搜索（CF-023 / TB-GAP-006） | F | 已打开项目（M3 companion） | `CF-023` 已实现 `UnifiedSearchPanel`（`src/components/UnifiedSearchPanel.tsx`），按项目/会话/当前项目文档三组分组、`Escape` 返回；原生「会话 > 搜索项目与会话 ⌘K」与 ⌘/Ctrl+K 均调用 `store.setUnifiedSearchOpen(true)` 打开面板（侧栏内联输入框已降级为「快速筛选」不再冒充）；原生层先激活应用并点击搜索输入框读回 `AXTextField` 焦点，再投递 Escape，面板打开/关闭两侧均以 WebView AX 文本读回为真 | PASS（F 独立批次 + 原生双向读回 + M3 companion 客观验证） | `webview/result.json`（UI-ACC-TITLE-BAR-001 批次 `TB-MENU-003-GLOBAL-SEARCH`）、`states/texts-before-search-close*.json`、`states/texts-after-search-close*.json`、`src/components/UnifiedSearchPanel.tsx`、`menu-tree.json` |
| `TB-MENU-004` | 编辑焦点分派 | F | 已打开项目 | 验收次序（计划 §6）：`W0-NAV-F`/`W0-EDITOR-F` 前置 PASS → `W0-SHELL-MENU-F` 才给出权威判定。独立 F 批次：① 对话输入框六项命令 + 选区保持（机器合同 PASS）；② 可编辑文档由 `W0-EDITOR-F` 的 `EDIT-F-001`~`006` 文档编辑合同与 `.code-editor` 事件桥接覆盖；③ 搜索/设置输入框由 M3 companion 的 selection 断言覆盖；无编辑目标时命令禁用。`W0-EDITOR-F` 真实 PASS 后三类输入控件组合成立。P 原生批次先于业务 fixture 执行，对 F 归属用例记 `NOT_APPLICABLE`（批次归属不适用）+ `authoritativeGate` 引用（AX 焦点与六项命令仅作过程证据），不写 `PASS`/`BLOCKED`、不重复判定；`cases[].status` 只用四态；缺依赖时由 F 门槛按 §1 第 19 行单独记 `BLOCKED` | PASS（F 独立批次；P 批次 N/A＝批次归属不适用） | `title-bar-w0-f-*/machine/result.json`、`dependencies/W0-EDITOR-F*.json`、`webview-companion-snapshot.json`；原生过程证据 `states/focus-chat-input.json`、`screenshots/07-after-edit-commands.png`、P 批次 `result.json` 的 `authoritativeGate` |
| `TB-MENU-005` | 查看页面切换 | P | 已打开项目 | 对话工作台 / 项目文件 / 任务与日志三次点击成功，页面文本签名去重后 3 种；同一隔离 fixture 保持基础容器状态 | PASS | `screenshots/08-view-chat.png`~`10-view-logs.png`、`states/view-*-texts.json` |
| `TB-MENU-006` | 主题菜单 | P | 已打开项目 | 切换前后窗口截图像素内容变化；切换后仍有 12 条 WebView 文本，业务选择未清空 | PASS | `screenshots/11-theme-before.png`、`12-theme-after.png`、`states/click-theme.json` |
| `TB-MENU-007` | 设置归属 | P | 已打开项目 | `Vinkey` 应用菜单含「设置…」；「查看」不含设置；菜单点击与 `Cmd+,` 均可达，设置页文本 31 条 | PASS | `screenshots/13-settings-open.png`、`states/click-settings.json`、`states/key-cmd-comma.json` |
| `TB-MENU-008` | 窗口控制 | P | 已打开项目 | 窗口菜单必需项齐全；最小化后 `AXMinimized=true` 并可恢复；缩放后尺寸 `[1710,1107]`，前置 `axSizeMatchesDisplay=true` / `cgBoundsMatchesDisplay=true` 但 `axFullScreen=false`（zoom 态）。点击自定义「进入全屏」菜单项后多信号交叉判据 `axFullScreen=true` + `axSizeMatchesDisplay=true` + `cgBoundsMatchesDisplay=true` → `score=3 / verdict=fullscreen`（原生全屏 frame `(0,34,1710,1073)`，让出 34px 菜单栏）；「关闭窗口」后窗口数归 0，经 LaunchServices 投递 Dock Reopen 后恢复为 1 → `verdict=reopened`。app 按最终 HEAD 重建，`provenance.status=PASS` | PASS | `states/window-minimize.json`、`window-zoom.json`、`window-fullscreen-precheck.json`、`window-fullscreen-state.json`、`window-after-close.json`、`window-reopen-activate.json`、`window-reopen-state.json`、`screenshots/16-before-window-actions.png` |
| `TB-MENU-009` | 帮助和诊断 | P | 已打开项目 | 快捷键 / 窗口诊断信息 / 应用诊断日志三项均由应用内模态承载，可触发并 Escape 关闭；「关于 Vinkey」位于应用菜单；模态视觉/无障碍完成度归 §8.5 人工复核，不计客观 PASS | PASS | `screenshots/14-help-0.png`~`14-help-2.png`、`menu-tree.json` |
| `TB-MENU-010` | 菜单关闭与焦点 | P | 已打开项目 | 激活应用后点击对话输入框并读回验证焦点为 `AXTextArea`；展开「查看」后展开态 `["查看"]`，Escape 后 `expanded=[]` 且焦点回到 `AXTextArea`；断言与截图同时归档 | PASS | `screenshots/15a-menu-expanded-state.png`、`15b-menu-closed-focus.png`、`states/menu-close-final.json` |
| `TB-MENU-011` | 中文菜单审计 | P | 已打开项目 | 自有菜单项英文残留 `[]`；系统注入服务项单独标记 13 条（`Quit and Keep Windows`、`AutoFill`、`Start Dictation…`、`Minimize All` 等），品牌/格式/协议字段按计划允许保留 | PASS | `menu-tree.json` |
| `TB-MENU-012` | 首版菜单减法审计 | P | 已打开项目 | 菜单中禁止项 `[]`（无全局停止生成、侧栏折叠、文档保存/关闭）；降级入口由 M3 companion 复核存在 | PASS | `webview/result.json`、`menu-tree.json` |

计数（与最新 P 原生批次 `result.json.summary` 一致）：`caseCount=13`、`passed=12`、`failed=0`、`blocked=0`、`notApplicable=1`（F 归属的 `TB-MENU-004`，批次归属不适用）；四项之和 `12+0+0+1=13`，覆盖不缩水；`cases[].status` 只用四态，无第五态；`result.json.exitCode=0`，进程退出码与之一致。最新 P 原生批次 `subsets['W0-SHELL-MENU-P'].conclusion=PASS`（12/13 passed, 0 failed, 0 blocked, 1 N/A；`TB-MENU-004=N/A` 批次归属不适用 + `authoritativeGate` 引用独立门槛；`TB-MENU-003-GLOBAL-SEARCH` 客观 PASS、`TB-MENU-008` 全屏/Reopen 判据达成 PASS）；M3 companion `5/5 PASS`。独立 F 门槛 `overallConclusion=专项通过`（13/13 passed, 0 failed, 0 blocked；`TB-MENU-004=PASS`、`TB-MENU-008=PASS`；`coverage.idsMatch=true`、13/13 覆盖）。WebView / P / F 三批 `provenance.status=PASS`、`repositoryClean=true`；三批 `SHA256SUMS` 均已逐文件重算并全部校验通过（清单条数以各批次文件为准，不在报告内固化计数）。

> 关于「F 门槛 PASS 不等于专项通过（Alpha 客观范围）」：`W0-SHELL-MENU-F` 由计划 §1 第 19 行与 §7 第 114 行独立判定，只有 `W0-NAV-F`、`W0-EDITOR-F` 均真实 PASS 且 F 归属适用用例无 FAIL/BLOCKED 时才解锁；它不是由 P 结果或 M3 companion 升级而来。按计划 §6 次序，`TB-MENU-004` 的权威判定发生在这两个前置依赖 PASS 之后，P 原生批次只记 `NOT_APPLICABLE`（批次归属不适用）与 `authoritativeGate` 引用。反过来，P 与 F 双双 PASS 也不得自动升级为跨平台发布通过或 `通过（功能域单平台范围）`——Windows 平台验收属独立 Windows 专项，不计入本 macOS 专项判定，故整体仍不宣称跨平台发布通过。但就 macOS 客观范围而言，P 子集 9/9 与 F 归属 4 用例均客观 PASS、构建溯源已定稿、无客观遗留项，本 macOS 专项达成 `专项通过（Alpha 客观范围）`；`W0-EDITOR-F` 人工 UI 观察与帮助弹窗视觉质量/交互完成度（`DEFER-UI-001`）等主观项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不阻断本 macOS 专项，也不再作为 Alpha 的条件通过原因。

## 4. 子门槛判定

### 4.1 `W0-SHELL-MENU-P` — PASS

P 子集 9 个用例（13 项扣除 4 个 F 归属用例）：`9 PASS / 0 FAIL / 0 BLOCKED`，`subsets['W0-SHELL-MENU-P'].conclusion=PASS`。`TB-MENU-008` 已客观解卡：点击自定义「进入全屏」菜单项后多信号交叉判据 `score=3 / verdict=fullscreen`（`AXFullScreen=true` + AX 尺寸 + CG 窗口边界，原生全屏 frame `(0,34,1710,1073)`）；Reopen 侧由 LaunchServices 投递真实 Dock Reopen 事件、窗口数 `0 → 1 / verdict=reopened`。app 已按最终 HEAD 重建，`result.json.application.gitSha` 与 HEAD 一致、`sourceIdenticalToHead=true`、`workingTreeDirtyAtBuild=false`，`provenance.status=PASS`；判定阈值未降低。F 归属的 `TB-MENU-004` 按计划 §6 次序记为 `NOT_APPLICABLE`（批次归属不适用，含 `authoritativeGate` 引用，只留原生 AX 过程证据），不计入 P 子集 9 项判定，也不构成 P 批次的 `BLOCKED`；其权威结论由 `W0-EDITOR-F` 前置 PASS 之后的独立 F 门槛给出。诊断弹窗的视觉质量/交互完成度已按总计划 §8 登记为 `DEFER-UI-001`。

- 不因 `F` 阻断而降格，也不吸收 `F` 结果；P 只证明壳层与平台承载能力。
- 不反向把 P 结论写入 `W0-SHELL-P` 或 `D-NAV`；壳层报告 §1 与导航报告 §8 的边界继续有效。
- 按计划 §6，专项通过（Alpha 客观范围）要求「目标平台证据与构建溯源均可核验」；本批次构建溯源已定稿，`W0-EDITOR-F` 目标平台 WebView 客观证据已由 `UI-ACC-EDITOR-WEBVIEW-001` 采集、目录取消保态已按 AX/CG 双信号客观判定为 `preserved`。`W0-EDITOR-F` 人工 UI 观察与 `DEFER-UI-001` 等主观项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不在本 macOS 专项客观判定或专项通过（Alpha 客观范围）的阻断项内；客观项全 PASS 后，本 macOS 专项在 Alpha 客观范围达成专项通过（Alpha 客观范围）。

### 4.2 `W0-SHELL-MENU-F` — PASS（独立门槛已解锁）

| 依赖 | 状态 | 依据 |
| --- | --- | --- |
| `W0-SHELL-MENU-P` | PASS | 最新 `UI-ACC-TITLE-BAR-001` 原生批次 `subsets['W0-SHELL-MENU-P'].conclusion` |
| `W0-NAV-F` | PASS | `artifacts/navigation-acceptance/run-*/result.json` 6/6，见导航报告 §8 |
| `W0-EDITOR-F` | PASS（本机已执行） | `artifacts/editor-acceptance/run-*/result.json` CLI 6/6、`tests/editor/editor-acceptance-cli.test.ts` 10/10；路径守卫用 `safeRealpath` 归一 macOS `/var/folders` → `/private/var/folders` 符号链接，越界保护断言未放宽 |

- 独立脚本已建立：`scripts/title-bar/title-bar-fixture-acceptance.ts` + `run-title-bar-fixture-acceptance.mjs` / `.sh` / `.ps1`，npm 入口 `test:title-bar-fixture-acceptance`（含 `:sh` / `:win`）；批次目录独立为 `artifacts/title-bar-fixture-acceptance/title-bar-w0-f-*`。合同测试 `tests/title-bar/title-bar-fixture-acceptance-cli.test.ts` 6/6 PASS，机器验证「13 项覆盖不缩水、依赖结论读真实批次、F 通过不自动升级专项」。
- 判定来源：F 结论由 `title-bar-w0-f-*/result.json` 的 `subsets['W0-SHELL-MENU-F'].conclusion` 给出；`dependencies` 逐项记录三个依赖批次的路径、`conclusion`、`gitSha`、`provenanceStatus`、`repositoryClean`，不硬编码。
- 职责分离：`UI-ACC-TITLE-BAR-001` 原生 runner 不判定 F；F 归属用例在本批次记 `NOT_APPLICABLE`（批次归属不适用），并以 `authoritativeGate` 登记独立门槛的脚本 ID / 命令 / 归档目录，只把 F 归属菜单动作作为原生过程证据。`cases[].status` 只用四态，两个 runner 不再对同一件事给出互相矛盾的结论。
- 专项门槛（macOS 范围）已在 Alpha 客观范围内越过：`TB-MENU-003-GLOBAL-SEARCH`（`CF-023`）客观 PASS；F 归属的 `TB-MENU-004` 已按计划 §6 次序由独立 F 门槛（在 `W0-NAV-F`/`W0-EDITOR-F` 前置 PASS 之后）判为 PASS，P 原生批次只记 `NOT_APPLICABLE`（批次归属不适用）与原生过程证据。`TB-MENU-008` 全屏/Reopen 已客观解卡为 PASS，构建溯源 `provenance=PASS` 已按最终 HEAD 定稿，二者不再是专项阻断项。`W0-EDITOR-F` 目标平台 WebView 客观证据已采集、目录取消保态已客观判定为 `preserved`，二者为客观已达成项。`W0-EDITOR-F` 人工 UI 观察与帮助弹窗视觉/无障碍评审（`DEFER-UI-001`，弹窗已升级为应用内模态）等主观项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本 macOS 专项遗留项或阻断项。Windows 平台验收属独立 Windows 专项、不计入本 macOS 结论，故整体仍不宣称跨平台发布通过或 `通过（功能域单平台范围）`；但就 macOS 客观范围而言，本专项达成 `专项通过（Alpha 客观范围）`。`F=PASS` 表示 F 子门槛解锁，是专项通过（Alpha 客观范围）的客观组成之一，而非 `通过（功能域单平台范围）` 或跨平台发布通过。

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
| `native-automation.*` | `native-automation.swift`（AX C API helper 源码）；计划写的是 AppleScript 操作源，本机 `System Events` 不可用，故按 §4.1 走纯 Accessibility，此处为平台实现偏差并如实记录 |
| `webview/` | 有；M3 companion `result.json` + `SHA256SUMS` + 12 张截图，5/5 PASS |

额外归档：`menu-tree.json`（完整原生菜单树）、`states/`（逐次 AX 状态 JSON，含 `activate-*` 应用激活、`focus-*` 焦点读回验证、`help-*-dismiss.json` 弹窗关闭记录）、`app-runtime.log`。stdout 只输出套件结论、`Results:`、`SHA256SUMS:`、`exit=<n>` 四行；详细用例与环境信息以 `result.json` 为准。

### 5.2 证据层级（不得扩大解释）

1. 原生证据：真实启动 `/Applications/Vinkey.app`，AX C API 直接读取/点击 `AXMenuBar` / `AXMenuItem`，`CGWindowListCreateImage` 按窗口 ID 捕获 20 张原生截图。这是本专项结论的主要依据。
2. M3 WebView companion：Playwright 在 Win32 上下文渲染自绘标题栏（`macOS` 下 `TitleBar` 返回 `null`），为 `TB-MENU-004`、`TB-MENU-005`、`TB-MENU-010`、`TB-MENU-012`、`TB-MENU-003-GLOBAL-SEARCH` 提供结构证据，5/5 PASS、12 张截图。它不能证明 macOS 原生菜单、交通灯、系统窗口按钮或物理 DPI，也不能升级任何 `BLOCKED` 用例或 `F` 子门槛。
3. 人工观察：`W0-EDITOR-F` 的人工 UI 观察（视觉质量、交互手感、无障碍观感）与诊断弹窗的视觉质量/交互完成度（`DEFER-UI-001`）已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，仍待测试人员回传，未被写成 PASS，也不由机器证据冒充。目录选择取消/失败保留原状态已由 `TB-MENU-002` 的 AXSheet + CG 面板窗口双信号判据客观判定为 `preserved`；全屏状态、关闭窗口后 Dock/系统 Reopen 恢复与诊断弹窗焦点返回均已由 `TB-MENU-008` / `TB-MENU-010` 客观读回，不再是遗留项。

### 5.3 `provenance`

以最新批次 `result.json.provenance.status` 为准（WebView / P / F 三批分别核对）。工作树存在未提交改动时为 `REVIEW`，应用构建 SHA 缺失或源码一致性不成立时按计划 §2/§6 阻断。本版已按最终 HEAD 重建 `/Applications/Vinkey.app` 并复跑 WebView / P / F 三套批次：app 内嵌 SHA = HEAD、`sourceIdenticalToHead=true`、`repositoryClean=true`、`workingTreeDirtyAtBuild=false`，三批 `provenance.status=PASS`，各自 `SHA256SUMS` 逐文件重算校验通过。报告本身不硬编码批次号、SHA 与证据清单条数，避免自引用失配。

### 5.4 独立 F 门槛批次输出集

`artifacts/title-bar-fixture-acceptance/title-bar-w0-f-*/` 单独归档，不与 P 原生批次混目录：

| 文件 | 说明 |
| --- | --- |
| `result.json` | 13 项用例全字段、`coverage.idsMatch`、`dependencies`、P/F 分别结论、`decision.specialityPass=true`、`overallConclusion=专项通过`、`humanReview`（§8.5 引用）、`provenance` |
| `SHA256SUMS` | 批次内全部文件逐条登记；`result.json` 定稿后一次性计算，不自引用，`shasum -c` 全部 `OK` |
| `machine/` | 由 `UI-ACC-TITLE-BAR-FIXTURE-001` 机器合同层产出的 `result.json`、`diagnostics.json`、`fixture-manifest.json`、`SHA256SUMS` |
| `dependencies/` | 三个依赖批次的快照与 `*-result-snapshot.json` 原文，可追溯到 `W0-NAV-F` / `W0-EDITOR-F` / `W0-SHELL-MENU-P` |
| `webview-companion-snapshot.json` | 引用 P 批次 `webview/result.json` 的 M3 结构证据快照，不重新执行、不冒充原生证据 |
| `events.txt` / `automation-stderr.txt` / `display-info.txt` / `fixture-manifest.json` | 逐事件日志、空 stderr、显示器原始信息、fixture 清单，与 P 批次输出集口径一致 |

该批次不含原生窗口截图，也不声称证明 macOS 原生菜单、交通灯或系统窗口动作；这些仍只由 `UI-ACC-TITLE-BAR-001` 批次承担。

### 5.5 `W0-EDITOR-F` 目标平台 WebView 客观证据批次

`UI-ACC-EDITOR-WEBVIEW-001` 在 `artifacts/editor-webview-native-macos/editor-wv-*/` 独立归档，不与 `artifacts/editor-acceptance/run-*`（fixture / 文件桥接合同层）或标题栏批次混目录。证据取自真实 `/Applications/Vinkey.app` 窗口：ApplicationServices AX 树与文本快照、原生菜单 `查看 > 项目文件` 点击、`AXPress` 打开 `README.md`、CoreGraphics 窗口截图、隔离 Profile 的 `app.start` 构建溯源日志。

| 用例 | 客观判据 | 结论 |
| --- | --- | --- |
| `EDIT-WV-001` | 真实窗口 `AXWebArea` + 原生菜单切换 + `AXPress` 打开文档 | PASS |
| `EDIT-WV-002` | `AXLandmarkRegion`「文件列表」子树含 `README.md` 按钮 | PASS |
| `EDIT-WV-003` | `AXTextArea` 的 AXValue 与 fixture 文档内容逐字一致 | PASS |
| `EDIT-WV-004` | 状态栏按「语言/markdown、行/行数、字符数/字符、词数/词、UTF-8、LF、已保存」连续读回 | PASS |
| `EDIT-WV-005` | 「文档视图」分组子树含「编辑 / 分栏 / 预览」三个按钮 | PASS |
| `EDIT-WV-006` | `app.start.commitSha` = HEAD、构建时与当前工作树均干净，文件页/编辑器页原生截图齐备 | PASS |

该批次 `platformPass=false`、`humanUIObservation.returned=false`、`DEFER-UI-001` 只登记不判定：人工 UI 观察仍待测试人员回传（已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项），客观证据不冒充人工观察，也不代表 `W0-EDITOR-F` 平台层综合通过。`cases[].status` 只用四态；`result.json` 与 `SHA256SUMS` 由批次自行定稿，原始 `app-runtime.jsonl`、`states/`、`screenshots/` 同批归档。

## 6. 遗留项与实现偏差（不得据此宣称通过）

1. `CF-023` / `TB-GAP-006`（已实现）：设计 §3.2 要求「打开统一搜索面板，按项目、会话、当前项目文档分组；`Escape` 返回原页面」。`CF-023` 已实现：`src/components/UnifiedSearchPanel.tsx` 按三组分组、`Escape` 返回；⌘/Ctrl+K 与「会话 > 搜索项目与会话」菜单项均调用 `store.setUnifiedSearchOpen(true)`；侧栏内联输入框降级为「快速筛选」不再冒充全局搜索。`TB-MENU-003-GLOBAL-SEARCH` 经原生菜单项存在性 + M3 companion 面板分组/Escape 验证为 PASS（见 `webview/result.json` 与 F 批次 `result.json`），判定阈值未降低。
2. 跨文档口径需产品/设计复核：`UI_ACCEPTANCE_PLAN.md` §7 与导航报告 §2 把「全局搜索入口/结果面板」描述为已实现；导航报告 `NAV-E-005` 的 PASS 实际证明的是当前工作区「项目/会话/文档」三类分组搜索与跳转（`scripts/navigation/navigation-e2e-acceptance.ts` 的 `grouped` 断言），不构成 `CF-023` 统一面板的验收证据（`CF-023` 由本专项 `TB-MENU-003-GLOBAL-SEARCH` 独立验证）。本专项不改变 `D-NAV` 结论，也不借用其 PASS 为 `CF-023` 背书；两处描述的一致性需另行复核，不在本专项里修改测试范围。
3. 诊断弹窗（客观部分）：快捷键/窗口诊断/应用诊断日志由应用内模态承载，`TB-MENU-009` 仅按客观断言计「动作可触发 / 可关闭 / 焦点返回 / 脱敏 / 构建溯源」，这些仍计入专项通过（Alpha 客观范围）的依据。模态的视觉质量/交互完成度按总计划 §8.3 登记为 `DEFER-UI-001`，已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不计入本 macOS 专项判定或专项通过（Alpha 客观范围）的阻断项（与客观行为分开：不删除、不改写为 PASS）。
4. F 门槛已解锁，但 macOS 专项遗留项未清：`W0-EDITOR-F` 本机已执行并 PASS（CLI 6/6 + 合同测试 10/10），独立 `UI-ACC-TITLE-BAR-FIXTURE-001` 已建立且 `F=PASS`。按计划 §6 次序，`TB-MENU-004` 的权威判定在 `W0-NAV-F`/`W0-EDITOR-F` PASS 之后由该门槛读取真实 `result.json` 给出（PASS），P 原生批次只记 `NOT_APPLICABLE`（批次归属不适用）+ `authoritativeGate` 引用。`TB-MENU-008`（全屏/Reopen）客观 PASS、构建溯源 `provenance=PASS` 已定稿，均不再是专项阻断项。上述人工 UI 观察与 `DEFER-UI-001` 已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本 macOS 专项遗留项或专项通过（Alpha 客观范围）的阻断项。`W0-EDITOR-F` 目标平台 WebView 客观证据已由 `UI-ACC-EDITOR-WEBVIEW-001` 采集，目录取消保态已按 AX/CG 双信号客观判定为 `preserved`，二者不再是遗留项。Windows 平台验收属独立 Windows 专项，不计入本 macOS 专项判定；整体仍不宣称跨平台发布通过（Windows 独立专项 + 人工复核事项统一后置）。`specialityPass` 随客观项全 PASS 置 `true`（`专项通过（Alpha 客观范围）`）。
5. Windows 平台验收（独立专项，后置，不计入本 macOS 结论）：`decision.windowsPlatform=NOT_EXECUTED` 仅记录 Windows 平台未在本批次执行这一事实；Windows 自绘菜单、窗口控制、DPI 与截图由独立 Windows 专项（`UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md`）负责，本 macOS 专项不覆盖、亦不因此降级。仅提示：在 Windows 专项执行前，不得宣称跨平台发布通过。
6. 平台自动化偏差：`System Events` 权限违例、`AXExpanded` 缺失、菜单展开区域截图收窄、helper 由 AppleScript 改为 Swift AX C API，均已在 `result.json.environment` / `privacy` 与本报告 §2 如实记录。
7. `W0-EDITOR-F` 的边界：fixture / 文件桥接合同层由 `UI-ACC-EDITOR-001` 判为 PASS；目标平台 WebView 的文件树、编辑器、保存状态栏与文档视图已由 `UI-ACC-EDITOR-WEBVIEW-001` 取得客观证据。人工 UI 观察仍待测试人员回传（已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项），故 `W0-EDITOR-F` 平台层综合结论保持未判定；该边界见 [基础编辑器专项验收报告](../UI_ACCEPTANCE_EDITOR.md)，本专项不代为判定。

## 7. 与其他专项的边界

| 关联专项 | 本报告的处理 |
| --- | --- |
| `W0-SHELL-P` | 壳层报告 §1/§4 明确不判定菜单树与菜单命令；本报告不把 P 结果反向写入 `W0-SHELL-P`，也不改写其 24/24 结论 |
| `D-NAV` | 导航报告「通过（功能域单平台范围）」只针对 `D-NAV`；其 §8 不把菜单专项当证据。本专项复用 `W0-NAV-F` 的 fixture 生成器只是为了构造「已打开项目」前置状态，不重复判定导航业务链路 |
| `W1-MODEL-E` | `TB-MENU-007` 只验收「进入/返回设置」与壳层恢复；模型保存、连接和凭据由 `W1-MODEL-E` 负责 |
| 脚本计划状态 | `W0-SHELL-MENU-P/F` 已执行：P PASS / F PASS（独立脚本），本 macOS 专项在 Alpha 客观范围达成专项通过（Alpha 客观范围）；`W0-EDITOR-F` 为 fixture 合同层 CLI 6/6 + 合同测试 10/10、目标平台 WebView 客观证据 6/6（独立脚本），人工 UI 观察与 `DEFER-UI-001` 已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项（不计入本 macOS 专项判定） |

## 8. 结论（逐条对照计划 §6）

| §6 判定 | 是否满足 | 依据 |
| --- | --- | --- |
| 专项通过（Alpha 客观范围） | 是（Alpha 客观范围） | 要求所有适用用例均 PASS 且目标平台证据、构建溯源均可核验（macOS 范围）。本 macOS 专项内 P 子集 `9/9 PASS`、F 归属适用用例全 PASS、`13/13` 覆盖、`failed=0`；构建溯源已定稿为 `provenance=PASS`。`W0-EDITOR-F` 人工 UI 观察与 `DEFER-UI-001` 等主观项已集中至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，不再作为本专项遗留项；`W0-EDITOR-F` 目标平台 WebView 客观证据与目录取消保态 `preserved` 已补齐。Windows 独立专项未执行不计入本 macOS 结论，但整体仍不宣称跨平台发布通过（Windows 独立专项 + 人工复核事项统一后置）。`decision.specialityPass=true` |
| 条件通过 | 否 | 菜单结构与核心动作已通过、目标平台 WebView 客观证据已采集、目录取消保态客观达成、F 门槛独立解锁为 PASS、`exitCode=0`、各批次哈希清单均可核验；因人工项已摘除至 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md) 人工复核事项，本 macOS 专项在 Alpha 客观范围内达成专项通过（Alpha 客观范围），不再以「条件通过」表述 |
| 不通过 | 否 | `failed=0`；无旧「文件」一级菜单、设置不在「查看」、编辑命令未作用于错误焦点、菜单关闭断言与截图一致、最小化/缩放/关闭窗口动作成功 |
| 阻断 | 否 | 应用包可启动、平台权限具备、结果文件完整且可证明来自目标包；`W0-EDITOR-F` 已本机执行并 PASS，F 子门槛不再 `BLOCKED`。 |

最终结论：`D-SHELL` 标题栏与功能菜单专项（macOS）在 Alpha 客观自动化范围内达成 `专项通过（Alpha 客观范围）`；`W0-SHELL-MENU-P` = PASS，`W0-SHELL-MENU-F` = PASS（独立脚本 `UI-ACC-TITLE-BAR-FIXTURE-001`）；计划用例覆盖率 13/13，ID 集合与计划 §3 完全一致。`TB-MENU-008` 为 PASS（全屏 `score=3 / verdict=fullscreen`、Reopen `0→1 / verdict=reopened`），构建溯源 `provenance=PASS`（app 按最终 HEAD 重建、内嵌 SHA = HEAD）；`result.json.exitCode=0`，`decision.specialityPass=true`。该结论代表 macOS 专项在客观范围内的通过，不代表跨平台发布通过 / 整体发布通过（Windows 独立专项未执行 + 人工复核事项统一后置），也不代表 `D-NAV` / `D-CHAT` / `D-EDITOR` 通过。

## 9. 测试人员回填区

- `W0-SHELL-MENU-P`：`PASS`；最新批次为 `12/13 passed, 0 failed, 0 blocked, 1 N/A`（`TB-MENU-008=PASS`、`TB-MENU-004=N/A〔批次归属不适用〕`），证据见 `artifacts/title-bar-acceptance/` 最新 `title-bar-w0-p-*` 批次的 `result.json` + `SHA256SUMS` + `screenshots/`（20 张原生截图）+ `states/` + `menu-tree.json`。
- `W0-SHELL-MENU-F`：`PASS`；权威记录为 `artifacts/title-bar-fixture-acceptance/` 最新 `title-bar-w0-f-*` 批次的 `result.json` + `SHA256SUMS` + `dependencies/` + `machine/`；依赖状态见 `result.json.dependencies` 与 `subsets['W0-SHELL-MENU-F'].dependency`（`W0-NAV-F=PASS`、`W0-EDITOR-F=PASS`、`W0-SHELL-MENU-P=PASS`）。
- M3 companion：`5/5 PASS`；证据见 P 批次 `webview/result.json` + `webview/SHA256SUMS` + 12 张截图；仅为 WebView 结构证据。
- 人工复核清单：`<① 全屏：fullscreen-state 为 score=3 / verdict=fullscreen（AXFullScreen=true、原生 frame (0,34,1710,1073)），客观判据已达成，TB-MENU-008 记 PASS；Reopen 由 LaunchServices Dock Reopen 事件客观确认（窗口数 0→1 / verdict=reopened）；构建溯源 provenance=PASS（app 按最终 HEAD 重建、内嵌 SHA = HEAD、repositoryClean=true），无需人工目视复核；② 关闭窗口后主窗口隐藏状态已客观确认（窗口数归 0）；③ 目录选择取消/失败后原状态保留已由 AXSheet + CG 面板窗口双信号客观判定为 preserved（`AXPress Cancel` 后两信号同时消失、菜单树/窗口数状态读回不变）；④ 诊断弹窗焦点返回（客观，TB-MENU-010 已 PASS）；其视觉质量/交互完成度属 DEFER-UI-001，已集中至总计划 §8.5 人工复核事项；⑤ Windows 平台验收由独立 Windows 专项负责（后置，不计入本 macOS 结论）；⑥ W0-EDITOR-F 目标平台 WebView 客观证据已由 UI-ACC-EDITOR-WEBVIEW-001 采集（6/6 PASS），人工 UI 观察已集中至总计划 §8.5 人工复核事项（待自动化全部完成后统一处理，与 TB-MENU-004 的 F 门槛 PASS 判定分开记录）>`
- 问题列表：`<① CF-023/TB-GAP-006 已实现并客观 PASS：原生「会话 > 搜索项目与会话 ⌘K」与 ⌘/Ctrl+K 打开 UnifiedSearchPanel（按项目/会话/当前项目文档分组、Escape 返回），侧栏内联输入框降级为「快速筛选」不再冒充全局搜索；② TB-MENU-008 为 PASS：全屏 score=3 / verdict=fullscreen、Reopen 0→1 / verdict=reopened，判定阈值未降低；③ TB-MENU-004 判定归独立门槛：P 原生批次记 `NOT_APPLICABLE`（批次归属不适用）+ `authoritativeGate` 引用（仅 AX 过程证据），`W0-EDITOR-F` 前置 PASS 后由 `UI-ACC-TITLE-BAR-FIXTURE-001` 判 PASS，`cases[].status` 只用四态；④ 构建溯源 provenance=PASS（app 按最终 HEAD 重建、srcIdentical=true、repositoryClean=true）；⑤ 诊断弹窗视觉质量/交互完成度属 DEFER-UI-001，已集中至总计划 §8.5 人工复核事项（客观触发/关闭/焦点返回仍验，不阻断 Alpha）；⑥ Windows 平台验收属独立专项（后置，不计入本 macOS 结论），跨平台发布通过提示待其执行>`
- 综合结论：`<专项通过（Alpha 客观范围）— P 子集 9/9 PASS、F 门槛 PASS（13/13）；13/13 用例覆盖（P 批次 12 PASS + 1 N/A〔批次归属不适用〕、F 批次 13 PASS）；TB-MENU-008=PASS、TB-MENU-004=PASS、TB-MENU-003-GLOBAL-SEARCH=PASS；构建溯源 provenance=PASS（app 按最终 HEAD 重建、内嵌 SHA = HEAD）；人工项已摘除至总计划 §8.5 人工复核事项；剩余为 Windows 独立专项后置（不计入本 macOS 结论），不得宣称跨平台发布通过或整体发布通过>`
- 下一次复审版本/日期：`<人工复核事项统一处理（总计划 §8.5）、Windows 专项执行（独立平台）、Vinkey 版本发布，或菜单树/设计合同变更时>`
