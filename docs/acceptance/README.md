# 验收文档审核入口

本目录集中维护验收计划、脚本规范、专项报告和执行回填模板，供验收人员与审核人员统一查阅。

## 表述与格式约定

以下约定适用于 `docs/acceptance/` 下全部文档；既有文档按本约定表述，引用旧批次时应保留被引文件的原始状态值，但不在正文复述历史结论。

### 结论术语

报告层结论按范围限定为 `通过（功能域单平台范围）`、`专项通过（Alpha 客观范围）`、`条件通过`、`不通过`、`阻断` 五类；`NOT_EXECUTED` 是平台专项未执行状态，不属于通过等级。正文中的结论词以普通文字书写，不用加粗；术语表、索引表结论列及机器字段值使用反引号代码样式。

| 术语 | 使用场景 | 限制 |
| --- | --- | --- |
| `通过（功能域单平台范围）` | 功能域在单一平台达到该域完整门槛，必要机器证据与目标平台材料齐备 | 仅限该功能域和平台；不等同于整体发布通过或跨平台发布通过 |
| `专项通过（Alpha 客观范围）` | 主观/人工项归总计划 §8.5 后，Alpha 客观自动化项全部通过 | 须以最新批次的机器证据链和独立门槛结论为准；不等同于 `通过（功能域单平台范围）` |
| `条件通过` | 尚有客观遗留项，且未达上述通过条件 | 不得用于已形成通过结论的功能域；不得用主观项制造条件通过 |
| `不通过` | 关键断言失败或目标不可达 | 保留失败证据，不放宽判据 |
| `阻断` | 环境、依赖或证据不足，无法获得结论 | 与 `NOT_EXECUTED` 区分：阻断是执行受阻，未执行是平台专项尚未启动 |
| `NOT_EXECUTED` | 平台专项未纳入当前执行范围 | Windows 独立专项使用；不计入 macOS 结论 |
| `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE` | `result.json.cases[].status` 四态或门槛的机器结论 | 仅以反引号代码样式出现，不替代报告层的中文结论术语 |
| `整体发布通过` / `跨平台发布通过` | 仅用于边界声明，不作 Alpha 专项结论 | 当前阶段不得宣称；发布层级结论由后续版本另行判定 |

除本节的术语定义外，不再使用 `完整通过`、`完整平台通过`、`完整发布通过`、无限定范围的 `通过` 或无限定范围的 `专项通过` 作为报告层结论。需要引用机器字段时写 `specialityPass=true`、`overallConclusion=专项通过` 等字面值，不改写为中文全称。

### Markdown 格式

- 不使用行内加粗承载结论、状态或强调语义；层级由标题、列表和表格列表达。
- 用例 ID、门槛 ID、脚本 ID、命令、状态值、字段名、文件路径和字段值使用反引号代码样式。
- 链接文字使用文档短名或功能域名，不在链接文字中重复结论。
- 表格只承载同类信息；索引表第二列统一命名为 `内容定位`，专项验收表第三列统一命名为 `当前结论`。
- 索引表单元格使用名词短语，按「覆盖对象或门槛；适用平台；证据或脚本入口」顺序书写，不写批次号、Git SHA、日期或单次运行计数。
- 共性边界在表格首部统一说明一次；单元格只写本专项自身结论与证据，不重复整体发布、人工复核和平台边界说明。

## UI 验收

先查阅[UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md)，确认功能域、验收门槛和前置依赖，再审核对应专项报告及执行证据。平台执行类文档（含长任务过程原生复验清单的执行任务）按 macOS / Windows 分版维护于 `ui/macos/` 与 `ui/windows/`，两版共享同一验收合同与脚本规范，仅执行入口和证据按平台区分；跨平台合同类文档（计划、脚本规范）与原生复验清单的共享合同、平台任务分派索引继续留在 `ui/` 根目录。文档按「计划 → 回填模板 → 规范 → 专项验收」分类维护。

### 计划

| 文档 | 内容定位 |
| --- | --- |
| [UI 验收工作计划](ui/UI_ACCEPTANCE_PLAN.md) | 功能域、门槛、波次、依赖与 Alpha 边界；全平台；计划正文 |
| [UI 验收脚本编写计划](ui/UI_ACCEPTANCE_SCRIPT_PLAN.md) | 脚本 ID、自动化入口、执行顺序与归档约定；全平台；脚本计划正文 |
| [标题栏与功能菜单专项验收计划（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) | `W0-SHELL-MENU-P/F` 门槛、判定规则与依赖；macOS；计划正文 |
| [标题栏与功能菜单专项验收计划（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TITLE_BAR_PLAN.md) | `W0-SHELL-MENU-P/F` 门槛、判定规则与依赖；Windows；计划正文 |

### 回填模板

| 文档 | 内容定位 |
| --- | --- |
| [应用壳层与入口回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SHELL_RUN_TEMPLATE.md) | `D-SHELL` 本地执行输入、机器结果与证据索引；macOS；回填模板 |
| [应用壳层与入口回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SHELL_RUN_TEMPLATE.md) | `D-SHELL` 本地执行输入、机器结果与证据索引；Windows；回填模板 |
| [项目与会话导航回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_NAVIGATION_RUN_TEMPLATE.md) | `D-NAV` 本地执行输入、机器结果与证据索引；macOS；回填模板 |
| [项目与会话导航回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md) | `D-NAV` 本地执行输入、机器结果与证据索引；Windows；回填模板 |
| [模型设置回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SETTINGS_RUN_TEMPLATE.md) | `D-MODEL` 本地执行输入、机器结果与证据索引；macOS；回填模板 |
| [模型设置回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SETTINGS_RUN_TEMPLATE.md) | `D-MODEL` 本地执行输入、机器结果与证据索引；Windows；回填模板 |
| [长任务/日志中心回填模板（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_RUN_TEMPLATE.md) | `D-TASK-LOG` 本地执行输入、机器结果与证据索引；macOS；回填模板 |
| [长任务/日志中心回填模板（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_RUN_TEMPLATE.md) | `D-TASK-LOG` 本地执行输入、机器结果与证据索引；Windows；回填模板 |

### 规范

| 文档 | 内容定位 |
| --- | --- |
| [UI 验收脚本设计规范](ui/UI_ACCEPTANCE_SCRIPT_SPEC.md) | 执行合同、结果 schema、退出码、证据链与归档约束；全平台；规范正文 |

### 专项验收

> 本表通用口径（适用于下列所有专项验收条目，统一在此说明，不在各栏重复）：各栏结论均为单平台、单功能域结论；`通过（功能域单平台范围）` 表示该域在目标平台达到完整门槛，`专项通过（Alpha 客观范围）` 表示主观/人工项按 [总计划 §8.3](ui/UI_ACCEPTANCE_PLAN.md) 归 [§8.5 人工复核统一批次](ui/UI_ACCEPTANCE_PLAN.md#85-人工复核统一批次自动化验收完成后统一处理) 后，Alpha 客观项全部通过且证据链可核验。Windows 独立专项 `NOT_EXECUTED` 不计入 macOS 结论，反之亦然；任何单平台结论均不宣称整体发布通过或跨平台发布通过。证据以专项报告及最新批次 `result.json` 为准，本表不写批次号、Git SHA 或单次运行计数。

| 文档 | 内容定位 | 当前结论 |
| --- | --- | --- |
| [应用壳层与入口专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SHELL.md) | `D-SHELL` / `W0-SHELL-P`；macOS；平台与结构验收报告 | `通过（功能域单平台范围）` |
| [标题栏与功能菜单专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md) | `D-SHELL` / `W0-SHELL-MENU-P/F`；macOS；原生菜单与窗口命令验收报告 | `专项通过（Alpha 客观范围）` |
| [应用壳层与入口专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SHELL.md) | `D-SHELL` / `W0-SHELL-P`；Windows；平台与结构验收报告 | `NOT_EXECUTED` |
| [项目与会话导航专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md) | `D-NAV` / `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R`；macOS；合同、端到端与回归验收报告 | `通过（功能域单平台范围）` |
| [项目与会话导航专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_NAVIGATION.md) | `D-NAV` / `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R`；Windows；合同、端到端与回归验收报告 | `NOT_EXECUTED` |
| [模型设置专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_SETTINGS.md) | `D-MODEL` / `W1-MODEL-E`；macOS；设置与真实模型服务验收报告 | `专项通过（Alpha 客观范围）` |
| [模型设置专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_SETTINGS.md) | `D-MODEL` / `W1-MODEL-E`；Windows；设置与真实模型服务验收报告 | `NOT_EXECUTED` |
| [长任务/日志中心专项验收（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS.md) | `D-TASK-LOG` / `UI-ACC-LOGS-001`；macOS；长任务端到端机器证据报告 | `专项通过（Alpha 客观范围）` |
| [长任务/日志中心专项验收（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS.md) | `D-TASK-LOG` / `UI-ACC-LOGS-001`；Windows；长任务端到端机器证据报告 | `NOT_EXECUTED` |
| [长任务过程原生复验清单（macOS）](ui/macos/UI_ACCEPTANCE_MACOS_TASK_PROCESS_NATIVE.md) | `NT-MAC-001`~`005` / `UI-ACC-TASK-NATIVE-001`；macOS；桌面原生 AX 复验清单 | `专项通过（Alpha 客观范围）` |
| [长任务过程原生复验清单（Windows）](ui/windows/UI_ACCEPTANCE_WINDOWS_TASK_PROCESS_NATIVE.md) | `NT-WIN-001`~`005`；Windows；桌面原生复验清单 | `NOT_EXECUTED` |
| [长任务过程原生复验清单（共享合同与平台任务分派索引）](ui/TASK_PROCESS_NATIVE_ACCEPTANCE.md) | `NT-001`~`NT-005`；全平台；通过标准与任务分派索引 | 不适用（合同文档） |

> 标题栏与功能菜单专项的 Windows 报告尚未建立；macOS 侧客观证据包括全局搜索、全屏与 Reopen、原生菜单覆盖、WebView 结构证据及目录取消保态，具体用例结论见专项报告。

## IntentRouter 验收

- [IntentRouter 测试与验收](intent-router/TEST_ACCEPTANCE.md)：测试矩阵、本地模型评测、执行命令和验收标准。
- 关联设计与测试计划见 [IntentRouter 专项设计](../design/agent/intent-router/README.md)。

## 维护约定

- 新增验收文档统一放入本目录，按功能领域分类并更新本索引；UI 验收使用 `ui/`（平台执行文档按 macOS/Windows 放入 `ui/macos/`、`ui/windows/`；长任务过程原生复验清单的执行任务同样按平台分版，`ui/` 根目录只保留其共享合同与分派索引），并归入「计划 / 回填模板 / 规范 / 专项验收」对应小节；IntentRouter 验收使用 `intent-router/`。
- 设计文档继续由 [`design/`](../design/) 维护，验收文档通过相对链接关联设计依据、实现和测试入口。
- 报告与回填模板分开维护；审核结论以报告及实际执行证据为准，计划、模板和占位内容不代表验收通过。
- 可执行脚本保存在 [`scripts/`](../../scripts/README.md)，自动化测试保存在 [`tests/`](../../tests/README.md)。
