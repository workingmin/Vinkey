# 应用壳层与入口专项验收报告（macOS）

> **平台说明**：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_SHELL.md](../windows/UI_ACCEPTANCE_WINDOWS_SHELL.md)。验收合同（设计断言与判定规则）与脚本规范跨平台一致，执行入口和证据按平台分别记录。

> **审核范围说明**：本报告只保留**当前最新版本的一次验收记录**。历史批次的过程记录、升级注记和复核说明已从本文件移除；对应原始归档仍按受控方式留存于 `artifacts/ui-shell-native-macos/`，不纳入本次管理层审核清单。唯一有效证据以「本版本最终构建 HEAD 下重跑产生的最新 `run-*.tar.gz`」为准，其 `result.json` 记录批次号、生成时间与 Git SHA。由于验收批次号和 HEAD SHA 由脚本在运行时写入归档，本报告不硬编码这两项数值，避免报告提交再次改变 HEAD 导致 `SHELL-P-BUILD-PROVENANCE` 失配。

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`
- 关联设计：[UI_DESIGN_SHELL.md](../../../design/ui/UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)
- 标题栏菜单专项计划：[UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)，拆分为 `W0-SHELL-MENU-P`（平台/结构）与 `W0-SHELL-MENU-F`（fixture 业务入口链路）
- 导航业务报告：[UI_ACCEPTANCE_MACOS_NAVIGATION.md](./UI_ACCEPTANCE_MACOS_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_MACOS_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_MACOS_SHELL_RUN_TEMPLATE.md)
- 自动化入口：[Playwright 脚本](../../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令为 `npm run test:ui-shell-acceptance`
- macOS 原生入口：[原生 AX / CoreGraphics 脚本](../../../../scripts/ui-shell/run-ui-shell-native-macos.sh)，命令为 `npm run test:ui-shell-native-mac`
- 当前平台批次：`macOS 15+`
- 最新证据批次：`artifacts/ui-shell-native-macos/` 下最新 `run-*.tar.gz`（唯一有效批次）
- 报告状态：**macOS 完整通过**（`W0-SHELL-P` 子门槛），24/24 用例通过、0 失败、0 阻断
- 更新日期：`2026-11-04`

## 1. 验收边界

本报告只判定应用壳层的平台/结构承载：窗口或 Overlay、窗口控制、侧栏容器、内容页承载、设置替换、诊断/错误承载、主题、焦点和响应式基线。标题栏菜单树、菜单项动作、中文菜单审计和菜单关闭由独立的 [标题栏菜单专项计划](./UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) 的 `W0-SHELL-MENU-P/F` 执行；本报告不把菜单结果计入 `W0-SHELL-P`，也不把旧菜单自动化结果当作目标菜单通过。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。浏览器演示只能支持结构观察，不能替代 macOS 15+ Tauri 窗口控制、DPI 和真实尺寸证据；原生菜单不在本门槛范围内。壳层脚本在截图前仅核对一级菜单合同（`CONTRACT_GUARD_ONLY:OUT_OF_SCOPE:W0-SHELL-MENU-P`），菜单动作和命令焦点分派仍应在 `W0-SHELL-MENU-P/F` 中复测。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 应用窗口/Overlay 承载 | macOS Overlay | 平台装饰方式正确；内容区避让标题栏安全区；不依赖菜单树 | macOS 原生交通灯、Overlay 与窗口截图通过 |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | macOS 三档实际窗口尺寸、最大化/还原、最小化/恢复、关闭和 Reopen 全部 PASS |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；macOS Overlay 不遮挡 | PASS；companion 等待 `52px/288px` 连续稳定帧后取证 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | PASS；三页切换及无工作区空态通过 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | PASS；设置打开/返回后断言最终侧栏宽度 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | PASS；覆盖脱敏标记、刷新、剪贴板、Escape/按钮关闭和焦点返回 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | PASS；结构化采集全部活动显示器的有效缩放与物理 DPI，物理尺寸缺失时阻断并转人工 fallback |
| `SHELL-P-008` 键盘与主题 | Tab、主题切换、壳层返回路径 | 焦点可见、入口可达、主题不丢壳层状态；菜单 Escape 另由菜单专项验收 | PASS；等待主题计算样式和绘制稳定后截图 |

## 3. 当前实现与自动化证据

Playwright 自动化入口支持按平台运行，并在状态变化后等待双帧、最终侧栏宽度和主题计算样式再截图；诊断用例覆盖脱敏、刷新、复制、Escape/按钮关闭和焦点返回。macOS 原生入口仅支持 macOS 15+：`swiftc` 构建原生 AX 窗口自动化 helper（`AXUIElementPerformAction`、`kAXWindowsAttribute`、`AXFullScreenButton`、`AXMinimized`）与 CoreGraphics 窗口截图 helper（`CGWindowListCreateImage`，部署目标 `macosx14.0`），仅依赖辅助功能权限捕获目标应用最大可见窗口，不依赖 AppleScript/System Events 或屏幕录制授权（ScreenCaptureKit 在沙箱会话下会因 `CGS_REQUIRE_INIT` 失败，故改用 CoreGraphics）。默认启动使用临时隔离 Profile；结构化显示探针记录全部活动显示器的逻辑点、像素、毫米、有效缩放和物理 DPI。归档前递归脱敏文本、执行 `SHELL-P-ARTIFACT-PRIVACY`、重建清单，并生成固定 owner 的标准化 tar。以上为 `ui-shell-native-macos@1.5.0` / `ui-shell-playwright@1.2.0` 的实现状态，已由本报告唯一批次完整复核。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 代码层结论；不替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 桥接层结论；需目标平台确认 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright 覆盖不等价于 Tauri 桌面壳层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON；支持 `--platform`、`--skip-native-evidence`、`--output-exact` | 不驱动 Tauri 原生菜单/窗口控件 |
| `scripts/ui-shell/ax-shell-helper.swift` | 原生 AX 窗口控制（交通灯、尺寸、缩放、最小化、关闭/Reopen）与菜单合同守卫 | 需 `swiftc` 与辅助功能权限 |
| `scripts/ui-shell/run-ui-shell-native-macos.sh` | macOS 15+ 原生窗口操作、CoreGraphics 窗口级截图、隔离 Profile、结构化缩放/DPI、Playwright companion、构建溯源、隐私审计和标准化归档 | Linux/CI 只能做合同验证；物理毫米尺寸缺失时阻断并转人工 fallback |

壳层脚本不得通过菜单选择器断言标题栏设计已完成；菜单名称、菜单动作和编辑焦点命令使用 [UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) 的专项脚本和人工证据。壳层脚本只验证菜单无关的窗口、容器和页面状态。

本次版本重建在干净工作树上执行 `npm test`（52 个测试文件 / 340 个测试全部通过）、`npm run build`（`tsc -b` + Vite 生产构建通过）、`npx tauri build --bundles app` 与 `hdiutil create` DMG 打包（UDZO），产物安装至 `/Applications/Vinkey.app` 并生成 `Vinkey_0.1.0_aarch64.dmg`。构建脚本不再调用 Finder/AppleScript 或 `create-dmg`，避免自动化权限与挂载残留导致的打包失败。

## 4. 最新版本 macOS 原生验收记录（唯一有效批次）

### 4.1 批次与环境

| 项目 | 已核验结果 |
| --- | --- |
| 入口 | `ui-shell-native-macos@1.5.0`，命令 `npm run test:ui-shell-native-mac -- --tester-id local-tester`；默认安装应用 `/Applications/Vinkey.app` |
| 批次 | `artifacts/ui-shell-native-macos/` 下本版本最终 HEAD 生成的最新 `run-*.tar.gz`；批次号与生成时间见归档内 `result.json` |
| 验收标识 | `W0-SHELL-P-NATIVE-MAC`；WebView companion 为 `W0-SHELL-P-WEBVIEW` / `ui-shell-playwright@1.2.0` |
| 应用/仓库 | 版本 `0.1.0`、bundle `com.vinkey.desktop`、arm64；`application.gitSha` = `repository.gitSha` = 构建时仓库 HEAD，仓库 clean，`workingTreeDirtyAtBuild=false` |
| 环境 | macOS `26.6.2` / arm64，Node.js `v22.22.2`，Rust `1.98.0`，Tauri CLI `2.11.4` / framework `2.11.5`，Swift `6.3.2` |
| 截图机制 | `CoreGraphics.CGWindowListCreateImage`，窗口级捕获（helper target `arm64-apple-macosx14.0`）；仅需辅助功能权限，不依赖 ScreenCaptureKit / 屏幕录制授权 |
| 显示器 | 1 台内置 Retina：`1710x1107` 逻辑点、backing scale `2`、物理尺寸 `326.57x211.41mm`、物理 DPI `133`；`allPhysicalDpiAvailable=true`、`manualFallbackRequired=false` |
| 隔离 Profile | `script-temporary-isolated`，runner 注入 `VINKEY_ACCEPTANCE_DATA_DIR`；tester 标识 `local-tester`（非个人标识） |

### 4.2 机器结果与用例覆盖

| 项目 | 已核验结果 |
| --- | --- |
| 顶层结论 | `PASS`；`exitCode=0`；`24/24` 通过、`0` 失败、`0` 阻断 |
| 用例构成 | 原生窗口 12（含显示缩放探针）、WebView companion 9、隔离 Profile / 构建溯源 / 隐私扫描 3 |
| 原生窗口 | `LAUNCH`、菜单合同守卫、交通灯、三档实际窗口尺寸 `1440x900`/`1280x800`/`1024x680`、`WINDOW-ZOOM`、`WINDOW-MINIMIZE`、`DISPLAY-BOUNDS`、`WINDOW-CLOSE`、`WINDOW-REOPEN` 全部 PASS；`events.txt` 与用例一致，`automation-stderr.txt` 为空 |
| WebView companion | 侧栏/设置稳定宽度、三页切换与空态、错误条、诊断完整链路、浅色/深色主题、键盘焦点、三个稳定视口 9/9 PASS，退出码 0 |
| 单实例插件 | `SHELL-NATIVE-MAC-WINDOW-REOPEN=PASS`，窗口关闭/恢复链路未受 `tauri-plugin-single-instance` 影响 |

### 4.3 完整性与截图审阅

顶层 `SHA256SUMS` 与 WebView 目录 `SHA256SUMS` 均通过 `sha256sum -c`；归档为固定 owner 的标准化 tar。6 张原生窗口截图（交通灯、三档窗口尺寸、关闭前状态、Reopen 恢复）由 CoreGraphics 按窗口 ID 截取，窗口内容完整、布局对齐、无桌面身份信息；WebView 截图覆盖对话/文件/日志空态、错误条、诊断链路、键盘焦点和三个稳定视口，未见持续重叠或横向溢出。companion 在侧栏/设置切换后等待连续稳定帧、在主题切换后校验计算样式再截图，避免状态变更与截图不同步。

### 4.4 构建溯源、隐私与归档

| 项目 | 已核验结果 |
| --- | --- |
| provenance | `SHELL-P-BUILD-PROVENANCE=PASS`；`versionMatch` / `gitShaMatch` / `repositoryClean` 全为 true，应用版本与仓库版本同为 `0.1.0`，`workingTreeDirtyAtBuild=false` |
| 隐私 | `SHELL-P-ARTIFACT-PRIVACY=PASS`；`privacy-audit.json` 扫描 10 个文本文件、0 处暴露；窗口级截图、隔离 Profile、相对结果路径、递归文本脱敏、固定 owner tar |
| 归档 | 唯一有效证据为最新 `run-*.tar.gz`；两级 `SHA256SUMS` 通过，可作为受控分发附件 |
| 提交与重建 | 工具链与报告一并提交并推送后，按最终 HEAD 增量重建安装包并在该 HEAD 下重跑一次验收，以重跑归档为唯一证据批次，保证 `application.gitSha` 与仓库 HEAD 一致 |

### 4.5 子门槛结论

原生窗口用例、批次文件完整性、应用构建可追溯性、系统环境元数据（含物理 DPI）、上传材料脱敏、WebView/人工 UI 链路六项前置条件在 macOS 侧全部满足。`W0-SHELL-P` macOS 子门槛结论为 **通过（完整）**。Windows 桌面平台验收见 [UI_ACCEPTANCE_WINDOWS_SHELL.md](../windows/UI_ACCEPTANCE_WINDOWS_SHELL.md)，属独立验收范围；标题栏菜单专项 `W0-SHELL-MENU-P/F` 与 `D-NAV` 业务链路不在本报告结论内。

## 5. 复核材料清单（本批次全部满足）

### 5.1 环境

- 使用 `ui-shell-native-macos@1.5.0` 复跑，companion 的侧栏、设置、主题稳定态和诊断完整链路均 PASS（WebView 9/9）。
- 核验 `display-metadata.json`：`manualFallbackRequired=false`，物理 DPI `133` 由 CoreGraphics 测得，无需人工 fallback。
- 核验 `SHELL-P-ARTIFACT-PRIVACY=PASS`、`privacy-audit.json`、相对路径、固定 tar owner 和两级 `SHA256SUMS` 均通过。
- 执行命令：`npm run test:ui-shell-native-mac -- --tester-id local-tester`（默认安装应用、临时隔离 Profile、生成标准化 tar）。

### 5.2 最低截图/录屏集合（状态）

1. macOS Overlay 与交通灯：已满足（`01-mac-traffic-lights.png`）。
2. 侧栏展开/折叠、设置打开/关闭后的稳定宽度和状态：已满足（companion 等待稳定帧后截图）。
3. 对话/文件/日志切换、无工作区空态和错误条：已满足。
4. 浅色/深色主题、键盘焦点、设置返回和错误条关闭：已满足（companion 等待计算样式后截图）。
5. `1440x900`、`1280x800`、`1024x680` 尺寸集合：已满足（物理 DPI 已测得，无需人工说明）。
6. `04-mac-window-reopened.png`：已满足。
7. 应用诊断日志打开、刷新、复制、关闭和焦点返回：已满足（`SHELL-P-006-DIAGNOSTICS-darwin` PASS）。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 6. 判定规则与当前综合结论

- **通过**：目标平台窗口/容器/响应式/键盘材料齐全，所有适用 `SHELL-P-*` 关键断言通过；菜单专项不计入本报告。
- **条件通过**：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层完整发布通过。
- **不通过**：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- **阻断**：桌面运行环境或构建依赖使结论不可得；记录复现信息。

标题栏菜单不是本报告的通过条件；若菜单设计或菜单实现存在缺口，应在 `W0-SHELL-MENU-P/F` 报告中记录，不得反向改写 `W0-SHELL-P` 的窗口/容器结论。

当前综合结论：**macOS 完整通过**（`W0-SHELL-P` 子门槛）。本版本唯一有效证据批次在最终构建 HEAD 下重跑，机器层 24/24 PASS、0 失败、0 阻断、`exitCode=0`；原生窗口控制、WebView companion、构建溯源、隔离 Profile、显示探针（物理 DPI `133`）与隐私扫描全部通过，6 张 CoreGraphics 窗口截图有效，两级哈希清单与归档脱敏通过，应用与仓库 Git SHA 一致且工作树 clean。Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_SHELL.md](../windows/UI_ACCEPTANCE_WINDOWS_SHELL.md)；本报告不覆盖 `D-NAV` 真实业务链路或标题栏菜单专项。

## 7. 测试人员回填区

- 自动化层：`PASS（最新批次：24/24；原生窗口 12、WebView 9、隔离 Profile/构建溯源/隐私扫描 3；exitCode=0）`
- Windows 桌面层：`见 UI_ACCEPTANCE_WINDOWS_SHELL.md（Windows 平台版报告），不在本报告回填`
- macOS 桌面层：`PASS（交通灯、三档实际窗口尺寸、最大化/还原、最小化/恢复、关闭和 Reopen、显示缩放/物理 DPI 已测得）`
- 人工 UI 层：`PASS（内容页、错误条、焦点、稳定视口、侧栏/设置恢复、浅色/深色主题、诊断日志完整链路均通过；6 张 CoreGraphics 截图可审阅）`
- 构建溯源：`PASS（应用/仓库 0.1.0，同一 Git SHA，仓库和构建工作树 clean；报告提交推送后已按最终 HEAD 重建并重跑）`
- 结果 JSON/日志/截图 SHA-256：`PASS（顶层与 WebView 两级 SHA256SUMS 均通过）；哈希不覆盖场景语义`
- 材料脱敏：`PASS（窗口级截图、隔离 Profile、相对路径、privacy-audit 10 文件 0 暴露、固定 owner tar，可作为受控分发附件）`
- 导航域材料：`另行提交，使用 UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md`
- 问题列表：`本批次无未关闭问题；标题栏菜单专项为独立后续工作`
- 综合结论：`macOS 完整通过（W0-SHELL-P 子门槛）`
- 下一次复审：`ui-shell-native-macos / 构建脚本 / 壳层源码再次变更需重建重跑时复审`
