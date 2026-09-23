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

### Windows PowerShell

```powershell
<COMMAND_USED>
```

- 退出码：`<EXIT_CODE>`
- stdout/stderr：`<STDOUT_FILE> / <STDERR_FILE>`
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
├── stdout.txt
├── stderr.txt
├── diagnostics.txt
└── SHA256SUMS
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
