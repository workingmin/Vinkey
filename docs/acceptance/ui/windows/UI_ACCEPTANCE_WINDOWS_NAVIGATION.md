# 项目与会话导航专项验收报告（Windows）

> 平台说明：本文档是 Windows 平台版；macOS 平台验收见 [UI_ACCEPTANCE_MACOS_NAVIGATION.md](../macos/UI_ACCEPTANCE_MACOS_NAVIGATION.md)。验收合同、用例矩阵与设计断言跨平台一致，仅执行入口、脚本命令和平台证据按平台分别记录。

- 功能域：`D-NAV` 项目与会话导航
- 验收标识：`W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R`
- 验收对象：[UI_DESIGN_NAVIGATION.md](../../../design/ui/UI_DESIGN_NAVIGATION.md)、[UI_ENTRY_POINTS.md](../../../design/ui/UI_ENTRY_POINTS.md)
- 回填模板：[UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md](./UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md)
- 平台专项状态：条件通过；`W0-NAV-F`、`W4-NAV-R` 机器断言，浏览器 UI 材料与真实应用原生窗口证据已在本机 Windows 采集并归档，`W2-NAV-E` 因真实模型服务不可达保持 `BLOCKED`
- 更新日期：`2026-11-23`

> 证据定位约定：本报告不硬编码批次号与 Git SHA。`artifacts/navigation-acceptance/` 下最新的 `run-*`（W0）、`e2e-run-*`（W2）、`regression-run-*`（W4）、`ui-run-*`（浏览器 UI）、`native-run-*`（原生窗口）目录中的 `result.json` 为该门槛的权威机器记录，环境、Git SHA、`provenance` 与 `SHA256SUMS` 均以该文件为准。证据批次均在提交验收脚本后复跑，仓库状态为干净，机器记录 `provenance=PASS`；后续提交报告不改变证据结论，但发布前应按最终 HEAD 复跑一次以保持溯源一致。

## 1. 验收边界

本报告不再把项目、会话和搜索归入壳层结构验收。它按依赖分三次判定：

| 门槛 | 可证明 | 不能证明 |
| --- | --- | --- |
| `W0-NAV-F` | 隔离 fixture/SQLite 下的项目、会话、删除和当前搜索合同 | 真实模型、多轮对话质量、语义标题、全局搜索目标态 |
| `W2-NAV-E` | 真实多轮会话、标题生命周期、持久化和搜索跳转 | 运行任务或未保存文档下的全部跨域保护 |
| `W4-NAV-R` | 任务、编辑器与导航交叉状态的保护和过期响应处理 | 不重复证明全部基础 CRUD |

`W0-NAV-F` 不依赖 Ollama。`W2-NAV-E` 必须使用已通过模型设置准入的真实模型。`W4-NAV-R` 必须构造运行任务和未保存文档状态。

## 2. 当前实现基线

| 能力 | 代码证据 | 当前判定 |
| --- | --- | --- |
| 项目/会话列表、切换和删除入口 | `src/components/ProjectSessionSidebar.tsx` | 已实现；W0 机器断言、浏览器 UI 与真实应用原生窗口截图已覆盖 |
| 删除确认和失败重试 | `src/components/RecordDeletionDialog.tsx` | 已实现；两步确认、范围说明、错误与重试截图已归档 |
| 状态、运行锁定和删除后的校正 | `src/store.ts`、`src/lib/conversationActivity.ts` | 已实现；W4 五类交叉状态断言已覆盖 |
| 首次输入标题 | `src/App.tsx`、`src/lib/conversationTitle.ts` | 合并空白并截取 28 字符；浏览器层重命名与刷新持久化截图已归档，真实模型标题生命周期待 W2 |
| 当前侧栏搜索 | `ProjectSessionSidebar.tsx` → `src/lib/desktop.ts` → `src-tauri/src/search.rs` | 已实现；正文只限当前工作区，最多 100 条；W0 断言与搜索截图已覆盖 |
| 语义标题/手动重命名 | `src/lib/conversationTitle.ts`、`src/store.ts`、`ProjectSessionSidebar.tsx` | 已实现；`CF-022` 已参考，真实模型端到端证据待补 |
| 全局搜索入口/结果面板 | `src/App.tsx`、`src/lib/titleBarMenu.ts`、`ProjectSessionSidebar.tsx` | `CF-023` 统一搜索面板已实现；浏览器层三类入口、分组、跳转与 Escape 截图已归档，真实模型 E2E 待补 |

源码存在不等于目标平台通过。旧壳层报告中的项目、会话和搜索结论只作为历史代码证据，不作为本 `D-NAV` 专项最终判定。

## 3. `W0-NAV-F` 验收矩阵

前置：使用测试专用临时目录和数据库，至少准备 `project-a`、`project-b`，每个项目至少两条会话和可搜索的中英文文档。不得指向用户真实作品目录。

| 用例 | 操作/断言 | 自动化或脚本要求 | 人工材料 | 当前结论 |
| --- | --- | --- | --- | --- |
| `NAV-F-001` 项目登记 | 添加两个目录；重复添加选择已有记录 | 验证稳定 project ID 和去重 | 项目列表截图与原生窗口截图 | PASS |
| `NAV-F-002` 项目切换 | A/B 往返切换；异步结果只写回当前项目 | 注入延迟返回并校验 `workspaceId` | 切换前后截图与原生窗口截图 | PASS |
| `NAV-F-003` 会话 CRUD | 每项目新建、恢复和删除会话 | 验证项目外键、消息恢复和删除失败 | 会话列表及确认框截图 | PASS |
| `NAV-F-004` 删除边界 | 删除项目记录，不删除 fixture 文件 | 比较删除前后文件 SHA-256 | 对话框范围说明、文件仍存在与原生窗口截图 | PASS |
| `NAV-F-005` 当前搜索 | 搜索项目、会话和当前项目正文 | 验证防抖、最多 100 条和工作区边界 | 结果/无结果/中文路径截图 | PASS |
| `NAV-F-006` 状态与恢复 | 加载、空态、失败、重试和重复提交保护 | 故障注入并检查状态恢复 | 错误与重试截图、原生空态截图 | PASS |

> 机器证据：`npm run test:navigation-acceptance:win`（`UI-ACC-NAV-FIXTURE-001`），`NAV-F-001`~`NAV-F-006` 六用例全部 PASS、退出码 0；隔离 fixture 自动清理，边界文件 SHA-256 无变化。
> UI 材料：`01`~`10` 号浏览器演示层截图，覆盖项目列表、切换前后、会话恢复、删除项目两步确认、删除会话确认、搜索结果与分组、无结果态、错误与重试，见最新 `ui-run-*` 批次。
> 原生材料：`01`~`04` 号真实应用窗口截图，覆盖双项目、切换、删除后单项目与空数据库空态，见最新 `native-run-*` 批次。

通过条件：六项均有机器结果或可审计人工证据，无跨项目串写、用户文件删除或不可恢复状态。只完成 UI 截图不得判定 fixture 合同通过。

## 4. `W2-NAV-E` 验收矩阵

前置：`W1-MODEL-E`、`W1-INTENT-E` 和 `W2-CHAT-E` 的必要链路通过；测试人员在 Windows 配置真实 Ollama 或批准的兼容服务。

| 用例 | 操作/断言 | 所需材料 | 当前阻断/结论 |
| --- | --- | --- | --- |
| `NAV-E-001` 多项目多会话 | 两个项目各建立至少三条会话，每条完成至少两轮 | 模型/profile 信息、会话截图、刷新后结果 | BLOCKED：`192.168.3.30:11434` 当前仅可 ping 通，Ollama API 端口不监听 |
| `NAV-E-002` 临时标题 | 首次有效输入后标题确定且刷新后不变化 | 输入、标题和数据库/界面结果 | BLOCKED：真实模型链路未恢复 |
| `NAV-E-003` 语义标题 | 第一轮完成或 2 至 3 条用户输入后至多升级一次；失败回退 | 标题前后、请求结果和失败用例 | BLOCKED：真实模型链路未恢复；浏览器层入口材料不能替代模型证据 |
| `NAV-E-004` 手动命名优先 | 手动重命名后新消息不再覆盖 | 重命名和后续对话录屏 | BLOCKED：需真实多轮消息验证后续写入不覆盖 |
| `NAV-E-005` 全局搜索 | 从展开/折叠侧栏、标题栏和键盘进入；分组并跳转 | 入口、结果、跳转、Escape 返回截图 | BLOCKED：浏览器层 `11`~`16` 号截图已归档，但真实模型 E2E 未执行，不判 PASS |
| `NAV-E-006` 跨项目恢复 | 搜索或选择会话后恢复正确项目、标题和消息 | 操作录屏与结果摘要 | BLOCKED：真实模型链路未恢复 |

> 机器证据：`npm run test:navigation-e2e-acceptance:win -- --base-url http://192.168.3.30:11434 --model qwen3:8b --timeout-ms 12000`（`UI-ACC-NAV-E2E-001`）在干净仓库状态下 0/6 PASS、6/6 BLOCKED、退出码 1，阻断原因均为 `ollama-unreachable`；证据见最新 `e2e-run-*` 批次。
> 上游状态：Windows 侧未形成 `W1-MODEL-E`、`W1-INTENT-E`、`W2-CHAT-E` 的通过批次，不以其他平台或临时模型响应替代。
> 解锁条件：恢复 `192.168.3.30:11434` 的 Ollama 服务并确认 `qwen3:8b` 可用后，依次补跑模型/聊天上游准入与本门槛 E2E；六项全部 PASS 才可将 `W2-NAV-E` 改为 PASS。

未实现或未取得真实模型证据的用例保持 `BLOCKED`，不得用现有侧栏搜索、临时标题或浏览器演示层截图替代目标设计后填写 `PASS`。

## 5. `W4-NAV-R` 验收矩阵

| 用例 | 交叉状态 | 预期 | 当前结论 |
| --- | --- | --- | --- |
| `NAV-R-001` 生成中切换 | 当前会话正在生成 | 明确阻断或停止后继续；不串写目标会话 | PASS（阻断、过期响应丢弃、停止后切换成功） |
| `NAV-R-002` 后台任务中切换/删除 | 当前项目有运行任务 | 不允许导致任务和来源记录失联 | PASS（运行中阻断删除，记录与来源会话保留，任务完成后放行） |
| `NAV-R-003` 未保存文档切换/删除 | 编辑器存在草稿 | 提供保存、放弃或返回；取消后保持原状态 | PASS（确认、取消保持、删除阻断、保存/放弃后切换） |
| `NAV-R-004` 过期搜索结果 | 搜索未返回时切换项目 | 旧结果不得覆盖新项目范围 | PASS（旧结果被 `workspaceId` 守卫丢弃） |
| `NAV-R-005` 失败恢复 | 阻断解除或保存后重试 | 只执行一次目标操作，状态可追踪 | PASS（重复提交只增尝试次数，解除后恰好执行一次） |

> 机器证据：`npm run test:navigation-regression-acceptance:win`（`UI-ACC-NAV-REGRESSION-001`），`NAV-R-001`~`NAV-R-005` 5/5 PASS、退出码 0；`preconditionStates` 逐用例记录前置状态。
> UI 材料：`19`~`21` 号浏览器演示层截图（未保存草稿状态、草稿下切换项目、长任务/日志中心入口）见最新 `ui-run-*` 批次。真实运行任务与生成中会话的机器断言由 W4 脚本在隔离 fixture 上建模完成，不由浏览器截图单独证明。

## 6. 脚本与自动化计划

| 脚本 ID | 门槛 | 计划输出 | 状态 |
| --- | --- | --- | --- |
| `UI-ACC-NAV-FIXTURE-001` | `W0-NAV-F` | fixture manifest、逐用例结果、数据库/文件边界摘要、`result.json`、`SHA256SUMS` | 已执行：6/6 PASS、退出码 0 |
| `UI-ACC-NAV-E2E-001` | `W2-NAV-E` | profile/model、会话 ID 摘要、标题阶段、搜索跳转、失败归因 | 已编写并执行：0/6 PASS、6/6 BLOCKED、退出码 1（`ollama-unreachable`） |
| `UI-ACC-NAV-REGRESSION-001` | `W4-NAV-R` | 前置状态、阻断结果、恢复动作、过期响应断言 | 已执行：5/5 PASS、退出码 0 |
| `UI-ACC-NAV-UI-001` | 三档 UI 材料 | 21 张页面级截图、UI 观察表、`result.json`、`SHA256SUMS` | 已执行：19/19 PASS、退出码 0（Windows 浏览器演示层） |
| `UI-ACC-NAV-NATIVE-001` | 原生窗口（Windows） | 4 张 Win32 原生窗口截图、原生观察表、构建溯源、`result.json`、`SHA256SUMS` | 已执行：4/4 PASS、退出码 0（真实启动 `Vinkey.exe`） |
| `UI-ACC-SETTINGS-001` | `W1-MODEL-E` | 真实模型/profile 与准入检查 | Windows 待执行，当前模型服务不可达 |
| `UI-ACC-CHAT-001` | `W2-CHAT-E` | 真实多轮对话与失败恢复 | Windows 待执行，当前模型服务不可达 |

脚本遵循 [UI_ACCEPTANCE_SCRIPT_SPEC.md](../UI_ACCEPTANCE_SCRIPT_SPEC.md)。三个导航门槛均提供 `.sh`、`.ps1` 与统一 TypeScript/MJS 核心入口；浏览器 UI companion 增加 `--platform win32`，在 Windows 上记录 `navigator.platform`、`Windows build` 与证据层级，避免沿用 macOS 平台上下文；原生入口为 `npm run test:navigation-native-win`，从仓库外目录可重复执行，清理范围仅包含本次生成的隔离临时目录。所有最终批次 `SHA256SUMS` 已通过校验。

## 7. 证据材料与回传状态

### 7.1 `W0-NAV-F`

- 操作系统、架构、DPI、Vinkey 版本和 Git SHA：由最新 `run-*` 批次的 `result.json.environment` / `repository` 记录。
- fixture manifest：脱敏路径、项目/会话/文档数量、生成方式和清理结果：由 `result.json.fixtureManifest` 记录。
- 命令、`result.json`、`SHA256SUMS`、诊断日志：已归档；stdout 最终四行符合规范，`result.json.exitCode` 为唯一归档退出码。
- 项目切换、会话恢复、删除确认、搜索结果/无结果、错误重试截图：`01`~`10` 号浏览器截图已生成。

### 7.2 `W2-NAV-E`

- Ollama 版本、模型标签、profile ID（不含密钥）：未取得；`192.168.3.30:11434` API 不可达，最新 `e2e-run-*` 批次保留阻断记录。
- 每项目/会话的脱敏标识、轮次数、临时标题、语义标题和刷新后结果：待真实模型恢复后回填。
- 全局搜索各入口、结果分组、跳转目标、Escape 返回截图：`11`~`16` 号浏览器演示层截图已归档；真实应用/真实模型 E2E 材料待补。
- 模型不可用、标题升级失败和搜索失败的恢复证据：当前批次记录服务不可达；模型可用后的失败回退待补。

### 7.3 `W4-NAV-R`

- 运行任务、生成中会话和未保存文档前置状态证据：`preconditionStates` 逐用例记录。
- 切换/删除的提示、用户选择、最终目标和源状态完整性：逐用例 `detail` 与 `19`~`21` 号截图。
- 延迟搜索或加载响应被丢弃的机器断言：`NAV-R-004` 的 `workspaceId` 守卫断言。

### 7.4 原生窗口证据（`UI-ACC-NAV-NATIVE-001`）

- 真实启动 `%LOCALAPPDATA%\Vinkey\vinkey.exe`，用隔离 `VINKEY_ACCEPTANCE_DATA_DIR` 注入 W0 fixture；截图由 `scripts/navigation/capture-win-window.ps1` 调用 Win32 `BitBlt` 按窗口边界捕获，不是 Playwright 页面截图。
- 四张原生窗口截图分别对应：双项目登记与会话列表（标题显示 `project-b`、`项目 2`）、切换当前项目后（标题显示 `project-a`、会话分组随项目变化）、删除项目记录后（`项目 1`，仅剩 `project-b`）、空数据库（`项目 0` + 「还没有添加项目」空态）。
- 应用构建溯源由隔离 Profile 的 `vinkey-runtime.jsonl` `app.start.fields.commitSha` 提供；`sourceIdenticalToHead` 校验 `src/`、`src-tauri/src/`、`index.html` 与当前 HEAD 无差异，记录在最新 `native-run-*` 批次 `result.json.application` / `provenance`。
- 原生观察表 `ui-observations.md`、`result.json`、`SHA256SUMS`、`display-metadata.json` 与四张截图同批归档；DPI 元数据沿用 Windows 壳层可靠探针，物理 DPI 为 `DESKTOPHORZRES/HORZSIZE` 推算值。

不得回传 API Key、完整作品正文、系统用户名或未脱敏绝对路径。测试人员使用[导航本地验收回填模板](./UI_ACCEPTANCE_WINDOWS_NAVIGATION_RUN_TEMPLATE.md)复核；未执行项保持 `待回填` 或 `BLOCKED`。

## 8. 当前结论

- `W0-NAV-F`：PASS。`UI-ACC-NAV-FIXTURE-001` 6/6，隔离 fixture 自动清理、边界文件 SHA-256 不变；§7.1 截图材料已齐。
- `W2-NAV-E`：BLOCKED。真实 Ollama API 不可达，`UI-ACC-NAV-E2E-001` 0/6 PASS、6/6 BLOCKED；浏览器层入口截图不能替代真实模型端到端结论。
- `W4-NAV-R`：PASS。`UI-ACC-NAV-REGRESSION-001` 5/5，覆盖生成中/运行任务/未保存草稿/过期响应/失败恢复五类交叉状态。
- UI 材料：PASS。`UI-ACC-NAV-UI-001` 19/19，产出 21 张页面级截图、UI 观察表与完整 `SHA256SUMS`；平台上下文为 Windows。
- 原生窗口：PASS。`UI-ACC-NAV-NATIVE-001` 4/4，真实启动已安装 `Vinkey.exe`，Win32 捕获 4 张原生窗口截图；双项目、切换、删除边界与空态四种窗口状态已核对，构建溯源与源码一致性已记录。
- `D-NAV` 综合结论：条件通过。`W0`、`W4`、浏览器 UI 与真实应用原生窗口证据均已在 Windows 采集并通过哈希校验，唯一剩余客观项为 `W2-NAV-E` 的真实模型链路；恢复服务并完成上游准入与 E2E 后可升级为 `通过（功能域单平台范围）`。

### 证据层级边界（不得扩大解释）

1. 机器断言：来自隔离 fixture/SQLite 的 `result.json`，是 `W0`、`W4` 结论的主要依据。
2. 交互 UI 截图：`UI-ACC-NAV-UI-001` 产出的是 Playwright 浏览器演示层页面级截图（21 张），证明交互链路、分组与视觉状态，不是 Tauri 原生窗口证据。
3. 原生窗口截图：`UI-ACC-NAV-NATIVE-001` 是真实启动已安装 Tauri 应用后，由 Win32 `BitBlt` 按窗口边界捕获的原生窗口（4 张），证明真实应用能正确渲染导航状态。两层截图互补，任何一层都不得冒充另一层。
4. 不覆盖范围：Windows 自绘标题栏的功能菜单动作属于独立 `W0-SHELL-MENU-P/F` 专项；本报告中的 `13` 号截图仅为浏览器层菜单入口对照，不将其计入 `D-NAV` 结论。`W1-MODEL-E`、`W1-INTENT-E`、`W2-CHAT-E` 亦不计入本专项，但为 `W2-NAV-E` 的必要前置。
5. 人工目视复核：截图与 `ui-observations.md` 已随批次归档，发布前目视确认作为最后一道手续，不阻断本批次自动化结论。
6. provenance：以最新批次 `result.json.provenance` 为准；若工作树存在未提交改动，该字段为 `REVIEW`/`BLOCKED`，提交后按最终 HEAD 复跑。

## 9. 测试人员回填区

- `W0-NAV-F`：`PASS`；证据见最新 `run-*` 批次的 `result.json` + `SHA256SUMS`；截图见最新 `ui-run-*` 批次 `01`~`10` 与 `native-run-*` 批次。
- `W2-NAV-E`：`BLOCKED`；证据见最新 `e2e-run-*` 批次；恢复 `192.168.3.30:11434` 后补跑上游模型/聊天准入与本门槛。
- `W4-NAV-R`：`PASS`；证据见最新 `regression-run-*` 批次；截图见最新 `ui-run-*` 批次 `19`~`21`。
- 原生窗口：`PASS`；证据见最新 `native-run-*` 批次的 `result.json` + `SHA256SUMS` + `ui-observations.md` + `display-metadata.json` + `screenshots/` 四张 Win32 原生窗口截图。
- 问题列表：无新增功能缺陷；唯一阻断项为 Ollama 服务不可达（`INFRA-WIN-OLLAMA-001`，待服务恢复后关闭）。
- 综合结论：`条件通过` — `W0`、`W4`、浏览器 UI 与原生窗口证据已齐，`W2` 待真实模型服务恢复后补跑
- 下一次复审版本/日期：`<Ollama 服务恢复并通过 W1-MODEL-E / W2-CHAT-E 后立即复审>`
