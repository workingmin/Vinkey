# 应用壳层与入口专项验收报告（Windows）

> **平台说明**：本文档是 Windows 平台版；macOS 平台验收见 [UI_ACCEPTANCE_MACOS_SHELL.md](../macos/UI_ACCEPTANCE_MACOS_SHELL.md)。验收合同（设计断言与判定规则）与脚本规范跨平台一致，执行入口和证据按平台分别记录。

> **审核范围说明**：本报告只保留**当前最新版本的一次验收记录**。历史批次的过程记录、升级注记和复核说明已从本文件移除；对应原始归档仍按受控方式留存于 `artifacts/ui-shell-native-windows/`（目录待建立），不纳入管理层审核清单。唯一有效证据以「本版本最终构建 HEAD 下重跑产生的最新 `run-*.tar.gz`」为准，其 `result.json` 记录批次号、生成时间与 Git SHA。Windows 平台尚未执行，本报告当前只维护验收合同与执行计划，不包含通过结论。

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`
- 关联设计：[UI_DESIGN_SHELL.md](../../../design/ui/UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)
- 标题栏菜单专项计划：[UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)，拆分为 `W0-SHELL-MENU-P`（平台/结构）与 `W0-SHELL-MENU-F`（fixture 业务入口链路）
- 导航业务报告：[UI_ACCEPTANCE_WINDOWS_NAVIGATION.md](./UI_ACCEPTANCE_WINDOWS_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md)
- 自动化入口：[Playwright 脚本](../../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令为 `npm run test:ui-shell-acceptance -- --platform windows`；Windows 入口脚本 [run-ui-shell-acceptance.ps1](../../../../scripts/ui-shell/run-ui-shell-acceptance.ps1)
- Windows 原生入口：待建设；当前以 Playwright 实机 + Tauri 自绘窗口人工证据为主，原生窗口自动化可比对 macOS 版 `run-ui-shell-native-macos.sh` / `ax-shell-helper.swift` 规划
- 当前平台批次：`Windows`（待执行）
- 最新证据批次：`artifacts/ui-shell-native-windows/` 下最新 `run-*.tar.gz`（待建立）
- 报告状态：**待独立执行**（`W0-SHELL-P` Windows 子门槛未开始），不构成通过结论
- 更新日期：`2026-11-04`

## 1. 验收边界

本报告只判定应用壳层的平台/结构承载：窗口或 Overlay、窗口控制、侧栏容器、内容页承载、设置替换、诊断/错误承载、主题、焦点和响应式基线。标题栏菜单树、菜单项动作、中文菜单审计和菜单关闭由独立的 [标题栏菜单专项计划](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) 的 `W0-SHELL-MENU-P/F` 执行；本报告不把菜单结果计入 `W0-SHELL-P`，也不把旧菜单自动化结果当作目标菜单通过。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。浏览器演示只能支持结构观察，不能替代 Windows Tauri 自绘窗口控制、DPI 和真实尺寸证据；原生菜单不在本门槛范围内。壳层脚本在截图前仅核对目标一级菜单合同（`CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P`），菜单动作和命令焦点分派仍应在 `W0-SHELL-MENU-P/F` 中复测。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 应用窗口/Overlay 承载 | Windows 自绘标题栏与窗口按钮 | 平台装饰方式正确；内容区避让标题栏安全区；不依赖菜单树 | 待执行 |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | 待执行 |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；无平台遮挡 | 待执行 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | 待执行 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | 待执行 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | 待执行 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | 待执行；需采集 Windows 显示缩放/DPI |
| `SHELL-P-008` 键盘与主题 | Tab、主题切换、壳层返回路径 | 焦点可见、入口可达、主题不丢壳层状态；菜单 Escape 另由菜单专项验收 | 待执行 |

## 3. 当前实现与自动化证据

Playwright 自动化入口支持按平台运行（`--platform windows`），并在状态变化后等待双帧、最终侧栏宽度和主题计算样式再截图；诊断用例覆盖脱敏、刷新、复制、Escape/按钮关闭和焦点返回。

Windows 原生窗口自动化入口尚未建设：macOS 侧的 `run-ui-shell-native-macos.sh` / `ax-shell-helper.swift`（AX/CoreGraphics）仅适用于 macOS 15+，Windows 侧需要独立的 Windows UI Automation / Win32 窗口控制与窗口级截图方案，列入后续工作。在此之前，Windows 的证据来源是 Playwright 实机运行（WebView DOM 层）加测试人员对 Tauri 自绘窗口的人工观察；浏览器演示不能替代真实平台结论。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 代码层结论；不替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 桥接层结论；需目标平台确认 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright 覆盖不等价于 Tauri 桌面壳层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON；支持 `--platform windows` | 不驱动 Tauri 原生窗口控件 |
| `scripts/ui-shell/run-ui-shell-acceptance.ps1` | Windows PowerShell 入口 | 待执行；作为 Windows 平台脚本入口 |
| `scripts/build/build-windows.ps1` | Windows 安装包构建 | 待执行；记录版本、构建号与嵌入 Git SHA |

壳层脚本不得通过菜单选择器断言标题栏设计已完成；菜单名称、菜单动作和编辑焦点命令使用 [UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) 的专项脚本和人工证据。壳层脚本只验证菜单无关的窗口、容器和页面状态。

## 4. 最新版本 Windows 原生验收记录（唯一有效批次）

> Windows 平台尚未执行。本节在首次执行后，只保留最终构建 HEAD 下重跑产生的唯一最新批次；以下为执行合同占位，不代表通过。

### 4.1 批次与环境（待回填）

| 项目 | 已核验结果 |
| --- | --- |
| 入口 | `<SCRIPT_ID>@<VERSION>`，命令 `<COMMAND_USED>` |
| 批次 | `artifacts/ui-shell-native-windows/`（待建立）下本版本最终 HEAD 生成的最新 `run-*.tar.gz` |
| 验收标识 | `W0-SHELL-P-NATIVE-WINDOWS`（沿用 macOS 版命名风格，正式 ID 以脚本实现为准）；WebView companion 为 `W0-SHELL-P-WEBVIEW` / `ui-shell-playwright@<VERSION>` |
| 应用/仓库 | 版本 `<VERSION>`、bundle `com.vinkey.desktop`、`<x64/arm64>`；构建时仓库 HEAD 与工作树状态 |
| 环境 | Windows `<VERSION>` / `<ARCH>`，Node.js `<VERSION>`，Rust `<VERSION>`，Tauri CLI `<VERSION>` |
| 截图机制 | Windows 自绘窗口截图方案（待建设：Win32/窗口级捕获） |
| 显示器 | `<DISPLAYS / SCALE / DPI>`（需结构化采集显示缩放与物理 DPI，缺失时转人工 fallback） |
| 隔离 Profile | `script-temporary-isolated`（沿用 macOS 版约定） |

### 4.2 机器结果与用例覆盖（待回填）

| 项目 | 已核验结果 |
| --- | --- |
| 顶层结论 | `<PASS/FAIL/BLOCKED>`；`exitCode=<CODE>`；`<PASSED>/<TOTAL>` 通过 |
| 原生窗口 | `LAUNCH`、自绘窗口按钮（最小化/最大化/还原/关闭）、三档实际窗口尺寸、`WINDOW-ZOOM`、`WINDOW-MINIMIZE`、`DISPLAY-BOUNDS`、`WINDOW-CLOSE`（对应 macOS 版用例，待 Windows 原生脚本落地后对齐） |
| WebView companion | 侧栏/设置稳定宽度、三页切换与空态、错误条、诊断完整链路、浅色/深色主题、键盘焦点、稳定视口 |
| 单实例插件 | 窗口关闭/恢复链路不受 `tauri-plugin-single-instance` 影响 |

### 4.3 完整性与截图审阅（待回填）

顶层 `SHA256SUMS` 与 WebView 目录 `SHA256SUMS` 均通过 `sha256sum -c`；归档为固定 owner 的标准化 tar。原生窗口截图由 Windows 窗口级捕获按窗口句柄截取（待建设），窗口内容完整、布局对齐、无桌面身份信息；WebView 截图覆盖对话/文件/日志空态、错误条、诊断链路、键盘焦点和三个稳定视口，未见持续重叠或横向溢出。companion 在侧栏/设置切换后等待连续稳定帧、在主题切换后校验计算样式再截图。

### 4.4 构建溯源、隐私与归档（待回填）

| 项目 | 已核验结果 |
| --- | --- |
| provenance | `SHELL-P-BUILD-PROVENANCE`：`versionMatch` / `gitShaMatch` / `repositoryClean` 需全为 true |
| 隐私 | `SHELL-P-ARTIFACT-PRIVACY`：`privacy-audit.json` 扫描文本文件、0 暴露；窗口级截图、隔离 Profile、相对路径、递归脱敏、固定 owner tar |
| 归档 | 唯一有效证据为最新 `run-*.tar.gz`；两级 `SHA256SUMS` |
| 提交与重建 | 按最终 HEAD 增量重建安装包并在该 HEAD 下重跑一次验收，以重跑归档为唯一证据批次 |

### 4.5 子门槛结论

Windows 平台尚未执行，`W0-SHELL-P` Windows 子门槛结论为 **待执行**，不构成通过。完成条件：原生/实机窗口证据、批次文件完整性、应用构建可追溯性、系统环境元数据（含显示缩放/DPI）、上传材料脱敏、WebView/人工 UI 链路全部满足后，方可与 macOS 结论合并为完整跨平台结论。标题栏菜单专项 `W0-SHELL-MENU-P/F` 与 `D-NAV` 业务链路不属于本报告结论。

## 5. 复核材料清单（本批次待执行）

### 5.1 环境

- 执行命令：`npm run test:ui-shell-acceptance -- --platform windows --output <ARCHIVE_ROOT>`（推荐）；原生窗口脚本待落地。
- 记录 Windows 版本/架构、显示缩放与 DPI、窗口尺寸、Vinkey 版本与嵌入 Git SHA、仓库 HEAD 与工作树状态。

### 5.2 最低截图/录屏集合（状态）

1. Windows 自绘标题栏与窗口按钮：待执行。
2. 侧栏展开/折叠、设置打开/关闭后的稳定宽度和状态：待执行。
3. 对话/文件/日志切换、无工作区空态和错误条：待执行。
4. 浅色/深色主题、键盘焦点、设置返回和错误条关闭：待执行。
5. `1440x900`、`1280x800`、`1024x680` 尺寸集合及显示缩放/DPI：待执行。
6. 窗口关闭/重新打开（如适用）状态：待执行。
7. 应用诊断日志打开、刷新、复制、关闭和焦点返回：待执行。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 6. 判定规则与当前综合结论

- **通过**：目标平台窗口/容器/响应式/键盘材料齐全，所有适用 `SHELL-P-*` 关键断言通过；菜单专项不计入本报告。
- **条件通过**：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层完整发布通过。
- **不通过**：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- **阻断**：桌面运行环境或构建依赖使结论不可得；记录复现信息。

标题栏菜单不是本报告的通过条件；若菜单设计或菜单实现存在缺口，应在 `W0-SHELL-MENU-P/F` 报告中记录，不得反向改写 `W0-SHELL-P` 的窗口/容器结论。

当前综合结论：**Windows 待执行**（`W0-SHELL-P` Windows 子门槛未开始）。macOS 平台结论见 [UI_ACCEPTANCE_MACOS_SHELL.md](../macos/UI_ACCEPTANCE_MACOS_SHELL.md)（macOS 完整通过）。本报告不覆盖 `D-NAV` 真实业务链路或标题栏菜单专项。

## 7. 测试人员回填区

- 自动化层：`<PASS/FAIL/BLOCKED/待回填 + 批次结果>`
- Windows 桌面层：`<PASS/FAIL/BLOCKED/待回填；自绘窗口按钮、三档实际窗口尺寸、最大化/还原、最小化/恢复、关闭、显示缩放/DPI>`
- macOS 桌面层：`见 UI_ACCEPTANCE_MACOS_SHELL.md，不在本报告回填`
- 人工 UI 层：`<PASS/FAIL/BLOCKED/待回填；内容页、错误条、焦点、稳定视口、侧栏/设置恢复、浅色/深色主题、诊断日志完整链路>`
- 构建溯源：`<PASS/FAIL/BLOCKED/待回填；应用与仓库版本、Git SHA、构建工作树状态>`
- 结果 JSON/日志/截图 SHA-256：`<PASS/FAIL/BLOCKED/待回填（两级 SHA256SUMS）>`
- 材料脱敏：`<PASS/FAIL/BLOCKED/待回填（隔离 Profile、相对路径、privacy-audit、固定 owner tar）>`
- 导航域材料：`另行提交，使用 UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md`
- 问题列表：`<ISSUES>`
- 综合结论：`<通过/条件通过/不通过/阻断/待执行>`
- 下一次复审：`Windows 原生脚本落地并首次执行后`
