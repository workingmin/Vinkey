# 应用壳层与入口本地验收回填模板

本模板供测试人员在 Windows/macOS 桌面环境执行 W0-A 后填写，并回传给验收报告。所有 `<...>` 都是待填项，不代表通过。

## 1. 执行元数据

- 执行人：`<TESTER_NAME>`
- 执行日期：`<YYYY-MM-DD HH:mm TZ>`
- 操作系统/版本：`<Windows VERSION / macOS VERSION>`
- CPU/架构：`<x64 / arm64>`
- 显示缩放/DPI：`<DPI_OR_SCALE>`
- Vinkey 版本/Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js/Rust/Tauri：`<VERSIONS>`
- Ollama/模型/Profile：`<N/A_FOR_W0-A_OR_VALUES_IF_W1_CHECKED>`
- 实际窗口尺寸：`<1440x900 / 1280x800 / 1024x680 / OTHER>`
- 测试套件/脚本版本：`<SUITE_ID>@<VERSION>`

## 2. 前置检查

| 检查项 | 结果 | 证据/备注 |
| --- | --- | --- |
| 应用成功启动并显示壳层 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 测试工作区/fixture 已准备且路径脱敏 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 无模型状态已记录（或 W1 profile 已确认） | `<PASS/FAIL/BLOCKED/NA>` | `<...>` |
| 窗口尺寸、DPI 和平台菜单条件可复现 | `<PASS/FAIL/BLOCKED>` | `<...>` |

## 3. 脚本执行记录

### macOS/Linux shell

```bash
<COMMAND_USED>
```

### Windows PowerShell

```powershell
<COMMAND_USED>
```

- 退出码：`<EXIT_CODE>`
- stdout：`<STDOUT_FILE>`
- stderr：`<STDERR_FILE>`
- JSON 结果：`<RESULT_JSON_FILE_OR_NA>`
- 窗口/应用诊断：`<DIAGNOSTICS_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`

## 4. 人工 UI 观察

| 用例 | 操作与前置 | 预期 | 实际结果 | 截图/录屏 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `SHELL-001` 无工作区空态/添加工作区 | `<STEPS>` | 空态可达；打开失败不丢当前状态 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-002` 项目切换 | `<STEPS>` | 运行/未保存时有阻断或确认；切换后状态正确 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-003` 搜索 | `<STEPS>` | 项目、会话、文档结果区分；无结果可解释 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-004` 会话新建/恢复/删除 | `<STEPS>` | 消息和标题正确；删除有确认且可重试 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-005` 对话/文件/日志切换 | `<STEPS>` | 页面切换不丢工作区、会话和草稿 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-006` 设置打开/关闭 | `<STEPS>` | 侧栏临时折叠并按规则恢复；W1 状态另记 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-007` Windows 菜单或 macOS 原生菜单 | `<STEPS>` | 命令语义一致；Escape/外部点击关闭 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-008` 侧栏/主题/键盘焦点 | `<STEPS>` | 52px 折叠、主题、焦点和 tooltip 可用 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-009` 窗口控制 | `<STEPS>` | 最小化、最大化/还原、关闭动作正确 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |
| `SHELL-010` 错误/加载/空态/诊断 | `<STEPS>` | 错误留在上下文；可重试或返回；日志脱敏 | `<FILL_IN>` | `<ATTACHMENT>` | `<PASS/FAIL/BLOCKED>` |

每个用例必须同时记录实际步骤、预期和实际结果、证据文件名、结论及问题编号。未执行或只有截图缺少操作记录时，填 `BLOCKED` 或 `待回填`，不能填 `PASS`。

## 5. 问题与证据

| 编号 | 类型 | 复现步骤 | 影响 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `<ISSUE_ID>` | `<BUG/BLOCKER/OBSERVATION>` | `<STEPS>` | `<P0/P1/P2>` | `<FILE>` | `<OPEN/FIXED/WAIVED>` |

归档建议：

```text
shell-<YYYYMMDD>-<platform>/
├── ui-observations.md
├── screenshots/
├── recordings/
├── stdout.txt
├── stderr.txt
├── diagnostics.txt
└── SHA256SUMS
```

不得上传密钥、完整作品正文、系统用户名或未脱敏绝对路径。

## 6. 回填后的结论

- 自动化层：`<PASS/FAIL/BLOCKED>`
- Windows 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- macOS 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 层：`<PASS/FAIL/BLOCKED/待回填>`
- 综合结论：`<通过/条件通过/不通过/阻断>`
- 遗留问题：`<FOLLOW_UP_ITEMS>`
- 下一次复审：`<VERSION_OR_DATE>`
