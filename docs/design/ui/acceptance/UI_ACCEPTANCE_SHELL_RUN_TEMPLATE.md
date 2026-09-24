# 应用壳层与入口本地验收回填模板

本模板供测试人员在 Windows/macOS 桌面环境执行 `W0-SHELL-P`。所有 `<...>` 都是待填项；项目、会话和搜索业务请使用导航域模板。

## 1. 执行元数据

- 执行人/日期：`<TESTER_NAME> / <YYYY-MM-DD HH:mm TZ>`
- 操作系统/版本/架构：`<OS> / <VERSION> / <x64|arm64>`
- 显示缩放/DPI、实际窗口尺寸：`<DPI_OR_SCALE> / <SIZE>`
- Vinkey 版本/Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js/Rust/Tauri：`<VERSIONS>`
- Ollama/模型/Profile：`N/A（W0-SHELL-P 不要求真实模型）`
- 测试套件/脚本版本：`<SUITE_ID>@<VERSION>`

## 2. 前置检查

| 检查项 | 结果 | 证据/备注 |
| --- | --- | --- |
| 应用成功启动并显示壳层 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 目标平台窗口控制可用 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 测试目录和路径已脱敏 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 窗口尺寸、DPI 和平台菜单条件可复现 | `<PASS/FAIL/BLOCKED>` | `<...>` |

## 3. 脚本执行记录

### macOS/Linux shell

```bash
<COMMAND_USED>
```

### macOS Tauri 原生 shell

```bash
npm run test:ui-shell-native-mac -- --output <ARCHIVE_ROOT> [--app /path/to/Vinkey.app]
```

该入口默认启动 `/Applications/Vinkey.app`；传入 `--app` 时启动其他已构建应用，传入 `--dev` 时启动 `npm run desktop:dev`。`npm run test:ui-shell-acceptance:sh` 在 macOS 采用相同默认值，加 `--browser` 可仅执行 Playwright。执行前须授予运行终端的 macOS“辅助功能”和“屏幕与系统音频录制”权限。它会在最后一个窗口用例点击关闭交通灯，请使用专用测试实例。

### Windows PowerShell

```powershell
<COMMAND_USED>
```

推荐浏览器自动化命令：`npm run test:ui-shell-acceptance -- --output <ARCHIVE_ROOT>`。脚本在归档根目录下创建带时间戳的单次运行目录。Playwright 只证明浏览器/WebView DOM 层；请把 Windows/macOS 桌面窗口结果单独填入下表，不能把浏览器截图当作原生菜单或交通灯证据。

macOS 原生脚本的 `result.json` 可直接作为 macOS 桌面层证据；`display-info.txt` 保存 `system_profiler SPDisplaysDataType` 原始信息，`result.json` 保存 Accessibility 桌面点坐标和截图像素。多显示器、系统缩放和物理 DPI 仍需测试人员在回填表中确认。

- 退出码：`<EXIT_CODE>`（应与 `result.json.exitCode` 一致）
- stdout 最终四行：`<CAPTURE_OR_TERMINAL_REFERENCE>`（脚本不生成 `stdout.txt`）
- stderr/平台诊断：`<AUTOMATION_STDERR_OR_TERMINAL_REFERENCE>`
- JSON 结果：`<RESULT_JSON_FILE_OR_NA>`
- 窗口/应用诊断：`<DIAGNOSTICS_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`

## 4. 人工 UI 观察

| 用例 | 操作与前置 | 预期 | 实际结果 | 截图/录屏 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `SHELL-P-001` 标题栏与菜单 | `<STEPS>` | 核心命令语义一致；Escape/外部点击关闭 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-002` 窗口控制 | `<STEPS>` | 最小化、最大化/还原、关闭正确 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-003` 侧栏容器 | `<STEPS>` | 展开/52px 折叠；入口承载不丢 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-004` 内容页容器 | `<STEPS>` | 对话/文件/日志互斥切换，容器稳定 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-005` 设置替换 | `<STEPS>` | 返回恢复进入前页面和壳层状态 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-006` 诊断/错误 | `<STEPS>` | 脱敏、只读、可刷新/复制/关闭 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-007` 响应式基线 | `<STEPS>` | 目标尺寸无重叠、遮挡或跳动 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-P-008` 键盘与主题 | `<STEPS>` | 焦点可见、Escape 返回、主题不丢状态 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |

### 4.1 Playwright 结果映射

| 报告场景 | 自动化用例/截图 | 仍需人工/平台证据 |
| --- | --- | --- |
| Windows 标题栏、菜单和按钮 | `SHELL-P-001-WIN-DOM`、`01-win-*-web.png` | Tauri 实际窗口按钮最小化/最大化/关闭；自绘标题栏拖动与双击 |
| macOS Overlay、菜单和交通灯 | `SHELL-P-001-MAC-LAYOUT`、`01-mac-overlay-layout-simulation.png`；原生脚本 `SHELL-NATIVE-MAC-*`、`01/02-mac-*.png` | 原生脚本需权限；多显示器/物理 DPI 需人工确认 |
| 侧栏、设置开关及状态恢复 | `SHELL-P-003-SETTINGS-*`、`02-*.png` | 真实窗口宽度和 macOS Overlay 避让观感 |
| 内容切换、空态、错误条 | `SHELL-P-004-CONTENT-*`、`SHELL-P-006-ERROR-*`、`03-*.png` | 只需核实桌面 WebView 无平台差异时注明观察结果 |
| 主题、Escape、焦点、尺寸 | `SHELL-P-008-THEME-FOCUS-*`、`SHELL-P-007-*`、`04-*.png`/`05-*.png` | 实机窗口尺寸、DPI/缩放值及物理像素截图 |

Playwright `result.json` 的 `platformEvidence` 标记 `NOT_COVERED_BY_PLAYWRIGHT` 时，不得单独把整份 `W0-SHELL-P` 标为通过；macOS 原生脚本的 `W0-SHELL-P-NATIVE-MAC` 结果和人工 DPI 回填均需齐全。

## 5. 问题与证据

| 编号 | 类型 | 复现步骤 | 影响 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `<ISSUE_ID>` | `<BUG/BLOCKER/OBSERVATION>` | `<STEPS>` | `<P0/P1/P2>` | `<FILE>` | `<OPEN/FIXED/WAIVED>` |

建议归档：

```text
shell-w0-p-<YYYYMMDD>-<platform>/
├── environment.md
├── ui-observations.md
├── screenshots/
├── recordings/
├── result.json
├── SHA256SUMS
├── display-info.txt
├── events.txt
├── automation-stderr.txt
├── native-automation.applescript
├── tauri-dev.log
└── diagnostics.txt
```

不得上传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。

## 6. 回填结论

- 自动化层：`<PASS/FAIL/BLOCKED>`
- Windows 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- macOS 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 层：`<PASS/FAIL/BLOCKED/待回填>`
- 导航域材料是否另行提交：`<YES/NO + TEMPLATE_REF>`
- 综合结论：`<通过/条件通过/不通过/阻断/待平台人工验收>`
- 遗留问题：`<FOLLOW_UP_ITEMS>`
- 下一次复审：`<VERSION_OR_DATE>`
