# 应用壳层与入口专项验收报告

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`
- 关联设计：[UI_DESIGN_SHELL.md](../UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../TITLE_BAR_DESIGN.md)
- 标题栏菜单专项计划：[UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md)，拆分为 `W0-SHELL-MENU-P`（平台/结构）与 `W0-SHELL-MENU-F`（fixture 业务入口链路）
- 导航业务报告：[UI_ACCEPTANCE_NAVIGATION.md](./UI_ACCEPTANCE_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)
- 自动化入口：[Playwright 脚本](../../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令为 `npm run test:ui-shell-acceptance`
- macOS 原生入口：[Accessibility/System Events 脚本](../../../../scripts/ui-shell/run-ui-shell-native-macos.sh)，命令为 `npm run test:ui-shell-native-mac`
- 当前平台批次：`macOS`；Windows 材料待后续独立执行并回填，不影响本节形成 macOS 阶段结论
- 报告状态：**macOS 待新版壳层脚本复测**；旧批次混合了菜单操作、未包含同版本 WebView companion 和构建溯源，不能作为新版 `W0-SHELL-P` 完整通过依据
- 更新日期：`2026-09-24`

## 1. 验收边界

本报告只判定应用壳层的平台/结构承载：窗口或 Overlay、窗口控制、侧栏容器、内容页承载、设置替换、诊断/错误承载、主题、焦点和响应式基线。标题栏菜单树、菜单项动作、中文菜单审计和菜单关闭由独立的 [标题栏菜单专项计划](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md) 的 `W0-SHELL-MENU-P/F` 执行；本报告不把菜单结果计入 `W0-SHELL-P`，也不把旧菜单自动化结果当作目标菜单通过。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。浏览器演示只能支持结构观察，不能替代 Windows/macOS Tauri 窗口控制、DPI 和真实尺寸证据；原生菜单不在本门槛范围内。

标题栏菜单的目标语义和缺口以 [TITLE_BAR_DESIGN.md](../TITLE_BAR_DESIGN.md) 为准，但不属于本报告的 `SHELL-P-*` 用例。此前批次中“文件 / 编辑 / 查看 / 窗口 / 帮助”的机器 PASS 只证明旧菜单行为；新版壳层脚本只在截图前核对目标一级菜单，菜单动作和命令焦点分派仍应在 `W0-SHELL-MENU-P/F` 中复测。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 应用窗口/Overlay 承载 | Windows 自绘 / macOS Overlay | 平台装饰方式正确；内容区避让标题栏安全区；不依赖菜单树 | Playwright 只证明 DOM/布局；macOS/Windows 实机证据待新版批次 |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | 原生脚本覆盖交通灯/缩放/最小化/关闭；Windows 待执行 |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；macOS Overlay 不遮挡 | 代码/浏览器自动化已覆盖，目标平台人工材料待补 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | Playwright 覆盖无项目空态和三页容器；目标平台材料待补 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | 代码证据已具备，目标平台返回链路待复核 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | 日志中心入口通过；错误条和焦点返回材料待补 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | 三张 macOS 尺寸截图已齐，但被菜单残留污染；新批次需复核 |
| `SHELL-P-008` 键盘与主题 | Tab、主题切换、壳层返回路径 | 焦点可见、入口可达、主题不丢壳层状态；菜单 Escape 另由菜单专项验收 | Playwright 覆盖主题/焦点；目标平台材料待补 |

## 3. 当前代码与自动化证据

Playwright 自动化入口支持按平台运行。macOS 原生入口将同版本 Playwright 的 darwin WebView 用例作为 `webview/` companion 合并到同一顶层 `result.json`，覆盖侧栏折叠、设置返回、对话/文件/日志切换、无工作区空态、错误条、主题、键盘焦点和三个目标视口；原生入口通过 Accessibility/System Events 执行交通灯、窗口缩放/最小化/关闭和窗口尺寸，并只读核对一级菜单合同。绿色交通灯切换后若离开 AX 树，脚本可调用“窗口”菜单恢复窗口，但必须把 `menu-recovery:<菜单项>` 写入用例明细；该恢复动作不计入标题栏菜单专项证据。标题栏菜单另由 `W0-SHELL-MENU-P/F` 归档。显示器原始信息写入 `display-info.txt`，事件结果写入 `events.txt`；构建溯源、工具链、统一退出码和证据索引只写入唯一机器结果源 `result.json`，不再生成重复的环境摘要文件。`webview/` 保留自己的结果与清单。Windows 原生窗口和真实 DPI 仍需 Windows UI Automation 入口或人工材料。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 可支持代码层结论；不能替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 可支持桥接层结论；需目标平台确认 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/components/SettingsPage.test.tsx` | 设置页状态和连接失败 | 归属 `D-MODEL`，不替代壳层返回验收 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright 覆盖仍不等价于 Tauri 桌面壳层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON；支持 `--platform`、`--skip-native-evidence`、`--output-exact` | 不驱动 Tauri 原生菜单/窗口控件 |
| `scripts/ui-shell/run-ui-shell-native-macos.sh` | macOS Accessibility/System Events 原生窗口操作、Playwright companion、构建溯源、截图、窗口尺寸和统一 JSON | 需要辅助功能/屏幕录制权限；无法在 Linux/CI 替代执行；只读核对菜单合同，窗口恢复回退不作为菜单验收证据 |

壳层脚本不得通过菜单选择器断言标题栏设计已完成；菜单名称、菜单动作和编辑焦点命令使用 [UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./UI_ACCEPTANCE_TITLE_BAR_PLAN.md) 的专项脚本和人工证据。壳层脚本只验证菜单无关的窗口、容器和页面状态。

当前工作树已执行 `npm test`，通过 41 个测试文件/267 个测试；`npm run build` 通过。本次旧批次尚未记录安装包版本、构建号和应用 Git SHA。新脚本会从 `.app/Contents/Info.plist` 和应用启动日志中的 `VINKEY_COMMIT_SHA` 记录这些字段，并同时记录仓库 SHA、架构、Rust、Tauri CLI/框架版本；若安装包日志未暴露应用 SHA，将明确写为 `UNAVAILABLE`，不会用仓库 SHA 冒充安装包来源。

## 4. 2026-09-24 macOS 原生执行结果

### 4.1 批次与环境

| 项目 | 已核验结果 |
| --- | --- |
| 命令 | `bash scripts/ui-shell/run-ui-shell-native-macos.sh`，使用默认 `/Applications/Vinkey.app` |
| 批次 | `run-2026-09-24T082007Z`；结果生成于 `2026-09-24T08:20:22.489Z` |
| 套件 | 旧批次 `ui-shell-native-macos@1.0.0`；新版脚本为 `ui-shell-native-macos@1.2.1`，验收标识 `W0-SHELL-P-NATIVE-MAC` |
| 环境 | macOS `26.6.2`、Node.js `v24.19.0`、进程名 `Vinkey` |
| 测试执行人 | `workingmin`，按 Git HEAD 提交者暂定；新版脚本写入 `repository.lastCommitter` |
| 显示器 | Apple M4 内置 Liquid Retina，`2880x1864 Retina`，主显示器、未镜像 |
| 点/像素 | 桌面 `1710x1107` points；截图 `3420x2214` pixels；估算 backing scale `2x` |
| 机器结果 | 原始批次 `PASS`，13/13 通过、0 失败、0 阻断，`exitCode=0`；该结果未包含新版 WebView companion |
| 原始诊断 | `events.txt` 与 13 个结果逐项一致；`automation-stderr.txt` 为空 |

### 4.2 完整性与截图审阅

上传的旧批次 `result.json`、`display-info.txt`、`automation-stderr.txt`、`events.txt`、`native-automation.applescript` 及截图均与 `SHA256SUMS` 匹配，但其中包含菜单操作，不能直接作为新版壳层批次。旧批次原生截图集合包括：

- `01-mac-traffic-lights.png`：原生红黄绿交通灯可见，主窗口内容未被 Overlay 遮挡。
- `02-mac-native-menu-*.png`：属于旧标题栏菜单混合批次，转交 `W0-SHELL-MENU-P` 复核，不计入本报告。
- `03-mac-window-1440x900.png`、`03-mac-window-1280x800.png`、`03-mac-window-1024x680.png`：旧批次尺寸截图受到菜单残留污染，不能作为新版壳层响应式证据。
- `04-mac-before-close.png`：旧批次关闭前窗口布局可见，仅作为历史材料。

因此，文件完整性可以确认，但“哈希匹配”只证明文件未被替换，不会覆盖旧脚本把菜单和壳层窗口混合验收的范围问题。

### 4.3 子门槛结论

`result.json` 与 `events.txt` 一致记录旧批次机器 PASS，但人工审阅发现菜单残留污染了窗口尺寸截图，且旧脚本把菜单断言与窗口断言混在同一套件。新版 `W0-SHELL-P` 脚本已移除菜单操作；必须重新运行新版 macOS 批次，才能判定壳层平台门槛。

当前 macOS 子门槛结论为 **不通过/待复测**，不等同于整个 `D-SHELL` 功能域或跨平台发布结论。

### 4.4 完整功能域通过前置条件审计

| 前置条件 | 当前状态 | 升级为完整通过所需材料 |
| --- | --- | --- |
| macOS 原生窗口用例 | 未满足 | 使用新版脚本重新执行交通灯、窗口尺寸、缩放、最小化和关闭；菜单项另由 `W0-SHELL-MENU-P` 复测 |
| 批次文件完整性 | 已满足 | 9/9 张截图及 5 个诊断/脚本文件均与同批次 `SHA256SUMS` 匹配 |
| 应用构建可追溯性 | 本批次未记录 | 使用新版脚本回传 `result.json`；`SHELL-P-BUILD-PROVENANCE` 必须确认 `.app` 版本/Git SHA 与干净仓库一致 |
| 系统环境元数据 | 部分满足 | 旧批次已记录 macOS 和 2x backing scale；新脚本补架构、Rust/Tauri/Node 信息，物理 DPI 仍需注明不可直接得出 |
| 上传材料脱敏 | 报告侧处理 | 原始 `SHA256SUMS` 是本地中间产物；最终报告不引用用户目录绝对路径，新版清单改用相对路径 |
| 壳层 WebView/人工 UI 链路 | 待新版批次 | 新脚本自动合并 8 个 darwin Playwright 用例；旧批次没有同批次 companion 结果 |
| Windows 桌面平台 | 未满足 | 若当前版本声明支持 Windows，需 Windows 原生窗口/菜单/缩放材料后才能给出跨平台完整通过 |

## 5. 测试人员必须回传的材料

### 5.1 环境

- Windows/macOS 版本、架构、DPI/显示缩放、实际窗口尺寸。
- Vinkey 版本/Git SHA、Node.js/Rust/Tauri 版本；本域无模型时填写 `N/A`。
- 脚本 ID/版本、命令、顶层 `result.json`、`SHA256SUMS`、`screenshots/`、`events.txt`、`automation-stderr.txt`，以及 `webview/` companion 目录和 `webview-stdout.txt`/`webview-stderr.txt`。stdout 只需记录终端最终四行；逐用例、应用/仓库版本和工具链状态在顶层 JSON 中统一查看。`result.json.exitCode` 与进程退出码一致，无需手工执行 `echo $?`。

### 5.2 最低截图/录屏集合

1. Windows 自绘标题栏与窗口按钮；macOS Overlay 与交通灯。
2. 侧栏展开/折叠、设置打开/关闭后的宽度和状态。
3. 对话/文件/日志切换、无工作区空态和错误条。
4. 主题切换、键盘焦点、设置返回和错误条关闭；菜单展开/关闭使用标题栏专项集合。
5. `1440x900`、`1280x800`、`1024x680` 中可执行的尺寸集合及 DPI 说明。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 6. 判定规则

- **通过**：目标平台窗口/容器/响应式/键盘材料齐全，所有适用 `SHELL-P-*` 关键断言通过；菜单专项不计入本报告。
- **条件通过**：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层完整发布通过。
- **不通过**：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- **阻断**：桌面运行环境或构建依赖使结论不可得；记录复现信息。

标题栏菜单不是本报告的通过条件；若菜单设计或菜单实现存在缺口，应在 `W0-SHELL-MENU-P/F` 报告中记录，不得反向改写 `W0-SHELL-P` 的窗口/容器结论。

当前综合结论：**待新版壳层脚本复测**。旧批次机器层面为 13/13，但菜单残留污染了尺寸截图，且旧批次没有新版范围的 WebView companion 和构建溯源输出。新版脚本需重新执行 macOS 批次；Windows 平台仍为后续工作。本报告不覆盖 `D-NAV` 的真实业务链路或标题栏菜单专项。

## 7. 测试人员回填区

- 自动化层：`PASS（当前工作树：41 个测试文件/267 个测试；build 通过）`
- Windows 桌面层：`待回填`
- macOS 桌面层：`旧批次混合菜单证据，不作为新版 W0-SHELL-P 结论；新版脚本待复测`
- 人工 UI 层：`旧批次已核验交通灯；菜单和尺寸材料移交标题栏专项，新版壳层批次待回填`
- 结果 JSON/日志/截图 SHA-256：`旧批次 9/9 截图及诊断文件哈希匹配；哈希不覆盖状态语义`
- 问题列表：`SHELL-SCRIPT-001 旧批次混合菜单与壳层断言；PROVENANCE-001 旧批次缺安装应用版本/Git SHA；COVERAGE-001 旧批次缺新版范围 WebView companion；WINDOWS-001 Windows 待验收；菜单缺口 TB-GAP-001/TB-GAP-003/TB-GAP-004 转由 W0-SHELL-MENU-P/F 跟踪`
- 综合结论：`不通过/待复测`
- 下一次复审版本/日期：`新版 macOS 壳层批次（窗口原生用例 + WebView companion + 构建溯源）回传后复审`
