# 应用壳层与入口专项验收报告（Windows）

> 平台说明：本文档是 Windows 平台版；macOS 平台验收见 [UI_ACCEPTANCE_MACOS_SHELL.md](../macos/UI_ACCEPTANCE_MACOS_SHELL.md)。验收合同（设计断言与判定规则）与脚本规范跨平台一致，执行入口和证据按平台分别记录。

> 审核范围说明：本报告只保留当前最新版本的一次验收记录。历史批次的过程记录、升级注记和复核说明已从本文件移除；对应原始归档仍按受控方式留存于 `artifacts/ui-shell-acceptance/` 与 `artifacts/ui-shell-native-windows/`，不纳入管理层审核清单。唯一有效证据以「本版本最终构建 HEAD 下重跑产生的最新批次」为准，其 `result.json` 记录批次号、生成时间与 Git SHA。报告不硬编码批次号与 HEAD SHA，避免报告提交再次改变 HEAD 导致构建溯源失配。

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`（结构子层由 Playwright 覆盖）、`W0-SHELL-P-NATIVE-WINDOWS`（原生窗口子层）
- 关联设计：[UI_DESIGN_SHELL.md](../../../design/ui/UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)
- 标题栏菜单专项计划：[UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md)，拆分为 `W0-SHELL-MENU-P`（平台/结构）与 `W0-SHELL-MENU-F`（fixture 业务入口链路）
- 导航业务报告：[UI_ACCEPTANCE_WINDOWS_NAVIGATION.md](./UI_ACCEPTANCE_WINDOWS_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md)
- 自动化入口（结构层）：[Playwright 脚本](../../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令 `npm run test:ui-shell-acceptance -- --platform win32`；Windows 包装 [run-ui-shell-acceptance.ps1](../../../../scripts/ui-shell/run-ui-shell-acceptance.ps1)
- 自动化入口（原生层）：[Windows 原生验收主控](../../../../scripts/ui-shell/run-ui-shell-native-windows.ps1) + [Win32 helper](../../../../scripts/ui-shell/win32-native-helper.ps1)，命令 `npm run test:ui-shell-native-win`（`ui-shell-native-windows@1.0.0`）
- 当前平台批次：`Windows`（Playwright 结构层 + Windows 原生窗口控制/DPI 机器层均已执行）
- 最新证据批次：`artifacts/ui-shell-native-windows/run-*` 下最终 HEAD 重跑产生的最新批次（`result.json` + 原生窗口截图 + `display-metadata.json` + `SHA256SUMS` + `run-*.tar.gz`），内含 `webview/` Playwright companion 子批次
- 平台专项状态：`通过（功能域单平台范围）`（原生窗口控制、可靠物理 DPI、构建溯源、脱敏与结构层证据齐全，见 §4 与 §6）
- 更新日期：`2026-11-23`

## 1. 验收边界

本报告只判定应用壳层的平台/结构承载：窗口或 Overlay、窗口控制、侧栏容器、内容页承载、设置替换、诊断/错误承载、主题、焦点和响应式基线。标题栏菜单树、菜单项动作、中文菜单审计和菜单关闭由独立的 [标题栏菜单专项计划](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) 的 `W0-SHELL-MENU-P/F` 执行；本报告不把菜单结果计入 `W0-SHELL-P`，也不把旧菜单自动化结果当作目标菜单通过。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。结构层由 Playwright 在 WebView DOM 上取证；`W0-SHELL-P-NATIVE-WINDOWS` 由 Windows 原生脚本通过 Win32 API 驱动真实 Tauri 窗口，采集窗口控制与显示/DPI 机器证据。浏览器演示不能替代真实平台结论，二者在本批次的 `result.json` 中按 `source`（`native-win32` / `native-display-probe` / `playwright-webview`）分列，不混为一谈。壳层脚本在截图前仅核对一级菜单合同（`CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P`），菜单动作和命令焦点分派仍应在 `W0-SHELL-MENU-P/F` 中复测。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 应用窗口/Overlay 承载 | Windows 自绘标题栏与窗口按钮 | 平台装饰方式正确；内容区避让标题栏安全区；不依赖菜单树 | PASS；Playwright DOM 层 `SHELL-P-001-WIN-FRAME` + 原生窗口启动/标题/句柄观测（`SHELL-NATIVE-WIN-LAUNCH`） |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | PASS（原生 Win32 机器证据）：`SHELL-NATIVE-WIN-WINDOW-MINIMIZE/MAXIMIZE/CLOSE/REOPEN` 全部通过，`IsIconic`/`IsZoomed`/可见性/窗口矩形状态均按预期变化 |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；无平台遮挡 | PASS；companion 等待 `52px/288px` 连续稳定帧后取证 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | PASS；三页切换及无工作区空态通过 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | PASS；设置打开/返回后断言最终侧栏宽度 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | PASS；覆盖脱敏标记、刷新、剪贴板、Escape/按钮关闭和焦点返回 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | PASS；Playwright 三档视口 + 原生 `SHELL-NATIVE-WIN-WINDOW-SIZE-{1440x900,1280x800,1024x680}` 实际窗口尺寸读数 |
| `SHELL-P-008` 键盘与主题 | Tab、主题切换、壳层返回路径 | 焦点可见、入口可达、主题不丢壳层状态；菜单 Escape 另由菜单专项验收 | PASS；等待主题计算样式和绘制稳定后截图 |

## 3. 当前实现与自动化证据

结构层由 Playwright 自动化入口按平台运行（`--platform win32`），在状态变化后等待双帧、最终侧栏宽度和主题计算样式再截图；诊断用例覆盖脱敏、刷新、复制、Escape/按钮关闭和焦点返回。

原生层由 `win32-native-helper.ps1`（Win32 P/Invoke 函数库，纯 ASCII 以兼容 PS 5.1 GBK）与 `run-ui-shell-native-windows.ps1`（主控：隔离 Profile 启动、原生自动化、DPI 探针、companion、脱敏审计、SHA256SUMS、tar.gz 归档）实现。原生窗口控制直接调用 `ShowWindow`（`SW_MINIMIZE`/`SW_MAXIMIZE`/`SW_RESTORE`）与 `SendMessage(WM_CLOSE)`，并用 `IsIconic`/`IsZoomed`/`IsWindowVisible`/`GetWindowRect` 读取状态作为机器判定源；关闭后经单实例插件重新拉起验证 `SHELL-NATIVE-WIN-WINDOW-REOPEN`。原生窗口截图仅为辅助视觉证据，不作为机器通过/失败判定源。

**可靠物理 DPI 探针**：在任何 GDI 调用前声明 `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`，再用 `GetDeviceCaps(DESKTOPHORZRES/DESKTOPVERTRES)`（物理像素）与 `HORZSIZE/VERTSIZE`（物理毫米）计算物理 DPI，缩放比由 `GetDpiForMonitor(MDT_Effective_DPI)` 给出。这修正了 DPI 未感知进程下 `HORZRES` 被虚拟化的陷阱：本环境未声明时读到 `HORZRES=1536×864`、缩放误报 `100%`；声明后读到真实 `1920×1080`、缩放 `125%`、物理 DPI `141.77×141.4`。探针输出 `display-metadata.json`，`SHELL-NATIVE-WIN-DISPLAY-SCALE` 用例据此判定。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 代码层结论；不替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 桥接层结论；原生层已实机覆盖窗口控制 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright companion 覆盖 DOM 层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON | 结构子层证据 |
| `scripts/ui-shell/run-ui-shell-acceptance.ps1` | Windows PowerShell 入口（`npm run test:ui-shell-acceptance:win`） | 已修复 UTF-8 BOM 解析问题，冒烟可执行 |
| `scripts/ui-shell/win32-native-helper.ps1` | Win32 窗口控制 + DPI 感知探针函数库 | 原生子层机器证据来源 |
| `scripts/ui-shell/run-ui-shell-native-windows.ps1` | Windows 原生验收主控（`npm run test:ui-shell-native-win`） | 产出 `W0-SHELL-P-NATIVE-WINDOWS` result.json |
| `tests/ui-shell/ui-shell-native-windows-cli.test.ts` | 原生脚本 CLI 合同测试（7 项） | 参数解析、DPI 探针/窗口控制源码合同、输出结构 |
| `scripts/build/build-windows.ps1` | Windows 安装包构建 | 已在最终 HEAD 重建，产出 NSIS 安装包 |

壳层脚本不得通过菜单选择器断言标题栏设计已完成；菜单名称、菜单动作和编辑焦点命令使用 [UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) 的专项脚本和人工证据。壳层脚本只验证菜单无关的窗口、容器和页面状态。

## 4. 最终版本 Windows 原生验收记录（唯一有效批次）

> 本批次在最终构建 HEAD 下重建安装包、重装后重跑，机器层与原生层全部通过。本节记录原生机器证据与结构层结果，不把浏览器证据标为原生窗口通过，也不把原生窗口结论扩大到菜单或业务域。

### 4.1 批次与环境

| 项目 | 已核验结果 |
| --- | --- |
| 入口 | `ui-shell-native-windows@1.0.0`，命令 `npm run test:ui-shell-native-win -- -Output artifacts/ui-shell-native-windows`；内含 companion `ui-shell-playwright@1.2.0` |
| 批次 | `artifacts/ui-shell-native-windows/run-*` 下最终 HEAD 重跑产生的最新 `run-*` 批次；批次号与生成时间见归档内 `result.json` |
| 验收标识 | `W0-SHELL-P-NATIVE-WINDOWS`（原生层）+ companion `W0-SHELL-P`（结构层，`simulatedPlatforms=["win32"]`） |
| 应用/仓库 | 版本 `0.1.0`；安装包 `Vinkey_0.1.0_x64-setup.exe`；应用启动日志 `app.start.commitSha` 与仓库 HEAD 一致，`gitShaMatch=true`、`repositoryClean=true`、`provenance.status=PASS`（构建前已消除 `Cargo.toml` 的 autocrlf stat 假象，产品源码工作树干净） |
| 环境 | Windows 10 专业版 / build `19041` / `x64`；Node.js `v22.22.2`；Rust `1.100.0`；Chromium（companion）；GPU Intel Iris Xe Graphics |
| DPI 探针 | `PER_MONITOR_AWARE_V2` 已声明；`GetDpiForMonitor` 缩放 `125%`（系统 DPI 120）；`DESKTOPHORZRES/HORZSIZE` 物理 DPI `141.77×141.4`；`display-metadata.json` 记录像素 `1920×1080`、物理尺寸 `344×194 mm`、`manualFallbackRequired=false` |
| 窗口控制机制 | Win32 `ShowWindow`/`SendMessage(WM_CLOSE)`；状态由 `IsIconic`/`IsZoomed`/可见性/矩形读取，截图（BitBlt 窗口范围）仅辅助 |
| 隔离 Profile | 主控启动应用注入 `VINKEY_ACCEPTANCE_DATA_DIR`，runtime 日志落在隔离目录；`SHELL-P-ISOLATED-PROFILE=PASS` |

### 4.2 机器结果与用例覆盖

| 项目 | 已核验结果 |
| --- | --- |
| 顶层结论 | `PASS`；`exitCode=0`；`20/20` 通过、`0` 失败、`0` 阻断 |
| 原生窗口用例 | `SHELL-NATIVE-WIN-WINDOW-MINIMIZE/MAXIMIZE/CLOSE/REOPEN` 全部 PASS；`SHELL-NATIVE-WIN-WINDOW-SIZE-{1440x900,1280x800,1024x680}` 三档实际窗口尺寸 PASS；`SHELL-NATIVE-WIN-LAUNCH` PASS |
| DPI 用例 | `SHELL-NATIVE-WIN-DISPLAY-SCALE=PASS`（物理 DPI 与缩放均来自 DPI 感知探针，不再依赖 WMI 估算或人工 fallback） |
| 溯源/隔离/隐私用例 | `SHELL-P-BUILD-PROVENANCE=PASS`、`SHELL-P-ISOLATED-PROFILE=PASS`、`SHELL-P-ARTIFACT-PRIVACY=PASS` |
| Playwright companion | `webview/result.json` 结构层 9/9 PASS（`SHELL-P-001-WIN-FRAME`、`SHELL-P-003-SETTINGS`、`SHELL-P-004-CONTENT`、`SHELL-P-006-ERROR/DIAGNOSTICS`、`SHELL-P-008-THEME-FOCUS`、`SHELL-P-007` 三档视口） |
| 平台证据标记 | `platformEvidence.windowControls=COVERED_BY_WIN32`；`physicalDpi=MEASURED_WITH_DPI_AWARE_GDI_PROBE`；`titlebarMenus=CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P` |

### 4.3 完整性与截图审阅

批次 `SHA256SUMS` 覆盖 `result.json`、`events.txt`、`display-metadata.json`、`privacy-audit.json`、原生窗口截图、`webview/` 子批次与子清单，`sha256sum -c` 逐文件校验全部 `OK`。原生窗口截图包含主窗口与三档尺寸共 5 张，为 BitBlt 窗口范围捕获（辅助证据，不作机器判定源）；companion 另含 14 张 WebView DOM 层截图。清单以 UTF-8 无 BOM + LF 行尾写入，规避 PowerShell `Out-File` 在 Windows 生成 CRLF 导致路径携带 `\r` 的校验缺陷。批次生成标准化 `run-*.tar.gz`（隐私扫描 PASS 后产出），归档成员为同名运行目录。

### 4.4 构建溯源、隐私与归档

| 项目 | 已核验结果 |
| --- | --- |
| provenance | 应用 `app.start.commitSha` = 仓库 HEAD，`gitShaMatch=true`、`repositoryClean=true`、`provenance.status=PASS`；构建前消除 `Cargo.toml` autocrlf stat 假象（`git diff` 为空、非真实改动），安装包在干净产品源码 HEAD 下重建 |
| 隐私 | `privacy-audit.json` status=PASS，`findingCount=0`；文本脱敏覆盖用户目录、邮箱、序列号/UUID；诊断用例同时验证界面与剪贴板脱敏标记（`<app-data>`、`<redacted>`） |
| 归档 | `artifacts/ui-shell-native-windows/run-*` 最新批次（`result.json` + `display-metadata.json` + `SHA256SUMS` + 原生截图 + `webview/` + `run-*.tar.gz`）；`result.json.artifacts` 索引全部证据 |
| 提交与重建 | 新增原生脚本/测试/npm 入口与清单修复已本地提交；在最终 HEAD 重建 NSIS 安装包、卸载旧版并静默安装，应用启动日志确认嵌入 SHA 与仓库 HEAD 一致；本报告回填不改变产品源码 HEAD |

### 4.5 子门槛结论

原生层 `W0-SHELL-P-NATIVE-WINDOWS`：`PASS`（20/20，含窗口控制、可靠 DPI、溯源、隔离、隐私与 companion 结构层）。结构层 `W0-SHELL-P`：Playwright companion 9/9 PASS。两层合并构成本平台 `W0-SHELL-P` 的完整单平台证据。结论为 `通过（功能域单平台范围）`：窗口控制由原生 Win32 状态查询证明，物理 DPI 由 DPI 感知探针实测，构建溯源与脱敏齐全，结构与页面状态由 companion 覆盖。该结论只针对 Windows 平台、应用壳层功能域，不宣称整体发布通过或跨平台发布通过；标题栏菜单专项 `W0-SHELL-MENU-P/F` 与 `D-NAV` 业务链路不属于本报告结论。人工主观观感类条目（视觉质量、交互完成度）按总计划 §8 登记为 `DEFER-UI-*`，属后续版本验收，不作为本门槛阻断项。

## 5. 复核材料清单（本批次）

### 5.1 环境

- 执行命令：`npm run test:ui-shell-native-win -- -Output artifacts/ui-shell-native-windows`（20/20 PASS）；`npm run test:ui-shell-acceptance -- --platform win32`（companion 9/9）。
- 记录 Windows 版本/架构（`Windows 10 专业版 19041 x64`）、分辨率 `1920×1080`、缩放 `125%`、物理 DPI `141.77×141.4`、Vinkey 版本 `0.1.0` 与嵌入 Git SHA、仓库 HEAD。
- 可靠显示缩放/DPI 探针已落地（`display-metadata.json`）；实际窗口尺寸由原生 `GetWindowRect` 读取。

### 5.2 最低截图/录屏集合（状态）

1. Windows 自绘标题栏与窗口按钮：companion DOM 层已取；原生主窗口截图已取（`01-win-native-window.png`，辅助证据）。
2. 侧栏展开/折叠、设置打开/关闭后的稳定宽度和状态：已满足（companion 等待稳定帧后截图）。
3. 对话/文件/日志切换、无工作区空态和错误条：已满足。
4. 浅色/深色主题、键盘焦点、设置返回和错误条关闭：已满足。
5. `1440x900`、`1280x800`、`1024x680` 尺寸集合及显示缩放/DPI：三档视口（companion）+ 三档原生窗口尺寸 + 可靠 DPI 探针均已满足。
6. 窗口关闭/重新打开（单实例重开）状态：已满足（`SHELL-NATIVE-WIN-WINDOW-CLOSE/REOPEN`）。
7. 应用诊断日志打开、刷新、复制、关闭和焦点返回：已满足（`SHELL-P-006-DIAGNOSTICS-win32` PASS）。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 6. 判定规则与当前综合结论

- 通过：目标平台窗口/容器/响应式/键盘材料齐全，所有适用 `SHELL-P-*` 关键断言通过；菜单专项不计入本报告。
- 条件通过：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层整体发布通过。
- 不通过：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- 阻断：桌面运行环境或构建依赖使结论不可得；记录复现信息。

标题栏菜单不是本报告的通过条件；若菜单设计或菜单实现存在缺口，应在 `W0-SHELL-MENU-P/F` 报告中记录，不得反向改写 `W0-SHELL-P` 的窗口/容器结论。

当前平台专项状态：`通过（功能域单平台范围）`。机器层在最终构建 HEAD 下重建安装包、重装后重跑：原生层 `W0-SHELL-P-NATIVE-WINDOWS` 20/20 PASS（`exitCode=0`），companion 结构层 9/9 PASS；应用 `app.start.commitSha` 与仓库 HEAD 一致、`provenance.status=PASS`、`repositoryClean=true`；可靠物理 DPI 探针实测缩放 `125%`、物理 DPI `141.77×141.4`；窗口控制（最小化/最大化/还原/关闭/单实例重开）由 Win32 状态查询证明；`SHA256SUMS` 逐文件校验通过、隐私审计 PASS。本次结论为 Windows 单平台、单功能域结论，不宣称整体发布通过或跨平台发布通过。macOS 平台结论见 [UI_ACCEPTANCE_MACOS_SHELL.md](../macos/UI_ACCEPTANCE_MACOS_SHELL.md)（`通过（功能域单平台范围）`）。本报告不覆盖 `D-NAV` 真实业务链路或标题栏菜单专项。

## 7. 测试人员回填区

- 自动化层：`PASS（原生层 20/20、0 失败、0 阻断、exitCode=0；companion 结构层 9/9）`
- Windows 桌面层：`PASS（最小化/最大化/还原/关闭/单实例重开由 Win32 状态查询证明；三档实际窗口尺寸与 DPI 感知探针数据齐全）`
- 人工 UI 层：`PASS（功能域单平台范围内的结构/焦点/主题/诊断链路由 companion 覆盖；主观观感类按 DEFER-UI-* 后续版本验收）`
- 构建溯源：`PASS（app.start.commitSha 与仓库 HEAD 一致；gitShaMatch=true、repositoryClean=true、provenance=PASS；Cargo.toml autocrlf stat 假象已在构建前消除）`
- 结果 JSON/日志/截图 SHA-256：`PASS（result.json + 原生截图 + display-metadata.json + webview 子批次，SHA256SUMS 逐文件校验通过）；哈希不覆盖场景语义`
- 材料脱敏：`PASS（privacy-audit.json findingCount=0；诊断界面与剪贴板脱敏断言通过；归档不含个人目录/邮箱/凭据）`
- 导航域材料：`另行提交，使用 UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md`
- 问题列表：`无阻断项。历史问题均已闭环：原生窗口自动化脚本已建设并覆盖窗口控制；物理 DPI 已由 DPI 感知探针实测；SHA256SUMS 行尾校验缺陷已修复；autocrlf 假象已在构建前消除。`
- 平台专项状态：`通过（Windows，W0-SHELL-P 功能域单平台范围）`
- 下一次复审：`壳层源码/构建脚本变更、或原生脚本合同调整时；菜单专项与导航业务按各自报告执行`
