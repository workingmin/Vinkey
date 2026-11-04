# 应用壳层与入口专项验收报告

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`
- 关联设计：[UI_DESIGN_SHELL.md](../../design/ui/UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../../design/ui/TITLE_BAR_DESIGN.md)
- 标题栏菜单专项计划：[UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md)，拆分为 `W0-SHELL-MENU-P`（平台/结构）与 `W0-SHELL-MENU-F`（fixture 业务入口链路）
- 导航业务报告：[UI_ACCEPTANCE_NAVIGATION.md](./UI_ACCEPTANCE_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)
- 自动化入口：[Playwright 脚本](../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令为 `npm run test:ui-shell-acceptance`
- macOS 原生入口：[Accessibility/System Events 脚本](../../../scripts/ui-shell/run-ui-shell-native-macos.sh)，命令为 `npm run test:ui-shell-native-mac`
- 当前平台批次：`macOS 15+`；Windows 材料待后续独立执行并回填，不影响本节形成 macOS 阶段结论
- 当前证据批次：`artifacts/ui-shell-native-macos/run-2026-11-03T134923Z.tar.gz`（合并远程 `e760392` 后重建复核，见 4.9）
- 报告状态：**macOS 完整通过**；历史 `073118Z` 批次的四项缺口（截图同步、诊断链路、显示缩放、归档脱敏）已在 `ui-shell-native-macos@1.5.0` / `ui-shell-playwright@1.2.0` 关闭，由 `2026-11-03T115835Z` 批次首次复核确认，并在工具链改动提交 + 安装包重建后由 `2026-11-03T133042Z` 批次（HEAD `898975f…`）复核，合并远程 `e760392` 后由 `2026-11-03T134923Z` 批次（HEAD `939afe7f…`，24/24 PASS、6 张 CoreGraphics 截图、provenance 仍 PASS）再次确认
- 更新日期：`2026-11-03`

## 1. 验收边界

本报告只判定应用壳层的平台/结构承载：窗口或 Overlay、窗口控制、侧栏容器、内容页承载、设置替换、诊断/错误承载、主题、焦点和响应式基线。标题栏菜单树、菜单项动作、中文菜单审计和菜单关闭由独立的 [标题栏菜单专项计划](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md) 的 `W0-SHELL-MENU-P/F` 执行；本报告不把菜单结果计入 `W0-SHELL-P`，也不把旧菜单自动化结果当作目标菜单通过。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。浏览器演示只能支持结构观察，不能替代 Windows/macOS 15+ Tauri 窗口控制、DPI 和真实尺寸证据；原生菜单不在本门槛范围内。

标题栏菜单的目标语义和缺口以 [TITLE_BAR_DESIGN.md](../../design/ui/TITLE_BAR_DESIGN.md) 为准，但不属于本报告的 `SHELL-P-*` 用例。此前批次中“文件 / 编辑 / 查看 / 窗口 / 帮助”的机器 PASS 只证明旧菜单行为；新版壳层脚本只在截图前核对目标一级菜单，菜单动作和命令焦点分派仍应在 `W0-SHELL-MENU-P/F` 中复测。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 应用窗口/Overlay 承载 | Windows 自绘 / macOS Overlay | 平台装饰方式正确；内容区避让标题栏安全区；不依赖菜单树 | macOS 原生交通灯与 Overlay 截图通过；Windows 待执行 |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | macOS 最大化/还原、最小化/恢复、关闭和 Reopen 机器用例通过；Windows 待执行 |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；macOS Overlay 不遮挡 | `1.2.0` 已等待两帧和 `52px/288px` 稳定宽度；待 macOS companion 复跑取证 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | darwin companion 的三页切换及无工作区空态通过 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | `1.2.0` 已在设置打开/返回后断言最终侧栏宽度；待 macOS companion 复跑取证 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | `1.2.0` 已覆盖脱敏标记、刷新、剪贴板、Escape/按钮关闭和焦点返回；待 macOS companion 复跑取证 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | `1.5.0` 已结构化采集全部活动显示器的有效缩放和物理 DPI，缺物理尺寸时阻断并要求人工 fallback；待实机验证 |
| `SHELL-P-008` 键盘与主题 | Tab、主题切换、壳层返回路径 | 焦点可见、入口可达、主题不丢壳层状态；菜单 Escape 另由菜单专项验收 | `1.2.0` 已等待主题计算样式和绘制稳定后截图；待 macOS companion 复跑取证 |

## 3. 当前代码与自动化证据

Playwright 自动化入口支持按平台运行，并在状态变化后等待双帧、最终侧栏宽度和主题计算样式再截图；诊断用例覆盖脱敏、刷新、复制、Escape/按钮关闭和焦点返回。macOS 原生入口仅支持 macOS 15+，由 `swiftc` 构建 CoreGraphics window-capture helper（`CGWindowListCreateImage`，部署目标 `macosx14.0`），仅依赖辅助功能权限捕获目标应用最大可见窗口，不依赖 ScreenCaptureKit 或屏幕录制授权（`ScreenCaptureKit` 在 WorkBuddy 沙箱会话下会因 `CGS_REQUIRE_INIT` 失败，故改用 CoreGraphics）。默认启动使用临时隔离 Profile；结构化显示探针记录全部活动显示器的逻辑点、像素、毫米、有效缩放和物理 DPI。归档前递归脱敏文本、执行 `SHELL-P-ARTIFACT-PRIVACY`、重建清单，并生成固定 owner 的标准化 tar。以上为 `1.5.0` 实现状态，已由 `2026-11-03T115835Z` 及提交后重建的 `2026-11-03T133042Z` 批次复核确认。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 可支持代码层结论；不能替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 可支持桥接层结论；需目标平台确认 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/components/SettingsPage.test.tsx` | 设置页状态和连接失败 | 归属 `D-MODEL`，不替代壳层返回验收 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright 覆盖仍不等价于 Tauri 桌面壳层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON；支持 `--platform`、`--skip-native-evidence`、`--output-exact` | 不驱动 Tauri 原生菜单/窗口控件 |
| `scripts/ui-shell/run-ui-shell-native-macos.sh` | macOS 15+ 原生窗口操作、CoreGraphics 窗口级截图（仅需辅助功能权限）、隔离 Profile、结构化缩放/DPI、Playwright companion、构建溯源、隐私审计和标准化归档 | 需要 `swiftc` 与辅助功能权限（截图基于 CoreGraphics，不再要求屏幕录制授权）；Linux/CI 只能做合同验证，仍需 macOS 15+ 复跑；物理毫米尺寸缺失时阻断并转人工 fallback |

壳层脚本不得通过菜单选择器断言标题栏设计已完成；菜单名称、菜单动作和编辑焦点命令使用 [UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md) 的专项脚本和人工证据。壳层脚本只验证菜单无关的窗口、容器和页面状态。

仓库基线此前已执行 `npm test`，通过 41 个测试文件/268 个测试；`npm run build` 通过。本次四项整改在 Linux 开发环境进一步通过 41 个测试文件/271 个测试、TypeScript 编译、生产构建、CLI/隐私流水线合同 9/9、darwin Playwright companion 9/9、清单校验 15/15，以及隔离编译的 `runtime_log.rs` 4/4 测试。完整 Tauri Rust 测试受当前环境 GLib `2.68.4`（依赖要求 `>=2.70`）和缺少 GDK 3 阻断；Swift 截图助手（现为 CoreGraphics）与原生归档已在 `2026-11-03T115835Z` 及 `2026-11-03T133042Z` macOS 批次复跑通过（见 4.7、4.8）。本历史批次记录的应用与仓库版本均为 `0.1.0`，Git SHA 均为 `1a754fc20d152d209c376f7093c574b27575891d`，仓库和构建工作树状态均为 clean，构建溯源用例通过。

## 4. macOS 原生执行结果（2026-09-28 历史批次 + 2026-11-03 复核）

### 4.1 批次与环境

| 项目 | 已核验结果 |
| --- | --- |
| 入口 | `ui-shell-native-macos@1.4.0`，默认安装应用；归档未单独保存顶层命令行，不能独立确认是否传入其他 flags |
| 批次 | `run-2026-09-28T073118Z`；结果生成于 `2026-09-28T07:31:34.934Z` |
| 验收标识 | `W0-SHELL-P-NATIVE-MAC`；WebView companion 为 `W0-SHELL-P-WEBVIEW` / `ui-shell-playwright@1.1.0` |
| 应用/仓库 | 版本 `0.1.0`，arm64；应用与仓库 Git SHA 同为 `1a754fc20d152d209c376f7093c574b27575891d`，仓库 clean，构建时工作树 clean |
| 环境 | macOS `26.6.2` / arm64，Node.js `v24.19.0`，Rust `1.98.0`，Tauri CLI `2.11.4` / framework `2.11.5`，Swift `6.3.2` |
| 截图机制 | `ScreenCaptureKit.SCScreenshotManager`；helper target `arm64-apple-macosx15.0`，无 fallback |
| 显示器 | Apple M4 内置 Liquid Retina，`2880x1864 Retina`，主显示器、未镜像；Accessibility 桌面范围和原生截图均为 `1710x1107` |
| 机器结果 | 顶层 `PASS`，20/20 通过、0 失败、0 阻断，`exitCode=0`：原生窗口 11、WebView 8、构建溯源 1 |
| 原始诊断 | `events.txt` 与 11 个原生窗口结果一致；`automation-stderr.txt` 为空；WebView 退出码为 0 |

### 4.2 完整性与截图审阅

顶层 `SHA256SUMS` 的 30/30 项、`webview/SHA256SUMS` 的 14/14 项均通过 `sha256sum -c`。归档自身 SHA-256 为 `945f54a1486eeb7e85aba9cbe6e7091ceff77f17d57af3e9da9c513f9e3e653e`。6 张原生截图均为全屏 `1710x1107`，文件名中的 `1440x900`、`1280x800`、`1024x680` 是 Accessibility 读取的窗口尺寸，不是 PNG 画布尺寸；13 张 WebView 截图尺寸与对应视口一致。

原生截图可确认交通灯、三个窗口尺寸、关闭前状态和系统 Reopen 后窗口恢复，未见旧批次的菜单残留。WebView 的对话/文件/日志空态、错误条、键盘焦点和三个稳定视口未见持续重叠或横向溢出。

完整性通过不等于场景截图有效。人工逐图审阅发现以下矛盾：

- `webview/02-darwin-sidebar-collapsed.png` 在 `.collapsed` DOM 状态成立后立即截图，画面仍保留展开宽度；`webview/02-darwin-settings-closed.png` 则在 DOM 已恢复展开态时仍处于约 52px 的起始过渡帧，展开内容在窄栏中逐字换行。源码对 grid 宽度设置了 `180ms` transition，而脚本未等待稳定宽度或 `transitionend`。
- `webview/04-darwin-light-theme.png` 的 DOM 断言为 light，但截图仍显示深色旧合成帧；稍后的 `04-darwin-keyboard-focus.png` 才显示浅色主题及可见焦点环。这进一步证明状态变更后的截图同步不足。
- 原始归档中的 JSON/stdout、tar owner 元数据及原生全屏截图含本机用户名、个人标识或绝对路径。报告正文已脱敏，但该 tar 包不能直接作为可分发验收附件。

因此，哈希证明文件未被替换，机器断言证明 DOM/Accessibility 状态链路成立，但上述三张截图不能作为目标稳定态的人工通过证据。

### 4.3 子门槛结论

`result.json`、`events.txt` 和 companion 结果一致记录机器 PASS；旧批次的菜单混测、缺少 companion 和缺少构建溯源问题已经关闭。原生 macOS 窗口子层可以判定为 **通过**，但 `W0-SHELL-P` 还要求容器稳定态、完整诊断链路和可审阅人工材料。

当前 macOS `W0-SHELL-P` 子门槛结论为 **条件通过/待证据复测**。该结论不等同于整个 `D-SHELL` 功能域、标题栏菜单专项或跨平台发布通过。

> **升级注记（2026-11-03）**：以上为 `073118Z` 历史批次的阶段结论。由 `2026-11-03T115835Z` 批次复核后，本节及 4.4 的“条件通过/待证据复测”“部分满足/未满足”均已升级为 **通过（完整）**（见 4.7）。此注记不改变历史审计记录本身。

### 4.4 完整功能域通过前置条件审计

| 前置条件 | 当前状态 | 升级为完整通过所需材料 |
| --- | --- | --- |
| macOS 原生窗口用例 | 已满足 | 交通灯、三档尺寸、最大化/还原、最小化/恢复、关闭及 Reopen 均 PASS；菜单只做合同 guard，不计菜单专项 |
| 批次文件完整性 | 已满足 | 顶层 30/30、WebView 14/14 哈希匹配；顶层与 companion `exitCode=0` |
| 应用构建可追溯性 | 已满足 | `SHELL-P-BUILD-PROVENANCE` PASS，应用/仓库版本与 Git SHA 一致且 clean |
| 系统环境元数据 | 部分满足 | OS、架构、工具链、显示器物理分辨率、桌面点范围和截图像素已记录；系统缩放模式/物理 DPI 尚无人工确认 |
| 上传材料脱敏 | 未满足 | 报告引用已脱敏；原始归档仍含本机身份和绝对路径，只能受控本地保存，分发前必须重制脱敏包 |
| 壳层 WebView/人工 UI 链路 | 部分满足 | 8/8 机器 PASS；侧栏/设置恢复和浅色主题截图未等待稳定帧，诊断日志完整链路未覆盖 |
| Windows 桌面平台 | 未满足 | 若当前版本声明支持 Windows，需 Windows 原生窗口/菜单/缩放材料后才能给出跨平台完整通过 |

> **升级注记（2026-11-03）**：本表为 `073118Z` 历史审计。macOS 侧除 Windows 平台外的六项前置条件已由 `2026-11-03T115835Z` 批次全部满足：系统环境元数据（物理 DPI=133 已测得）、上传材料脱敏（`SHELL-P-ARTIFACT-PRIVACY=PASS`）、壳层 WebView/人工 UI 链路（9/9 含诊断）均已补齐。Windows 桌面平台仍为未满足，属后续独立平台验收范围，不影响 macOS 阶段结论。详见 4.7。

### 4.5 问题与旧缺口关闭情况

| 编号 | 类型/等级 | 影响与证据 | 状态 |
| --- | --- | --- | --- |
| `SHELL-EVIDENCE-001` | `BUG / P1` | `1.2.0` 已加入双帧等待、禁用截图动画、侧栏最终宽度和主题计算样式断言 | `CLOSED`（`2026-11-03T115835Z` 批次复核通过） |
| `SHELL-COVERAGE-002` | `GAP / P1` | `1.2.0` 已覆盖诊断打开、脱敏、刷新、剪贴板、Escape/按钮关闭及焦点返回 | `CLOSED`（`2026-11-03T115835Z` 批次复核通过） |
| `SHELL-PRIVACY-001` | `SECURITY / P1` | `1.5.0` 改为窗口级截图、隔离 Profile、非个人 tester ID、递归文本脱敏、隐私扫描和固定 owner 归档 | `CLOSED`（`2026-11-03T115835Z` 批次 SHELL-P-ARTIFACT-PRIVACY=PASS） |
| `SHELL-DISPLAY-001` | `OBSERVATION / P2` | `1.5.0` 通过 NSScreen/CoreGraphics 记录 backing/effective scale、像素、毫米和物理 DPI；不可得时显式阻断 | `CLOSED`（`2026-11-03T115835Z` 批次 physical DPI=133 已测得） |
| `SHELL-SCRIPT-001` | `GAP` | 旧批次混合菜单与壳层断言；1.4.0 仅保留 menu contract guard | `FIXED` |
| `PROVENANCE-001` | `GAP` | 旧批次缺应用版本/Git SHA；本批次 `SHELL-P-BUILD-PROVENANCE` PASS | `FIXED` |
| `COVERAGE-001` | `GAP` | 旧批次缺同版本 WebView companion；本批次已合并 8 个用例 | `FIXED` |

### 4.6 四项整改实施状态

| 遗留项 | 已实施机制 | 关闭状态（2026-11-03T115835Z） |
| --- | --- | --- |
| 截图状态同步 | `ui-shell-playwright@1.2.0` 在侧栏/设置切换后等待 `52px/288px` 连续稳定帧，在主题切换后校验 `data-theme` 与计算样式，截图禁用动画；原生截图改用 CoreGraphics 规避 ScreenCaptureKit 沙箱限制 | **CLOSED**：companion 9/9 截图与目标 DOM/计算样式一致；6 张原生 CoreGraphics 截图有效 |
| 诊断链路覆盖 | 新增 `SHELL-P-006-DIAGNOSTICS-darwin`，验证显示/复制内容脱敏、刷新、剪贴板、Escape/关闭按钮及焦点返回 | **CLOSED**：用例 PASS，诊断截图可审阅 |
| 显示缩放确认 | `display-metadata.json` 枚举全部活动显示器并计算有效缩放/物理 DPI；毫米尺寸缺失时 `SHELL-NATIVE-MAC-DISPLAY-SCALE` 为 BLOCKED | **CLOSED**：物理 DPI=133 已测得，`manualFallbackRequired=false` |
| 归档脱敏 | 窗口级截图、临时隔离 Profile、相对结果路径、`privacy-audit.json`、`SHELL-P-ARTIFACT-PRIVACY`、固定 owner tar | **CLOSED**：隐私用例 PASS，10 文件扫描 0 暴露，归档可作受控分发附件 |

当前仓库已完成实现、CLI/编译测试和 Playwright 9/9 实跑；替代 `073118Z` 的 macOS 原生新批次 `run-2026-11-03T115835Z` 已产生（见 4.7），四项整改状态已复核关闭，`W0-SHELL-P` macOS 子门槛升级为完整通过。

### 4.7 2026-11-03 复核批次（完整通过）

#### 4.7.1 批次与环境

| 项目 | 已核验结果 |
| --- | --- |
| 入口 | `ui-shell-native-macos@1.5.0`（截图机制由 ScreenCaptureKit 改为 CoreGraphics）；默认安装应用 `/Applications/Vinkey.app` |
| 批次 | `run-2026-11-03T115835Z`；结果生成于 `2026-11-03T11:58:51Z` |
| 验收标识 | `W0-SHELL-P-NATIVE-MAC`；WebView companion 为 `W0-SHELL-P-WEBVIEW` / `ui-shell-playwright@1.2.0` |
| 应用/仓库 | 版本 `0.1.0`，arm64；应用与仓库 Git SHA 同为 `6a88f4e4cd858ace1ed32fe90b28c30e140d4c9f`，仓库 clean，构建时工作树 clean |
| 环境 | macOS `26.6.2` / arm64，Node.js `v22.22.2`，Rust `1.98.0`，Tauri CLI `2.11.4` / framework `2.11.5`，Swift `6.3.2` |
| 截图机制 | `CoreGraphics.CGWindowListCreateImage`（helper target `arm64-apple-macosx14.0`，因该 API 在 macOS 15 SDK 被标记 unavailable 而以 14.0 部署目标编译）；仅依赖辅助功能权限，不依赖 ScreenCaptureKit/屏幕录制授权 |
| 显示器 | Apple M4 内置 Liquid Retina，`1710x1107` 逻辑点、backing scale `2`、物理尺寸 `326.57x211.41mm`、物理 DPI `133`；`allPhysicalDpiAvailable=true`、`manualFallbackRequired=false` |
| 机器结果 | 顶层 `PASS`，24/24 通过、0 失败、0 阻断，`exitCode=0`：原生窗口 12、WebView companion 9、隔离 Profile/构建溯源/显示探针/隐私扫描 3 |
| 原始诊断 | `events.txt` 与 12 个原生窗口结果一致；`automation-stderr.txt` 为空；WebView 退出码为 0 |

#### 4.7.2 完整性与截图审阅

顶层 `SHA256SUMS`、WebView `SHA256SUMS` 均通过 `sha256sum -c`；归档为固定 owner 的标准化 tar（`run-2026-11-03T115835Z.tar.gz`）。6 张原生截图（交通灯、三档窗口尺寸 `1440x900`/`1280x800`/`1024x680`、关闭前、重开后）均由 CoreGraphics 按窗口 ID 截取，窗口内容完整、深色主题、布局对齐，无桌面身份信息。WebView 的对话/文件/日志空态、错误条、诊断完整链路、键盘焦点和三个稳定视口未见持续重叠或横向溢出。

对比 `073118Z` 的四项旧缺口，本批次的复核结果：

- **截图状态同步**：WebView companion `1.2.0` 在侧栏/设置切换后等待连续稳定帧与计算样式再截图，本次 9/9 通过且截图与目标 DOM/计算样式一致；原生截图改用 CoreGraphics，规避 ScreenCaptureKit 在沙箱会话下的 `CGS_REQUIRE_INIT`，6 张截图有效。
- **诊断链路覆盖**：`SHELL-P-006-DIAGNOSTICS-darwin` PASS，覆盖显示/复制内容脱敏、刷新、剪贴板、Escape/关闭按钮及焦点返回；诊断截图可审阅。
- **显示缩放确认**：`display-metadata.json` 测得物理 DPI `133`（`physicalDpiSource=CoreGraphics pixels and physical millimeters`），`manualFallbackRequired=false`，无需人工 fallback。
- **归档脱敏**：窗口级 CoreGraphics 截图、临时隔离 Profile、相对结果路径、`privacy-audit.json`、`SHELL-P-ARTIFACT-PRIVACY=PASS`（10 文件扫描 0 暴露）、固定 owner tar；归档不再含本机身份或绝对路径，可作为受控分发附件。

#### 4.7.3 子门槛结论升级

`W0-SHELL-P` 的前置条件（原生窗口用例、批次文件完整性、应用构建可追溯性、系统环境元数据、上传材料脱敏、WebView/人工 UI 链路）现已全部满足。`SHELL-EVIDENCE-001`、`SHELL-COVERAGE-002`、`SHELL-PRIVACY-001`、`SHELL-DISPLAY-001` 四项整改状态由 `FIXED_IN_SCRIPT / PENDING_MACOS_RERUN` 升级为 **CLOSED**。macOS `W0-SHELL-P` 子门槛结论由“条件通过/待证据复测”升级为 **通过（完整）**。

### 4.8 提交后重建复核批次（2026-11-03T133042Z）

为使工具链改动入库，本轮执行了本地 `git commit`（`898975fcabf3793bd405ddf85ef8b73a20969777`）；当时 `git pull` / `git push` 因环境代理（对 github.com 的 CONNECT 返回 502）阻断，已于网络恢复后补执行：合并远程 `e760392`（单实例插件）、提交文档回填并 push。由于 `build.rs` 在构建时把当前 HEAD 注入 `VINKEY_COMMIT_SHA`，提交后必须**重建安装包**才能让应用内 SHA 与仓库 HEAD 继续一致，否则 `SHELL-P-BUILD-PROVENANCE` 会因 SHA 失配而 FAIL。

| 项目 | 已核验结果 |
| --- | --- |
| 重建命令 | `npx tauri build --bundles app`（离线增量构建，构建时工作树 clean） |
| 新应用 | `/Applications/Vinkey.app`，版本 `0.1.0`，bundle `com.vinkey.desktop`；二进制内嵌 SHA `898975fcabf3793bd405ddf85ef8b73a20969777`，旧 SHA `6a88f4e4…` 已消失 |
| 批次 | `run-2026-11-03T133042Z` |
| 机器结果 | `PASS`，24/24 通过、0 失败、0 阻断，`exitCode=0`；6 张 CoreGraphics 截图有效 |
| provenance | `SHELL-P-BUILD-PROVENANCE=PASS`；`application.gitSha` = `repository.gitSha` = `898975fc…`，`versionMatch/gitShaMatch/repositoryClean` 全 true，`workingTreeDirtyAtBuild=false` |
| 归档 | `run-2026-11-03T133042Z.tar.gz`；两级 SHA256SUMS 通过，`SHELL-P-ARTIFACT-PRIVACY=PASS`（10 文件 0 暴露） |

> 说明：4.7 的 `115835Z` 批次构建于提交前 HEAD `6a88f4e4…`，其记录为历史事实，保留不改。本节 `133042Z` 为合并远程 `e760392` 前的有效证据；合并与后续文档提交会改变 HEAD，因此必须重建安装包并重跑验收才能保持 provenance 一致。

### 4.9 合并远程后重建复核批次（2026-11-03T134923Z）

网络恢复后，合并远程 `e760392`（`feat: enforce single instance on desktop via tauri-plugin-single-instance`）产生 merge commit `41ee682`，随后提交文档回填 `939afe7f9833185fcead2ebf3051a6b03d900468`（当前 HEAD）。合并引入 `tauri-plugin-single-instance v2.4.5` 及 34 个传递依赖；构建时通过 rsproxy 镜像补齐 crate 缓存（SHA256 与 `Cargo.lock` 逐一校验），在工作树 clean 下重建，`build.rs` 注入新 HEAD。

| 项目 | 已核验结果 |
| --- | --- |
| 合并 | `git merge --no-edit origin/main`（ort 策略），无冲突；远程仅改 `src-tauri/Cargo.toml`、`Cargo.lock`、`src/lib.rs` |
| 新应用 | `/Applications/Vinkey.app`，版本 `0.1.0`，bundle `com.vinkey.desktop`；内嵌 SHA `939afe7f9833185fcead2ebf3051a6b03d900468`，旧 SHA 已消失 |
| 批次 | `run-2026-11-03T134923Z` |
| 机器结果 | `PASS`，24/24 通过、0 失败、0 阻断，`exitCode=0`；6 张 CoreGraphics 截图有效 |
| 单实例影响 | `SHELL-NATIVE-MAC-WINDOW-REOPEN=PASS`，窗口关闭/恢复链路未受单实例插件影响 |
| provenance | `SHELL-P-BUILD-PROVENANCE=PASS`；`application.gitSha` = `repository.gitSha` = `939afe7f…`，`versionMatch/gitShaMatch/repositoryClean` 全 true，`workingTreeDirtyAtBuild=false` |
| 归档 | `run-2026-11-03T134923Z.tar.gz`；两级 SHA256SUMS 通过，`SHELL-P-ARTIFACT-PRIVACY=PASS`（10 文件 0 暴露） |

> 说明：`133042Z`（4.8）为合并前有效证据，本节 `134923Z` 为当前有效证据。为避免再次改变 HEAD 导致 provenance 失配，本节及之后的文档回填**不纳入新提交**，保留为工作树改动。

## 5. 复核材料清单（已在 2026-11-03T115835Z / 133042Z / 134923Z 批次全部满足）

### 5.1 环境

- 使用 `ui-shell-native-macos@1.5.0` 复跑，companion 的侧栏、设置、主题稳定态和诊断完整链路均 PASS（WebView 9/9）。
- 核验 `display-metadata.json`：`manualFallbackRequired=false`，物理 DPI `133` 由 CoreGraphics 测得，无需人工 fallback。
- 核验 `SHELL-P-ARTIFACT-PRIVACY=PASS`、`privacy-audit.json`、相对路径、固定 tar owner 和两级 `SHA256SUMS` 均通过。
- 执行命令：`npm run test:ui-shell-native-mac -- --tester-id local-tester`（默认安装应用、临时隔离 Profile、生成标准化 tar）。

### 5.2 最低截图/录屏集合（状态）

1. macOS Overlay 与交通灯：已满足（`01-mac-traffic-lights.png`）。
2. 侧栏展开/折叠、设置打开/关闭后的稳定宽度和状态：已满足（companion 1.2.0 等待稳定帧后截图）。
3. 对话/文件/日志切换、无工作区空态和错误条：已满足。
4. 浅色/深色主题、键盘焦点、设置返回和错误条关闭：已满足（companion 等待计算样式后截图）。
5. `1440x900`、`1280x800`、`1024x680` 尺寸集合：已满足（物理 DPI 已测得，无需人工说明）。
6. `04-mac-window-reopened.png`：已满足。
7. 应用诊断日志打开、刷新、复制、关闭和焦点返回：已满足（`SHELL-P-006-DIAGNOSTICS-darwin` PASS，诊断截图可审阅）。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 6. 判定规则

- **通过**：目标平台窗口/容器/响应式/键盘材料齐全，所有适用 `SHELL-P-*` 关键断言通过；菜单专项不计入本报告。
- **条件通过**：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层完整发布通过。
- **不通过**：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- **阻断**：桌面运行环境或构建依赖使结论不可得；记录复现信息。

标题栏菜单不是本报告的通过条件；若菜单设计或菜单实现存在缺口，应在 `W0-SHELL-MENU-P/F` 报告中记录，不得反向改写 `W0-SHELL-P` 的窗口/容器结论。

当前综合结论：**macOS 完整通过**（`W0-SHELL-P` 子门槛）。合并远程前有效证据批次 `run-2026-11-03T133042Z`（提交后重建复核，见 4.8）机器层 24/24 PASS，原生窗口控制、WebView companion、构建溯源、隔离 Profile、显示探针与隐私扫描全部通过，6 张 CoreGraphics 截图有效，物理 DPI 已测得，归档脱敏通过，且应用/仓库 Git SHA 同为 `898975f…`、provenance 保持 PASS；`073118Z` 的四项旧缺口已由 `1.5.0` 原生入口复核关闭（见 4.7）。合并远程 `e760392` 后已重建安装包，并由 `run-2026-11-03T134923Z`（见 4.9）重跑复核：24/24 PASS，应用/仓库 Git SHA 同为 `939afe7f…`、provenance 保持 PASS。Windows 平台仍为后续独立工作；本报告不覆盖 `D-NAV` 真实业务链路或标题栏菜单专项。

## 7. 测试人员回填区

- 自动化层：`PASS（run-2026-11-03T134923Z：24/24；原生窗口 12、WebView 9、隔离 Profile/构建溯源/显示探针/隐私扫描 3；exitCode=0）`
- Windows 桌面层：`待独立平台验收；不影响本次 macOS 阶段结论`
- macOS 桌面层：`PASS（交通灯、三档实际窗口尺寸、最大化/还原、最小化/恢复、关闭和 Reopen、显示缩放/物理 DPI 已测得）`
- 人工 UI 层：`PASS（内容页、错误条、焦点、稳定视口、侧栏/设置恢复、浅色/深色主题、诊断日志完整链路均通过；6 张 CoreGraphics 截图可审阅）`
- 构建溯源：`PASS（应用/仓库 0.1.0，同一 Git SHA 939afe7f…，仓库和构建工作树 clean；合并远程后已重建安装包并复核）`
- 结果 JSON/日志/截图 SHA-256：`PASS（顶层与 WebView 两级 SHA256SUMS 均通过）；哈希不覆盖场景语义`
- 材料脱敏：`PASS（窗口级 CoreGraphics 截图、隔离 Profile、相对路径、privacy-audit 10 文件 0 暴露、固定 owner tar，可作为受控分发附件）`
- 导航域材料：`另行提交，使用 UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md`
- 问题列表：`SHELL-EVIDENCE-001、SHELL-COVERAGE-002、SHELL-PRIVACY-001、SHELL-DISPLAY-001 已 CLOSED；WINDOWS-001 待独立平台验收；菜单缺口转由 W0-SHELL-MENU-P/F 跟踪；git pull/push 曾因环境代理 502 阻断，网络恢复后已合并远程 e760392、提交并 push；合并引入单实例插件，已重建安装包并重跑验收（见 4.9）`
- 综合结论：`macOS 完整通过（W0-SHELL-P 子门槛）`
- 下一次复审：`Windows 平台独立验收后，或 ui-shell-native-macos 再次变更、或文档回填提交后需重建重跑时复审`
