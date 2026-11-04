# 长任务/日志中心专项验收报告模板（macOS）

> **平台说明**：本文档是 macOS 平台版；Windows 平台验收见 [UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md](../windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md)。验收合同、用例矩阵与设计断言跨平台一致，仅执行入口（`.sh` / PowerShell）、脚本命令和平台证据按平台分别记录。

- 功能域：`D-TASK-LOG` 日志中心与长任务
- 验收标识：`W4-TASK-E`
- 验收对象：[TASK_PROCESS_COPY_DESIGN.md](../../../design/ui/TASK_PROCESS_COPY_DESIGN.md)（§4 任务过程拆解、§5 文案目录、§7 状态依据、§8 评审示例、§9.2 UX 验收清单）
- 验收脚本：`UI-ACC-LOGS-001`（`scripts/task-process/`，入口 `npm run test:task-process-acceptance`）
- 回填模板：[UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md](./UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md)
- 关联原生复验：[TASK_PROCESS_NATIVE_ACCEPTANCE.md](../TASK_PROCESS_NATIVE_ACCEPTANCE.md)（`NT-001..NT-005`）
- 报告状态：设计结论与实现基线已定稿，脚本与回填模板已就绪；真实桌面执行与人工观察材料待回填
- 更新日期：`2026-11-02`

## 1. 验收边界

`W4-TASK-E` 是真实端到端门槛：只读核查真实长文本分析任务在 `.vinkey/analysis/jobs/<jobId>/` 留下的事件/段/终态/产物，并采集测试人员在桌面端的人工 UI 观察。它不重复证明基础对话链路（`W2-CHAT-E`），也不替代 `W0-SHELL-P` 的原生窗口平台验收。

| 可证明 | 不能证明 |
| --- | --- |
| 真实任务的事件序列、段标签与段结束事实（CP-13/19~25/27/R8） | 未执行时的模型调用质量（由 `W1-MODEL-E`/`W2-CHAT-E`/`W3-CONTEXT-E` 负责） |
| 任务终态与产物快照（`worker-output.json`、checkpoint 清单、`analysis.md` 等） | 已装安装包内嵌 gitSha（由 `W0-SHELL-P` 原生窗口验收负责） |
| 暂停/恢复快照、停止确认、折叠/自动跟随、产物预览、重启恢复、源变化拒绝、失败重试等人工 UI 行为 | 未实现的安全点暂停回执：当前只能验证 CP-42“已暂停后续步骤”，不得写成 CP-05“已暂停” |
| 环境前置（OS/版本、Vinkey 版本/Git SHA、模型 profile 只读） | 浏览器或 mock 证据替代目标平台真实桌面证据 |

## 2. 当前实现基线

A/B/C 三个阶段均已落地（提交 `97c4e18`、`6f6990e`、`a30c80f`）：

| 阶段 | 能力 | 代码证据 | 测试证据 |
| --- | --- | --- | --- |
| A：一致文案与界面 | 固定标题“处理过程”、状态/动作/停止统一、streaming 回退修正、动作单显 | `src/components/MessageActivity.tsx`、`src/components/ConversationTaskControls.tsx`、`src/lib/chatActivity.ts` | `MessageActivity.test.tsx`、`ConversationTaskControls.test.tsx` |
| B：必要事实补齐 | 请求发起边界（CP-15）、初始段“准备任务”（CP-13）、段结束事实（CP-27/R8，`ProcessSegment.endedAt`）、继续/重新段标签（CP-29/31） | `src/types.ts`、`src/store.ts`、`src-tauri/src/worker_service.rs` | Worker harness（`tests/worker-harness/`）与组件测试 |
| C：阅读与控制验证 | 自动跟随与“有新记录 · 查看最新记录”（CP-48）、控制失败释放动作锁、停止/步骤重试确认（CP-49/50） | `MessageActivity.tsx`、`ConversationTaskControls.tsx` | `MessageActivity.test.tsx`、`ConversationTaskControls.test.tsx` |

余留事项（纳入人工 UI 用例，未实现前不得按通过记录）：

- 暂停安全点回执：原生端当前只设置暂停标志，只验证 CP-42。
- 活动失败→任务失败映射：任务失败仅由生命周期确定（UX-10）。
- 真实桌面暂停/恢复/停止、IME/键盘/窄栏验收（UX-08/09/16/17）。

源码存在与组件测试通过不等于目标平台验收通过；本报告结论以脚本执行证据与人工观察为准。

## 3. `W4-TASK-E` 验收矩阵

用例编号与脚本 `result.json` 的 `cases[].caseId` 保持一致（`TASK-CHK-*` 机器核查、`TASK-UI-*` 人工回填），便于审核人员把报告与脚本证据一一对应。

### 3.1 机器核查用例（读取真实产物，不调用模型）

| 用例 | 断言 | 当前结论 |
| --- | --- | --- |
| `TASK-CHK-001` 环境与版本探针 | 记录 OS/版本/arch、Node、Rust、Tauri CLI/框架、Ollama、Vinkey 版本与 Git SHA、工作区是否干净 | 待执行 |
| `TASK-CHK-002` 模型配置可读（只读 SQLite） | 解析出已持久化或显式指定的 profile 与 connection；缺失时 BLOCKED | 待执行 |
| `TASK-CHK-003` 任务目录定位 | 在工作区 `.vinkey/analysis/jobs/` 找到至少一个任务；无任务时 BLOCKED | 待执行 |
| `TASK-CHK-004` 任务产物完整性 | `job-start.json`、`worker-events.json`、`worker-input.json`、`worker-checkpoints.json` 存在 | 待执行 |
| `TASK-CHK-005` 事件序列与段标签 | sequence 从 1 连续递增；段标签与阶段映射一致（或“继续/重新”前缀）；已完成段带 `endedAt`（CP-27/R8） | 待执行 |
| `TASK-CHK-006` 任务终态与产物快照 | completed 任务：`worker-output.json` 存在、`pipelineCompleted=true`、内容非空；非 completed 任务 BLOCKED | 待执行 |
| `TASK-CHK-007` 结果与 SHA-256 清单写入 | `result.json` 与 `SHA256SUMS` 成功写入 | 待执行 |

### 3.2 人工 UI 用例（测试人员在桌面回填）

| 用例 | 对应设计验收项 | 必须满足的可观察结果 | 当前结论 |
| --- | --- | --- | --- |
| `TASK-UI-001` 暂停/继续快照 | NT-002 / UX-08 / CP-41/42/05/29 | 暂停显示“已暂停后续步骤”（CP-42 降级）；恢复产生新推进段且不覆盖暂停前记录；普通短回答无暂停按钮 | 待回填 |
| `TASK-UI-002` 停止确认与部分结果保留 | UX-09/UX-13 / CP-49/52/07 | 停止确认文案“停止此任务？已生成的内容和已保存的分析文件会保留。”；确认后终态“已停止”；无结果不建空卡片；有输出显示“部分结果” | 待回填 |
| `TASK-UI-003` 两层折叠与自动跟随 | UX-04/UX-05 / CP-48/09 | “展开全部过程/收起全部过程”只控第一层；滚动/翻页/展开详情停止跟随；新记录出现“有新记录 · 查看最新记录” | 待回填 |
| `TASK-UI-004` 分页与历史边界 | UX-05/UX-12 / CP-10/33/34/47/53 | 分页页码准确；缺失/读取失败/为空/保存失败按对应文案；不补造记录、不覆盖已知终态 | 待回填 |
| `TASK-UI-005` 产物预览与只读 | UX-14 / CP-28/51 | 只读预览、文件名单与实际一致；失效/读取异常有提示；关闭返回触发按钮 | 待回填 |
| `TASK-UI-006` 源变化拒绝恢复 | NT-003 / UX-13 / CP-35 | 修改源文件后恢复提示“原文已变化，无法沿用此前进度。请重新发起分析。”且不沿用旧检查点 | 待回填 |
| `TASK-UI-007` 失败重试与步骤重跑 | UX-10 / CP-50/32/31 | 可从指定步骤重试，确认文案正确；尝试次数对应当前调用；重跑范围先说明 | 待回填 |
| `TASK-UI-008` 重启恢复历史 | NT-005 / UX-15 | 重启应用并重开会话，事件、产物与终态完整；默认折叠按设计 | 待回填 |
| `TASK-UI-009` 窄栏/键盘/无障碍 | UX-16/UX-17 | 360px 对话栏、200% 缩放、长中文文件名可读可点、无整页横向溢出；键盘/读屏语义正确 | 待回填 |

### 3.3 设计验收项覆盖映射

| 设计验收项 | 覆盖用例 | 说明 |
| --- | --- | --- |
| UX-01 普通请求流程 | `TASK-CHK-005` + `TASK-UI-001` | 准备/等待/生成段标签由机器核查，普通短回答中性兜底由人工观察 |
| UX-02 无活动文本/未知类型 | `TASK-UI-004` | 中性降级，不生成虚构动作 |
| UX-03 两次同名读取去重 | `MessageActivity.test.tsx` + `TASK-CHK-005` | 稳定身份去重由组件测试覆盖，事件序列由机器核查 |
| UX-04 / UX-05 折叠与分页 | `TASK-UI-003` / `TASK-UI-004` | 人工观察 |
| UX-06 选段/概况/复用结果 | `TASK-CHK-005` + `TASK-UI-007` | 复用结果文案与真实范围由人工观察，段标签由机器核查 |
| UX-07 片段/阶段/任务完成分层更新 | `TASK-CHK-005` + `TASK-CHK-006` | 段结束事实与终态由机器核查 |
| UX-08 / UX-09 暂停、停止与控制失败 | `TASK-UI-001` / `TASK-UI-002` | 人工观察；安全点回执未实现，只验 CP-42 |
| UX-10 失败重试与步骤重跑 | `TASK-UI-007` | 人工观察 |
| UX-11 修改建议/记忆候选待审 | `TASK-UI-002`（部分） | 待审入口与已完成回答分离，纳入人工观察备注 |
| UX-12 过程缺失/读取失败/为空/保存失败 | `TASK-UI-004` | 人工观察 |
| UX-13 源变化拒绝、停止/失败部分输出 | `TASK-UI-006` / `TASK-UI-002` | 人工观察 |
| UX-14 文件预览、失效文件、保存失败 | `TASK-UI-005` | 人工观察 |
| UX-15 切换会话、原生重启、恢复后台任务 | `TASK-UI-008` | 人工观察 |
| UX-16 / UX-17 窄栏、键盘与无障碍 | `TASK-UI-009` | 人工观察 |
| UX-18 多任务归属与控制能力约束 | `TASK-UI-002` + `TASK-UI-007` | 停止不误停其他任务、无法操作时原因可读，纳入人工观察 |
| NT-001 执行中事件记录 | `TASK-CHK-005` | 任务状态栏与 Worker 状态一致由人工确认 |
| NT-002 暂停/恢复快照 | `TASK-UI-001` | 人工观察 |
| NT-003 源变化拒绝恢复 | `TASK-UI-006` | 人工观察 |
| NT-004 两层折叠保持 | `TASK-UI-003` | 人工观察 |
| NT-005 重启恢复历史 | `TASK-UI-008` | 人工观察 |

## 4. 脚本与自动化计划

| 脚本 ID | 门槛 | 代码位置 | 输出 | 状态 |
| --- | --- | --- | --- | --- |
| `UI-ACC-LOGS-001` | `W4-TASK-E` | `scripts/task-process/task-process-acceptance.ts`（TS 核心）、`run-task-process-acceptance.{mjs,sh,ps1}`（入口） | `result.json`、`SHA256SUMS`、诊断日志、人工观察模板 | 脚本已有，待本地执行 |
| 合同测试 | `W4-TASK-E` | `tests/task-process/task-process-acceptance-cli.test.ts` | 参数/退出码/`--json` 单文档/字段稳定性 | 已有 |

脚本遵循 [UI_ACCEPTANCE_SCRIPT_SPEC.md](../UI_ACCEPTANCE_SCRIPT_SPEC.md)：只读 SQLite 与任务产物；`--workspace` 缺省时仅在系统临时目录生成 fixture 本地文件，不写入用户项目；stdout 固定四行，`--json` 只输出单个 JSON 文档；退出码 `0`（机器层通过/待人工）、`1`（参数或基础设施异常）、`2`（业务断言失败）。macOS 使用 `run-task-process-acceptance.sh` / `.mjs` 入口。

测试人员执行顺序：

1. `npm run test:task-process-acceptance -- --list-profiles --db <vinkey.sqlite3>` 确认模型 profile。
2. `npm run test:task-process-acceptance -- --dump-manual <man.json>` 生成人工观察回填模板。
3. 在 Vinkey 中对脚本给出的 fixture 工作区（或指定 `--workspace`）发起长文本分析，等待完成。
4. 执行 `npm run test:task-process-acceptance -- --workspace <ws> --db <db> --json`，机器核查任务产物。
5. 测试人员按回填模板在桌面完成人工用例，填写 `<man.json>` 后以 `--manual <man.json>` 重新执行合并。

## 5. 测试人员必须回传的材料

- 操作系统、架构、可脱敏版本信息、Vinkey 版本与 Git SHA（`result.json` 内亦有，需脱敏后归档）。
- 模型/profile 信息（不含密钥）与连接类型。
- 命令、`result.json`、`SHA256SUMS`、诊断日志、人工观察回填文件（`--manual`）及截图/录屏索引。
- 每个 `TASK-UI-*` 用例的操作记录、实际结果与证据文件。
- 未执行或阻断项必须说明原因，不得以源码存在或组件测试代替平台验收。

不得回传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。

## 6. 当前结论

- `W4-TASK-E`：设计与用例已定稿，脚本与回填模板已就绪；真实桌面执行证据与人工观察材料待回填，当前**不可判定通过**。
- 暂停安全点回执未实现：只能记录 CP-42 降级结果，不得写 `CP-05`/`已暂停`。
- 源码与组件测试只作为脚本设计的实现基线，不替代平台验收。

## 7. 测试人员回填区

- 机器核查结论：`<PASS/FAIL/BLOCKED + result.json + SHA256SUMS>`
- 人工 UI 结论：`<PASS/FAIL/BLOCKED/待回填 + 各 TASK-UI-* 观察>`
- 综合结论：`<PASS/FAIL/BLOCKED/待回填>`
- 问题列表：`<ISSUES>`
- 下一次复审版本/日期：`<NEXT_REVIEW>`
