# 长任务过程原生复验清单（macOS）

> 平台说明：本文档是 `NT-001..NT-005` 的 macOS 平台执行清单；Windows 平台见 [长任务过程原生复验清单（Windows）](../windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md)。共享合同、原用例编号与通过标准见 [共享合同与平台任务分派索引](../TASK_PROCESS_NATIVE_ACCEPTANCE.md)；平台边界、结论范围与人工复核统一后置等共性口径统一在该索引首部说明，本文档不重复。

- 功能域：`D-TASK-LOG` 日志中心与长任务
- 归属门槛：`W4-TASK-E`；竞品证据 [`CF-006`](../../../competitors/FEATURE_DECISIONS.md)
- 验收脚本：`UI-ACC-LOGS-001`（`scripts/task-process/`）
- 前置驱动：`npm run test:task-process-ollama-driver`（真实 Ollama CLI 驱动 + 生产 pipeline，产出客观机器证据）
- 桌面原生 runner：`npm run test:task-process-native-mac -- --driver-workspace <WS>`（`scripts/task-process/`，真实 Tauri app + 隔离 fixture + AX 原生自动化，判定可机器判定的客观子断言；套件 `UI-ACC-TASK-NATIVE-001`）
- 平台专项报告：[长任务/日志中心专项验收（macOS）](./UI_ACCEPTANCE_MACOS_TASK_PROCESS.md)
- 回填模板：[长任务/日志中心回填模板（macOS）](./UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md)
- 平台状态：`NT-MAC-001`~`005` 的客观断言已由桌面原生 runner 采集并判定（`UI-ACC-TASK-NATIVE-001` 最新批次，`decision.specialityPass=true`，专项通过（Alpha 客观范围））；源变化拒绝恢复由真实 app 恢复读回，观感/易理解性与新段推进仍归 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理)；`TASK-CHK-*` 客观机器证据已在 [专项报告](./UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) 定稿（证据边界见共享合同首部）
- 更新日期：`2026-11-16`

## 1. 平台前置条件

| 条件 | macOS 要求 | 不满足时 |
| --- | --- | --- |
| 目标应用 | 已安装的 Tauri 桌面包；记录版本、构建号与嵌入 Git SHA | 对应任务记 `BLOCKED` |
| 模型链路 | 本地模型可用并完成 `W1-MODEL-E` 准入 | 对应任务记 `BLOCKED` |
| 真实任务 | 打开含多个 `.md/.txt` 的授权项目，完成一次长文本分析，`.vinkey/analysis/jobs/<jobId>/` 留有产物 | 对应任务记 `BLOCKED` |
| 控制动作 | 从输入区上方暂停任务并恢复一次 | `NT-MAC-002` 记 `BLOCKED` |
| 脚本入口 | `npm run test:task-process-acceptance:sh` 可执行，`.sh` 包装与 Tauri 构建依赖完整 | 对应任务记 `BLOCKED` |
| 证据归档 | 可保存 `result.json`、`SHA256SUMS`、诊断日志、人工观察回填与截图/录屏索引 | 对应任务记 `BLOCKED` |

## 2. 平台任务拆分

`NT-001..NT-005` 原用例 ID、场景与通过标准保持不变；`NT-MAC-*` 仅为本平台执行分派编号，不进入 `result.json` 的 `cases[].caseId`，不新增第五种状态。视觉观感、文案易理解性与 UX 可理解性（`DEFER-UI-006`）按 [总计划 §8.5](../UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 统一后置，不得写成 `PASS` 或删除；下表「留在 Alpha 的客观断言」仍须在 macOS 目标平台执行并读回。

| 平台任务 | 原用例 | 平台执行动作 | 留在 Alpha 的客观断言 | 证据入口 | 平台状态 |
| --- | --- | --- | --- | --- | --- |
| `NT-MAC-001` | `NT-001` 执行中事件记录 | 在真实长文本分析执行中观察事件顺序与任务状态栏；脚本只读核查 `.vinkey/analysis/jobs/<jobId>/` 产物 | 每个真实事件按顺序显示：sequence 从 1 连续递增、段标签与阶段映射一致、已完成段带 `endedAt`；任务状态栏常显且与 Worker 状态一致（状态读回） | `TASK-CHK-005`；`TASK-NAT-001`（状态栏/段标签读回、事件顺序与 `endedAt` 机器判定）、截图 | 客观项已自动化判定；观感归 §8.5 |
| `NT-MAC-002` | `NT-002` 暂停/恢复快照 | 暂停后恢复，保存暂停与恢复前后截图/录屏及事件对照 | 恢复后出现新推进段、不覆盖暂停前记录；暂停文案为 CP-42「已暂停后续步骤」降级，不得写成 CP-05「已暂停」 | `TASK-NAT-002`（暂停态控件映射客观判定）；恢复后新段推进与 CP-42 易理解性归 `TASK-UI-001` §8.5 | 控件映射已自动化；新段推进归 §8.5 |
| `NT-MAC-003` | `NT-003` 源变化拒绝恢复 | 播种暂停态前置条件；修改真实源文件后在真实 app 中 AX 点击「继续处理」，记录指纹、恢复提示与检查点状态 | 提示「原文已变化，无法沿用此前进度。请重新发起分析。」且不沿用旧检查点（指纹变化、`failed` 终态、`worker.compatibility_mismatch`、无 `checkpoint` 复用事件、无新完整产物、AX 提示可见） | `TASK-NAT-003`（真实 app 恢复读回）+ 截图；CP-35 文案易理解性仍归 `TASK-UI-006` §8.5 | 客观项已自动化判定；易理解性归 §8.5 |
| `NT-MAC-004` | `NT-004` 两层折叠保持 | 执行第一层批量展开/收起，检查第二层详情选择与公开响应位置 | 第一层批量操作不重置第二层详情选择；公开响应位于折叠外 | `TASK-NAT-004`（批量按钮按压回执与段展开态读回）；第二层选择/交互手感归 `TASK-UI-003` §8.5 | 客观项已自动化判定；观感归 §8.5 |
| `NT-MAC-005` | `NT-005` 重启恢复历史 | 重启应用并重开会话，对照重启前后任务记录 | 原任务事件、产物与终态完整可见（产物清单与终态读回） | `TASK-CHK-006`；`TASK-NAT-005`（重启前后状态栏与段标签读回）、截图；目视确认归 `TASK-UI-008` §8.5 | 客观项已自动化判定；目视归 §8.5 |

## 3. 执行步骤（macOS）

```bash
# 1) 真实作业产物（TASK-CHK-* 前置）
npm run test:task-process-ollama-driver -- --dry-run --db "<DB>"
npm run test:task-process-ollama-driver -- --db "<DB>"
npm run test:task-process-acceptance:sh -- --list-profiles --db "<DB>"
npm run test:task-process-acceptance:sh -- --workspace "<WS>" --db "<DB>" --tester-id "<ID>" --json

# 2) 桌面原生 runner：真实 app + 隔离 fixture + AX，判定 NT-MAC-* 客观子断言
npm run test:task-process-native-mac -- --driver-workspace "<WS>"

# 3) 人工观察回填（§8.5 主观项）
npm run test:task-process-acceptance:sh -- --dump-manual "<man.json>"
npm run test:task-process-acceptance:sh -- --workspace "<WS>" --db "<DB>" --manual "<man.json>" --output "<OUT_DIR>" --json
```

1. 以 `--list-profiles` 只读确认模型 profile；缺失或不可读时按前置条件记 `BLOCKED`。CLI 驱动只覆盖 `TASK-CHK-*` 客观机器证据。
2. 桌面原生 runner 需先无残留 Vinkey 进程、显示器保持唤醒（`.sh` 包装已用 `caffeinate`）；它把真实作业事件播种进隔离 fixture，在真实 Tauri app 中打开会话并按 AX 读回状态栏、段标签、暂停/继续控件与展开态。对 `NT-MAC-003`，runner 以暂停态播种为前置条件，随后修改真实源文件并在真实 app 中 AX 点击「继续处理」，由生产后端复核指纹并写入失败终态与拒绝提示；脚本只读回结果、截图与任务产物。它不证明初始任务由真实用户桌面 UI 发起；新段推进与观感/易理解性仍归 §8.5。
3. 以 `--dump-manual` 生成人工观察回填模板，供 §8.5 主观项统一回填。
4. 以 `--json` 运行机器核查，核对 stdout 四行与退出码等于 `result.json.exitCode`；`TASK-CHK-*` 只读核查任务产物，不调用模型。
5. 以 `--manual` 合并人工观察，归档 `result.json`、`SHA256SUMS`、诊断日志与人工观察回填文件；fixture 或浏览器 companion 不得冒充目标平台原生证据。

## 4. 证据归档与判定

- 归档目录按 [回填模板（macOS）](./UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md) §6 命名，原始路径在回填前脱敏；不得上传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。
- `result.json` 的 `cases[].status` 只用 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE`；`DEFERRED_AFTER_ALPHA` 仅是计划层排期状态，不进入 JSON、不参与覆盖率或计数。
- 判定：本平台 5 项客观断言全部取得 macOS 目标平台证据、`TASK-CHK-*` 机器核查通过、退出码为 0 且 `SHA256SUMS` 可核验，方可关闭 `CF-006` 在 macOS 侧的原生复验风险；否则继续保留「部分参考」状态。`UI-ACC-TASK-NATIVE-001` 以 `decision.specialityPass=true`、`overallConclusion=专项通过` 表示 Alpha 客观范围达标；`evidencePackage` 中的主观项归 §8.5，不计入该结论。
- 该结论为 macOS 单平台结论；审核结论以平台专项报告与最新批次 `result.json` 为准。平台边界与整体发布口径见 [共享合同与平台任务分派索引](../TASK_PROCESS_NATIVE_ACCEPTANCE.md) 首部。
