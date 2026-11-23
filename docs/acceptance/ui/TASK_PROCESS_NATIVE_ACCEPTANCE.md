# 长任务过程原生复验清单（共享合同与平台任务分派索引）

> 共性口径（统一在此说明，各平台清单与下表单元格不重复）：
> - 平台边界：`NT-001..NT-005` 的执行任务按 macOS / Windows 拆分至 [macOS 版清单](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md) 与 [Windows 版清单](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md)；两版共享本文件的合同、用例编号与通过标准，仅执行入口和证据按平台区分。Windows 执行属独立 Windows 专项：`TASK-CHK-*` 机器核查已定稿，`NT-WIN-*` 桌面原生断言已由 Windows UI Automation runner 逐项判定并达成 Alpha 客观范围专项通过；不计入 macOS 结论，反之亦然。任何单平台结论均不宣称跨平台发布通过 / 整体发布通过。
> - 结论范围：`W4-TASK-E` 的机器核查（`TASK-CHK-*`）、事件/段标签/终态/产物读回、状态映射与流程断言等客观项一律留在 Alpha，按目标平台执行；视觉观感、文案易理解性与 UX 可理解性（`DEFER-UI-006`）等主观/人工判断项按 [总计划 §8.2](./UI_ACCEPTANCE_PLAN.md) 集中至 [§8.5 人工复核统一批次](./UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理)，待全部自动化验收脚本跑完后统一回填，不得写成 `PASS`、不得删除、不得据此放宽客观断言。
> - 状态口径：`result.json` 的 `cases[].status` 只用 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE`；`NOT_EXECUTED` 与 `DEFERRED_AFTER_ALPHA` 仅是计划层平台/排期状态，不进入 JSON、不参与覆盖率或计数。
> - 证据边界：源码存在、组件测试、Playwright/浏览器 companion 与隔离 fixture 均不代替目标平台原生证据；未执行或阻断项必须逐项说明原因。各平台清单只写该平台自身结论与证据。
> - CLI 驱动证据边界：`npm run test:task-process-ollama-driver` 通过 `include!` 复用生产 `worker_service.rs` pipeline 并调用真实 Ollama，产出 `TASK-CHK-*` 客观机器证据；该证据非桌面 UI 发起，不代替 `NT-MAC-*` / `NT-WIN-*` 的桌面执行，也不证明暂停/停止/折叠/自动跟随/产物预览/重启恢复等交互行为。`NT-MAC-003` 的源变化拒绝另由桌面原生 runner 修改真实源文件并在真实 app 中按「继续处理」，由生产后端复核指纹后写入失败状态与拒绝提示；初始任务由真实用户桌面 UI 发起的材料仍统一归 [§8.5 人工复核统一批次](./UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理)。

- 状态：macOS 侧 `TASK-CHK-*` 客观机器证据已定稿，`NT-MAC-001`~`005` 的客观断言均由桌面原生 runner 自动化判定，达成专项通过（Alpha 客观范围）（`UI-ACC-TASK-NATIVE-001`，`decision.specialityPass=true`）；Windows 侧 `TASK-CHK-*` 机器核查已定稿，`NT-WIN-001`~`005` 的客观断言均由 Windows UI Automation 桌面原生 runner 逐项判定，达成专项通过（Alpha 客观范围）（`UI-ACC-TASK-NATIVE-001`，`decision.specialityPass=true`）；两平台观感/易理解性归 §8.5
- 归属门槛：`W4-TASK-E` / `D-TASK-LOG`；竞品证据 [`CF-006`](../../competitors/FEATURE_DECISIONS.md)
- 验收脚本：`UI-ACC-LOGS-001`（`scripts/task-process/`）；前置驱动 `npm run test:task-process-ollama-driver`；桌面原生 runner `npm run test:task-process-native-mac` / `npm run test:task-process-native-win`（`UI-ACC-TASK-NATIVE-001`）
- 更新日期：`2026-11-23`

## 1. 共享复验合同

| 编号 | 场景 | 通过标准 |
| --- | --- | --- |
| NT-001 | 执行中事件记录 | 每个真实事件都按顺序显示；任务状态栏常显且与 Worker 状态一致 |
| NT-002 | 暂停/恢复快照 | 暂停再恢复后出现新推进段，不覆盖暂停前记录 |
| NT-003 | 源变化拒绝恢复 | 修改源文件后恢复，提示原稿已变化且不沿用旧检查点 |
| NT-004 | 两层折叠保持 | 第一层批量操作不重置第二层详情选择；公开响应位于折叠外 |
| NT-005 | 重启恢复历史 | 重启应用并重开会话，原任务事件、产物与终态完整可见 |

`NT-MAC-001..005` 与 `NT-WIN-001..005` 仅为平台执行分派编号，用于任务追踪；5 个原用例 ID 不删、不合并、不改名、不放宽断言。`result.json` 的 `cases[].caseId` 仍使用 `TASK-CHK-*` 与 `TASK-UI-*`，平台任务编号不写入机器结果。`NT-001..NT-005` 已并入长任务/日志中心专项验收（[macOS 版](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) / [Windows 版](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md)）的人工 UI 用例（`TASK-UI-001/003/006/008` 等），由 `UI-ACC-LOGS-001` 采集证据并回填平台回填模板（[macOS](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md) / [Windows](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md)）。

## 2. 平台任务分派索引

| 平台 | 平台任务 | 执行入口 | 证据归档 | 状态 | 平台清单 |
| --- | --- | --- | --- | --- | --- |
| macOS | `NT-MAC-001`~`NT-MAC-005` | `npm run test:task-process-ollama-driver` → `npm run test:task-process-acceptance:sh`；客观子断言 `npm run test:task-process-native-mac` | `task-process-<date>-macos-<profile-safe-name>/`；`artifacts/task-process-native/` | 专项通过（Alpha 客观范围） | [长任务过程原生复验清单（macOS）](./macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md) |
| Windows | `NT-WIN-001`~`NT-WIN-005` | `npm run test:task-process-acceptance:win`；客观子断言 `npm run test:task-process-native-win` | `task-process-<date>-windows-<profile-safe-name>/`；`artifacts/task-process-native/` | 专项通过（Alpha 客观范围） | [长任务过程原生复验清单（Windows）](./windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md) |

## 3. 前置条件与执行

1. 本地模型可用并已完成模型配置。
2. 打开一个包含多个 `.md/.txt` 文件的授权项目，完成一次长文本分析。
3. 发起长文本分析后，从输入区上方暂停任务并恢复一次。
4. 按目标平台清单 §3 的命令序列执行：先以 `--list-profiles` / `-ListProfiles` 只读确认 profile，再以 `--dump-manual` / `-DumpManual` 生成人工观察模板，在桌面完成对应用例后以 `--manual` / `-Manual` 合并结果。

## 4. 判定

- 每平台须各自取得 5 项客观断言的目标平台证据、`TASK-CHK-*` 机器核查通过、退出码为 0 且 `SHA256SUMS` 可核验，方可关闭 `CF-006` 在该平台的原生复验风险；否则继续保留「部分参考」状态。
- `UI-ACC-TASK-NATIVE-001` 的 `decision.specialityPass` 只覆盖这 5 项客观断言与构建溯源；`evidencePackage` 中的观感/易理解性项与 `humanReview` 引用 §8.5，不参与 Alpha 客观范围结论，不写成 `PASS`、不删除。`decision.specialityPass=true` 且 `overallConclusion=专项通过` 时仍不代表跨平台发布通过或整体发布通过。
- 两平台结论分别记录，不互相顶替、不回溯改写另一平台批次的 `result.json`；审核结论以平台专项报告与最新批次 `result.json` 为准。
