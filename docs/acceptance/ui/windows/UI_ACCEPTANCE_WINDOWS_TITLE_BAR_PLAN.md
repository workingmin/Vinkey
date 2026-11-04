# 标题栏与功能菜单专项验收计划（Windows）

- 功能域：`D-SHELL` 标题栏、平台菜单与窗口命令
- W0 大批次：`W0-SHELL-MENU`
- 平台/结构子门槛：`W0-SHELL-MENU-P`
- fixture 业务链路子门槛：`W0-SHELL-MENU-F`
- 父验收：`W0-SHELL-P`
- 设计依据：[TITLE_BAR_DESIGN.md](../../../design/ui/TITLE_BAR_DESIGN.md)
- 壳层报告：[UI_ACCEPTANCE_WINDOWS_SHELL.md](./UI_ACCEPTANCE_WINDOWS_SHELL.md)；macOS 平台版：[UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md](../macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)
- 入口总表：[UI_ENTRY_POINTS.md](../../../design/ui/UI_ENTRY_POINTS.md)
- 计划更新：`2026-11-04`

> 实现基线：目标菜单树、设置归属、Windows 焦点命令桥接和菜单选择器已实现。当前状态为“待验收”，不是 `W0-SHELL-MENU-P/F` 已通过。

## 1. 目的与边界

本计划覆盖系统标题栏和功能菜单的结构、平台承载、菜单动作、焦点语义，以及菜单入口到隔离 fixture 业务状态的最小链路。它不验收项目/会话完整生命周期、全局搜索索引、真实模型请求或真实多轮对话；这些能力分别由 `D-NAV`、`D-MODEL`、`D-CHAT` 和 `D-EDITOR` 的后续门槛负责。

本计划必须拆分回填：`P` 子集只证明壳层和平台能力；`F` 子集证明菜单动作可以到达已有业务入口并保持隔离 fixture 状态。`W0-SHELL-MENU-F` 不是 `W0-SHELL-MENU-P` 的自动附属 PASS，缺少 `W0-NAV-F` 或 `W0-EDITOR-F` 时应单独记为 `BLOCKED`。

本专项以 `TITLE_BAR_DESIGN.md` 的目标菜单为准（Windows 版）：

- Windows：`项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助`（无 Vinkey 应用菜单，由自绘标题栏承载）；macOS 平台菜单树见 [macOS 版计划](../macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)。
- “文件”不作为全局一级菜单；文档新建、保存、关闭由文件页工具栏、文档标签和 `Ctrl+S` 承担。
- “停止当前生成”由对话输入区停止按钮和 `Esc` 路径承担，不作为首版全局菜单项。
- “展开/折叠项目与会话栏”由侧栏按钮承担，不在“查看”重复呈现。
- 全局搜索 `Ctrl+K` 只有 `CF-023` 完成后才加入“会话”菜单；侧栏搜索不计入本专项通过。

`W0-SHELL-P` 的 Playwright 壳层脚本在截图前只执行“菜单合同守卫”：检查一级文案已转为目标版本，防止旧“文件”菜单污染壳层截图。该守卫不展开菜单、不执行业务命令，其 PASS 不能代替本专项 PASS。

## 2. 前置条件

| 条件 | 要求 | 不满足时 |
| --- | --- | --- |
| 目标应用 | 使用待验收的 Tauri 安装包；记录版本、构建号和嵌入 Git SHA | `BLOCKED`，不得用浏览器结果代替 |
| 平台 | Windows 桌面；自绘标题栏与窗口按钮；无需 `swiftc` | 目标平台项 `BLOCKED` |
| 应用状态 | 可启动到工作台；无模型也可执行本专项；准备一个无项目状态和一个已打开项目状态 | 无法区分入口前置条件时 `BLOCKED` |
| 编辑目标 | 至少准备对话输入框、可编辑文档、搜索/设置输入框 | 编辑焦点用例 `BLOCKED` |
| 证据归档 | 可保存截图、事件日志、自动化 stderr、结果 JSON 和 SHA-256 清单 | 不能形成可追溯批次时 `BLOCKED` |

Ollama、模型 profile 和真实会话不是本专项前置条件。测试人员仍应在报告中填写 `N/A`，不得因为未启动 Ollama 把菜单结构误判为失败。

## 3. 用例清单

状态值使用 `PASS`、`FAIL`、`BLOCKED`、`NOT_APPLICABLE`。每个用例必须记录平台、前置状态、动作、预期、实际结果、证据文件和退出码。

| 用例 ID | 场景 | Windows | 核心断言 | 关联缺口 |
| --- | --- | --- | --- | --- |
| `TB-MENU-001` | 一级菜单树 | 自绘菜单显示 `项目 / 会话 / 编辑 / 查看 / 窗口 / 帮助`；不存在文件 | 文案、顺序和平台差异符合设计 | P；`TB-GAP-001` |
| `TB-MENU-002` | 项目菜单 | 添加本地项目、刷新当前项目 | 选择失败保留原状态；刷新不清除会话和草稿 | F；`TB-GAP-001`；依赖 `W0-NAV-F` |
| `TB-MENU-003` | 会话菜单 | 新建会话；无项目时给出可达提示 | 新会话进入对话页；不把侧栏搜索冒充全局搜索 | F；`TB-GAP-001`；依赖 `W0-NAV-F` |
| `TB-MENU-004` | 编辑焦点分派 | 对话、文件、搜索/设置三类输入分别执行撤销/重做/剪切/复制/粘贴/全选 | 无有效编辑目标时禁用或明确无动作；不切页、不丢选区 | F；`TB-GAP-004`；依赖 `W0-EDITOR-F` |
| `TB-MENU-005` | 查看页面切换 | 对话工作台、项目文件、任务与日志 | 一次切换一个内容页；基础容器状态不被清除；业务数据保持另由对应域确认 | P；含 fixture 状态保持时依赖 `W0-NAV-F`/`W0-EDITOR-F` |
| `TB-MENU-006` | 主题菜单 | 切换浅色/深色 | 菜单、侧栏和窗口主题同步；业务选择保持 | P；`TB-GAP-005` |
| `TB-MENU-007` | 设置归属 | 查看中不存在设置；侧栏可进入；实现后验证 `Ctrl+,` | W0 只验收进入/返回和壳层恢复；模型保存、连接和凭据由 `W1-MODEL-E` 验收 | P；设置业务链路依赖 `D-MODEL` |
| `TB-MENU-008` | 窗口控制 | 自绘最小化、最大化/还原、关闭 | 窗口状态真实改变；最大化/还原恢复前尺寸 | P；平台证据门槛 |
| `TB-MENU-009` | 帮助和诊断 | 快捷键、窗口诊断、应用诊断日志、关于 Vinkey | 触发、关闭、焦点返回、敏感信息脱敏；`alert` 只能计为动作可触发 | P；构建溯源/脱敏 |
| `TB-MENU-010` | 菜单关闭与焦点 | 外部点击、`Escape`、命令执行后焦点返回 | 不残留展开菜单；不能仅凭脚本无条件写 PASS | P；`SHELL-P-001` |
| `TB-MENU-011` | 中文菜单审计 | 自有菜单和快捷键说明无 File/View/Settings 等英文残留 | 品牌、格式、协议字段可保留原文 | P；`TB-GAP-005` |
| `TB-MENU-012` | 首版菜单减法审计 | 不出现全局停止生成、侧栏折叠、文档保存/关闭 | 降级入口仍可从对话/侧栏/文件页到达 | P/F：入口存在性为 P，局部动作可达性依赖对应域 |

`TB-MENU-003` 的全局搜索仅在 `CF-023` 完成后增加独立的 `TB-MENU-003-GLOBAL-SEARCH` 用例；在此之前应标记 `NOT_APPLICABLE`，不能用侧栏搜索代替。

## 4. 平台执行步骤（Windows）

1. 启动 Tauri 安装包，记录应用版本、构建号、Git SHA、Windows 版本、架构、显示缩放和窗口尺寸。
2. 从空项目状态打开“项目”菜单，执行添加项目；在已有项目执行刷新；检查菜单关闭和状态保持。
3. 执行“会话 > 新建会话”和“查看”页面切换；确认设置只从侧栏或 `Ctrl+,` 到达。
4. 在对话输入框、文件编辑器、搜索/设置输入框分别执行编辑菜单命令，并记录选区/文本前后值。
5. 执行主题、帮助、诊断、关于和窗口控制；保存每个平台状态截图。
6. 用鼠标外部点击和 `Escape` 关闭每个自绘菜单；记录焦点是否回到触发器或目标输入框。

浏览器/Playwright 只能作为 WebView companion。它不能证明 Windows 自绘窗口行为、自绘窗口按钮或物理 DPI；macOS 原生菜单、交通灯见 [macOS 版计划](../macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)。

## 5. 结果输出集

每次运行使用独立批次目录，例如 `title-bar-w0-p-<YYYYMMDD>-windows/`：

```text
result.json              # 唯一机器结果源：用例、状态、计数、exitCode、应用/仓库溯源
SHA256SUMS               # 结果目录内相对路径的哈希清单
screenshots/             # 菜单树、动作后页面、关闭状态、窗口控制和尺寸截图
events.txt               # 按时间顺序的操作与观察事件
automation-stderr.txt    # 自动化器 stderr；空文件也应保留
display-info.txt         # 平台显示器/缩放原始信息；Windows 可得时提供
native-automation.*      # Windows UI Automation 操作源（自绘菜单选择器或等效）
webview/                 # 同批次 Playwright companion 结果（如执行）
```

脚本 stdout 只输出套件结论、`Results:`、`SHA256SUMS:` 和 `exit=<n>` 四行；详细用例和环境信息以 `result.json` 为准。进程退出码必须等于 `result.json.exitCode`。原始路径可以存在于本地中间产物，但最终报告引用时必须脱敏。

## 6. 判定规则

- **专项通过**：`TB-MENU-001` 至 `TB-MENU-012` 中所有适用用例均 `PASS`；全局搜索在 `CF-023` 尚未完成时可标记 `NOT_APPLICABLE`，但必须在报告中保留该遗留项；Windows 至少一次目标平台证据；`result.json.exitCode=0` 且哈希清单可核验。
- **条件通过**：菜单结构和核心动作通过，但目标平台尚未执行、全局搜索为 `NOT_APPLICABLE` 或帮助弹窗仍是低保真实现；必须列出遗留项，不能宣称跨平台发布通过。
- **不通过**：仍出现旧“文件”一级菜单、设置仍在“查看”、编辑命令作用于错误焦点、菜单关闭断言与截图冲突，或窗口动作失败。
- **阻断**：应用包无法启动、平台权限缺失、结果文件不完整或无法证明结果来自目标包。

标题栏专项通过不会自动代表 `D-NAV`、`D-CHAT`、`D-EDITOR` 通过；反之，导航或模型域失败也不应掩盖已独立确认的菜单结构结果。跨平台发布结论需在 macOS 版计划（见 [macOS 版计划](../macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md)）完成后合并。

## 7. 计划与责任

| 阶段 | 工作 | 产出 | 责任 |
| --- | --- | --- | --- |
| M1 | 设计和源码审计 | `TITLE_BAR_DESIGN.md` 审计表、缺口清单 | 产品/设计/开发 |
| M2 | 菜单迁移和焦点桥接 | 项目/会话菜单、设置归属、编辑命令实现 | 开发；已完成，待验收 |
| M3 | Playwright/WebView companion | `TB-MENU-004`、`TB-MENU-005`、`TB-MENU-010` 结构证据 | 开发/测试 |
| M4 | Windows 桌面执行 | 自绘菜单、窗口控制、DPI 和截图 | 测试人员 |
| M5 | macOS 原生执行 | Accessibility 菜单、交通灯、窗口动作、哈希归档；见 [macOS 版计划](../macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) | 测试人员 |
| M6 | 报告复审 | 逐项结果、遗留项和最终结论 | 测试/产品 |

执行顺序建议为 `M1 → M2 → M3 → W0-SHELL-MENU-P → W0-NAV-F/W0-EDITOR-F → W0-SHELL-MENU-F → M4 → M6`（Windows 版；macOS 执行见 M5 对应计划）。`W0-SHELL-MENU-P` 可以先于业务 fixture 执行；`W0-SHELL-MENU-F` 必须等待 `W0-NAV-F`、`W0-EDITOR-F` 的必要用例通过。它们同属 W0 大批次，但报告中必须分别给出 P/F 结论。
