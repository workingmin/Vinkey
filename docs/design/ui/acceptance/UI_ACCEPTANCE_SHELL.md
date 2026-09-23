# 应用壳层与入口专项验收报告

- 功能域：`D-SHELL` 应用壳层与入口承载
- 验收标识：`W0-SHELL-P`
- 关联设计：[UI_DESIGN_SHELL.md](../UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../TITLE_BAR_DESIGN.md)
- 导航业务报告：[UI_ACCEPTANCE_NAVIGATION.md](./UI_ACCEPTANCE_NAVIGATION.md)
- 回填模板：[UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md](./UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)
- 自动化入口：[Playwright 脚本](../../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)，命令为 `npm run test:ui-shell-acceptance`
- 报告状态：Playwright 浏览器层自动化已实现；Tauri 目标平台原生材料待补
- 更新日期：`2026-09-23`

## 1. 验收边界

本报告只判定标题栏、平台菜单、窗口控制、侧栏容器、内容页承载、设置/诊断入口、主题和响应式结构。项目、会话、搜索、标题生命周期和删除边界属于 `D-NAV`，分别由 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定；本报告不把侧栏结构截图当作导航业务通过。

`W0-SHELL-P` 不要求 Ollama。浏览器演示只能支持结构观察，不能替代 Windows/macOS Tauri 窗口、原生菜单、DPI 和真实尺寸证据。

## 2. 设计断言矩阵

| 用例 | 操作链路 | 结构断言 | 当前状态 |
| --- | --- | --- | --- |
| `SHELL-P-001` 标题栏与菜单 | Windows 自绘 / macOS 原生菜单 | 核心命令语义一致；一次展开一个菜单；外部点击/Escape 关闭 | 待平台执行 |
| `SHELL-P-002` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 动作正确；状态同步；关闭遵循平台行为 | 待平台执行 |
| `SHELL-P-003` 侧栏容器 | 展开 ↔ 52px 折叠 → 恢复 | 品牌、全局入口承载和设置入口不丢；macOS Overlay 不遮挡 | 待平台执行 |
| `SHELL-P-004` 内容页容器 | 对话 ↔ 文件 ↔ 日志 | 内容区互斥切换，容器尺寸稳定；业务状态由各域负责 | 待平台执行 |
| `SHELL-P-005` 设置替换 | 任意内容页 → 设置 → 返回 | 设置不是第四内容页；返回恢复进入前页面和壳层状态 | W1 联调复核 |
| `SHELL-P-006` 诊断/错误 | 打开诊断、刷新、复制、关闭；错误条关闭 | 只读、脱敏、焦点返回，不改变业务状态 | 部分实现，待平台执行 |
| `SHELL-P-007` 响应式基线 | `1440x900`、`1280x800`、`1024x680`、窄窗口 | 无重叠、无横向遮挡、文字不改变稳定尺寸 | 待平台执行 |
| `SHELL-P-008` 键盘与主题 | Tab、Escape、主题切换、Ctrl/Cmd+S | 焦点可见、入口可达、主题不丢业务状态 | 待平台执行 |

## 3. 当前代码与自动化证据

Playwright 自动化入口以隔离浏览器上下文预置无项目状态，可自动执行自绘标题栏 DOM、侧栏与设置状态、对话/文件/日志切换、空态/错误条、主题/键盘焦点，以及三个目标视口的结构断言和截图。macOS 布局通过浏览器平台标识模拟，不代表 Tauri 原生系统行为；原生菜单、窗口按钮、交通灯和实际 DPI 必须在目标桌面应用另行回填。

| 证据 | 覆盖 | 结果/限制 |
| --- | --- | --- |
| `src/store.test.ts` | 主题、活动会话、设置打开/关闭、运行状态和状态恢复 | 可支持代码层结论；不能替代窗口/菜单渲染 |
| `src/lib/nativeWindowControls.test.ts` | 侧栏宽度、ResizeObserver 合并更新、失败回调和清理 | 可支持桥接层结论；需目标平台确认 |
| `src/lib/desktop.test.ts` | 浏览器演示和桥接分流 | 不替代 Tauri 实机 |
| `src/components/SettingsPage.test.tsx` | 设置页状态和连接失败 | 归属 `D-MODEL`，不替代壳层返回验收 |
| `src/App.tsx`、`src/styles.css` | 页面组装、断点、标题栏和内容容器源码 | Playwright 覆盖仍不等价于 Tauri 桌面壳层 |
| `scripts/ui-shell/run-ui-shell-acceptance.mjs` | Playwright WebView 层自动操作、截图、尺寸断言和 JSON | 不驱动 Tauri 原生菜单/窗口控件；原生平台用例保持阻断 |

历史执行记录（继承前一轮基线，需在本版本重新执行或注明 SHA）：`NODE_ENV=test npm test` 曾通过 37 个测试文件/249 个测试；`npm run build` 曾通过。Linux Rust/GTK 环境缺失不能替代 Windows/macOS 桌面证据。

## 4. 测试人员必须回传的材料

### 4.1 环境

- Windows/macOS 版本、架构、DPI/显示缩放、实际窗口尺寸。
- Vinkey 版本/Git SHA、Node.js/Rust/Tauri 版本；本域无模型时填写 `N/A`。
- 脚本 ID/版本、命令、退出码、stdout/stderr、诊断日志和 `result.json`（若已具备）。

### 4.2 最低截图/录屏集合

1. Windows 自绘标题栏、菜单和窗口按钮；macOS Overlay、原生菜单和交通灯。
2. 侧栏展开/折叠、设置打开/关闭后的宽度和状态。
3. 对话/文件/日志切换、无工作区空态和错误条。
4. 菜单展开、Escape/外部点击关闭、主题切换、键盘焦点。
5. `1440x900`、`1280x800`、`1024x680` 中可执行的尺寸集合及 DPI 说明。

项目、会话、搜索结果、删除确认和多轮对话材料转入 [UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md)，不要在本报告重复回填。

## 5. 判定规则

- **通过**：目标平台窗口/菜单/响应式/键盘材料齐全，所有 `SHELL-P-*` 关键断言通过。
- **条件通过**：代码和结构证据充分，但平台人工材料或直接渲染覆盖未齐；不得宣称壳层完整发布通过。
- **不通过**：窗口控制、内容容器、焦点、错误恢复或平台语义不满足设计断言。
- **阻断**：桌面运行环境或构建依赖使结论不可得；记录复现信息。

当前综合结论：**待平台人工验收**。本报告不覆盖 `D-NAV` 的真实业务链路。

## 6. 测试人员回填区

- 自动化层：`<PASS/FAIL/BLOCKED + COMMAND_AND_RESULT>`
- Windows 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- macOS 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 层：`<PASS/FAIL/BLOCKED/待回填>`
- 结果 JSON/日志/截图 SHA-256：`<ARTIFACTS>`
- 问题列表：`<ISSUES>`
- 综合结论：`<通过/条件通过/不通过/阻断/待平台人工验收>`
- 下一次复审版本/日期：`<NEXT_REVIEW>`
