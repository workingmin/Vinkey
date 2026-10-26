# 项目与会话导航本地验收回填模板

本模板供测试人员分阶段执行 `W0-NAV-F`、`W2-NAV-E` 和 `W4-NAV-R`。所有 `<...>` 均为待填占位符；未执行或缺少必要证据时不得填写 `PASS`。

## 1. 执行元数据

- 执行门槛：`<W0-NAV-F / W2-NAV-E / W4-NAV-R>`
- 执行人/日期：`<TESTER> / <YYYY-MM-DD HH:mm TZ>`
- 操作系统/版本/架构：`<OS> / <VERSION> / <x64|arm64>`
- 显示缩放/DPI、窗口尺寸：`<SCALE> / <SIZE>`
- Vinkey 版本/Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js/Rust/Tauri：`<VERSIONS>`
- Ollama/兼容服务/模型/Profile：`<N/A_FOR_W0-NAV-F 或脱敏值>`
- 脚本 ID/版本：`<SCRIPT_ID>@<VERSION>`

## 2. fixture 与前置状态

### 2.1 `W0-NAV-F`

| 项目 | 脱敏值/数量 | 证据 |
| --- | --- | --- |
| 临时根目录 | `<REDACTED_TEMP_ROOT>` | `<CREATION_LOG>` |
| 项目 | `<至少 2>` | `<FIXTURE_MANIFEST>` |
| 每项目会话 | `<至少 2>` | `<FIXTURE_MANIFEST>` |
| 中英文文档 | `<COUNT_AND_TYPES>` | `<SHA256_OR_MANIFEST>` |
| 测试数据库 | `<ISOLATED_DB_ID>` | `<DB_SETUP_LOG>` |
| 清理策略 | `<OWNED_PATHS_ONLY>` | `<CLEANUP_RESULT>` |

### 2.2 `W2-NAV-E`

| 检查项 | 结果 | 证据/备注 |
| --- | --- | --- |
| `W1-MODEL-E` 必要链路通过 | `<PASS/FAIL/BLOCKED>` | `<REPORT_REF>` |
| `W2-CHAT-E` 可完成真实多轮对话 | `<PASS/FAIL/BLOCKED>` | `<REPORT_REF>` |
| 两个项目各至少三条会话 | `<PASS/FAIL/BLOCKED>` | `<SESSION_MANIFEST>` |
| `CF-022`/`CF-023` 已定稿且实现 | `<PASS/FAIL/BLOCKED>` | `<DECISION_AND_BUILD_REF>` |

### 2.3 `W4-NAV-R`

| 前置状态 | 可复现结果 | 证据 |
| --- | --- | --- |
| 生成中会话 | `<YES/NO/BLOCKED>` | `<...>` |
| 运行中后台任务 | `<YES/NO/BLOCKED>` | `<...>` |
| 未保存文档 | `<YES/NO/BLOCKED>` | `<...>` |
| 可控延迟搜索/加载 | `<YES/NO/BLOCKED>` | `<...>` |

## 3. 脚本执行记录

### macOS/Linux shell

```bash
<COMMAND_USED>
```

### Windows PowerShell

```powershell
<COMMAND_USED>
```

- 退出码：`<EXIT_CODE>`（应与 `result.json.exitCode` 一致）
- stdout 最终四行：`<CAPTURE_OR_TERMINAL_REFERENCE>`（脚本不生成 `stdout.txt`）
- stderr/诊断：`<CAPTURE_OR_TERMINAL_REFERENCE>`
- JSON 结果：`<RESULT_JSON_FILE>`
- fixture/session manifest：`<MANIFEST_FILE>`
- 诊断日志：`<DIAGNOSTICS_FILE>`
- SHA-256 清单：`<SHA256SUMS_FILE>`

## 4. `W0-NAV-F` 观察记录

| 用例 | 实际步骤 | 预期 | 实际结果 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `NAV-F-001` 项目登记/去重 | `<STEPS>` | 两项目可辨认；重复目录不新增记录 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-F-002` 项目切换/隔离 | `<STEPS>` | 状态不串项目；过期响应不回写 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-F-003` 会话 CRUD | `<STEPS>` | 每项目会话独立，新建/恢复/删除正确 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-F-004` 删除边界 | `<STEPS>` | 只删应用记录，fixture 文件仍存在 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-F-005` 当前搜索 | `<STEPS>` | 范围、结果、无结果和上限可解释 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-F-006` 状态与恢复 | `<STEPS>` | 加载/错误/重试不重复提交 | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |

## 5. `W2-NAV-E` 观察记录

| 用例 | 项目/会话/轮次 | 标题或搜索前后状态 | 实际结果与证据 | 结论 |
| --- | --- | --- | --- | --- |
| `NAV-E-001` 多项目多会话 | `<REDACTED_IDS_AND_TURNS>` | `<STATE>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-E-002` 临时标题 | `<SESSION>` | `<INPUT -> FALLBACK_TITLE>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-E-003` 语义标题/失败回退 | `<SESSION>` | `<BEFORE -> AFTER>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-E-004` 手动命名优先 | `<SESSION>` | `<MANUAL -> AFTER_NEW_TURNS>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-E-005` 全局搜索 | `<ENTRY_AND_QUERY>` | `<GROUP -> TARGET -> RETURN>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-E-006` 跨项目恢复 | `<SOURCE_AND_TARGET>` | `<EXPECTED_SCOPE>` | `<RESULT_AND_FILE>` | `<PASS/FAIL/BLOCKED>` |

## 6. `W4-NAV-R` 观察记录

| 用例 | 前置状态 | 用户动作 | 保护/恢复结果 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `NAV-R-001` 生成中切换 | `<STATE>` | `<ACTION>` | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-R-002` 任务中切换/删除 | `<STATE>` | `<ACTION>` | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-R-003` 未保存文档 | `<STATE>` | `<ACTION>` | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-R-004` 过期搜索结果 | `<STATE>` | `<ACTION>` | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |
| `NAV-R-005` 失败恢复 | `<STATE>` | `<ACTION>` | `<RESULT>` | `<FILE>` | `<PASS/FAIL/BLOCKED>` |

## 7. 问题与材料索引

| 编号 | 类型 | 复现步骤 | 影响 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `<ISSUE_ID>` | `<BUG/BLOCKER/OBSERVATION>` | `<STEPS>` | `<P0/P1/P2>` | `<FILE>` | `<OPEN/FIXED/WAIVED>` |

建议归档：

```text
navigation-<gate>-<YYYYMMDD>-<platform>/
├── environment.md
├── fixture-or-session-manifest.json
├── result.json
├── SHA256SUMS
├── diagnostics.txt
├── screenshots/
├── recordings/
└── ui-observations.md
```

不得上传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。

## 8. 回填结论

- 当前门槛：`<PASS/FAIL/BLOCKED/待回填>`
- 未执行用例：`<CASE_IDS_AND_REASON>`
- 证据完整性：`<COMPLETE/INCOMPLETE>`
- 遗留问题：`<FOLLOW_UP_ITEMS>`
- 下一次复审：`<VERSION_OR_DATE>`
