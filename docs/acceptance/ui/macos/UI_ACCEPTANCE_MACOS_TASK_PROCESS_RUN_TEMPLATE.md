# 长任务/日志中心本地验收回填模板（macOS）

本模板供测试人员在 macOS 桌面环境执行 `W4-TASK-E` / `UI-ACC-LOGS-001`。所有 `<...>` 均为待填占位符；未执行或缺少必要证据时不得填写 `PASS`。Windows 平台请使用 [UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md](../windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md)。

## 1. 执行元数据

- 执行门槛：`W4-TASK-E` / `D-TASK-LOG`
- 执行人/日期：`<TESTER> / <YYYY-MM-DD HH:mm TZ>`
- 操作系统/版本/架构：`<OS> / <VERSION> / <x64|arm64>`
- 显示缩放/DPI、窗口尺寸：`<SCALE> / <SIZE>`
- Vinkey 版本/Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js/Rust/Tauri：`<VERSIONS>`
- 模型/Profile/连接：`<PROFILE_ID / MODEL / CONNECTION_KIND>（不含密钥）`
- 脚本 ID/版本：`UI-ACC-LOGS-001@<SUITE_VERSION>`

## 2. 前置状态

| 检查项 | 结果 | 证据/备注 |
| --- | --- | --- |
| 桌面端/Tauri 构建依赖可用 | `<PASS/FAIL/BLOCKED>` | `<...>` |
| 已配置模型并完成 `W1-MODEL-E` 准入 | `<PASS/FAIL/BLOCKED>` | `<REPORT_REF>` |
| `W2-CHAT-E` / `W3-CONTEXT-E` 必要链路通过 | `<PASS/FAIL/BLOCKED>` | `<REPORT_REF>` |
| 工作区内已至少完成一次长文本分析 | `<PASS/FAIL/BLOCKED>` | `<JOB_DIR>` |
| 任务控制区、日志中心入口可打开 | `<PASS/FAIL/BLOCKED>` | `<SCREENSHOT>` |

## 3. 脚本执行记录

### macOS shell

```bash
npm run test:task-process-acceptance -- --list-profiles --db "<DB>"
npm run test:task-process-acceptance -- --dump-manual "<man.json>"
npm run test:task-process-acceptance -- --workspace "<WS>" --db "<DB>" --tester-id "<ID>" --json
npm run test:task-process-acceptance -- --workspace "<WS>" --db "<DB>" --manual "<man.json>" --output "<OUT_DIR>" --json
```

- 退出码：`<EXIT_CODE>`（应与 `result.json.exitCode` 一致）
- stdout 最终四行：`<CAPTURE_OR_TERMINAL_REFERENCE>`
- stderr/诊断：`<CAPTURE_OR_TERMINAL_REFERENCE>`
- JSON 结果：`<RESULT_JSON_FILE>`
- 诊断日志：`<DIAGNOSTICS_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`
- 人工观察回填：`<MANUAL_JSON_FILE>`

## 4. 机器核查观察记录（`TASK-CHK-*`）

| 用例 | 实际结果 | 断言/输出 | 结论 |
| --- | --- | --- | --- |
| `TASK-CHK-001` 环境与版本探针 | `<RESULT>` | OS/版本/Git SHA/工作区干净 | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-002` 模型配置可读 | `<RESULT>` | profile/connection 只读解析 | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-003` 任务目录定位 | `<RESULT>` | `.vinkey/analysis/jobs/` 至少一个任务 | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-004` 任务产物完整性 | `<RESULT>` | 四个必需产物存在 | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-005` 事件序列与段标签 | `<RESULT>` | sequence 连续、段标签一致、已完成段带 `endedAt` | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-006` 任务终态与产物快照 | `<RESULT>` | completed 且 `pipelineCompleted=true`、内容非空 | `<PASS/FAIL/BLOCKED>` |
| `TASK-CHK-007` 结果与清单写入 | `<RESULT>` | `result.json` + `SHA256SUMS` 生成 | `<PASS/FAIL/BLOCKED>` |

## 5. 人工 UI 观察记录（`TASK-UI-*`）

| 用例 | 实际步骤 | 预期 | 实际结果 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `TASK-UI-001` 暂停/继续快照 | `<STEPS>` | CP-42 降级；恢复新段且不覆盖旧记录 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-002` 停止确认与部分结果 | `<STEPS>` | CP-49 确认文案；终态“已停止”；部分结果 CP-52 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-003` 两层折叠与自动跟随 | `<STEPS>` | CP-48 新记录通知；滚动/翻页停止跟随 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-004` 分页与历史边界 | `<STEPS>` | CP-33/34/47/53 文案 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-005` 产物预览与只读 | `<STEPS>` | CP-28/51 只读预览与失效提示 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-006` 源变化拒绝恢复 | `<STEPS>` | CP-35 提示且不沿用旧检查点 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-007` 失败重试与步骤重跑 | `<STEPS>` | CP-50 确认文案与重跑范围 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-008` 重启恢复历史 | `<STEPS>` | NT-005 事件/产物/终态完整 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `TASK-UI-009` 窄栏/键盘/无障碍 | `<STEPS>` | UX-16/UX-17 可读可点无溢出、状态播报一次 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |

## 6. 问题与材料索引

| 编号 | 类型 | 复现步骤 | 影响 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `<ISSUE_ID>` | `<BUG/BLOCKER/OBSERVATION>` | `<STEPS>` | `<P0/P1/P2>` | `<FILE>` | `<OPEN/FIXED/WAIVED>` |

建议归档：

```text
task-process-<YYYYMMDD>-macos-<profile-safe-name>/
├── environment.md
├── result.json
├── SHA256SUMS
├── diagnostics.json
├── manual-observations.json
├── screenshots/
├── recordings/
└── ui-observations.md
```

不得上传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。

## 7. 回填结论

- 机器核查结论：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 结论：`<PASS/FAIL/BLOCKED/待回填>`
- 未执行用例：`<CASE_IDS_AND_REASON>`
- 证据完整性：`<COMPLETE/INCOMPLETE>`
- 遗留问题：`<FOLLOW_UP_ITEMS>`（含安全点回执 CP-42 降级说明）
- 下一次复审：`<VERSION_OR_DATE>`
