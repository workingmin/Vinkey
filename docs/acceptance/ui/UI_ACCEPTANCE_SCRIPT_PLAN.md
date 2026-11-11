# UI 测试验收脚本编写工作计划

- 计划基线：当前版本 `0.1.0`（Alpha）
- 更新日期：`2026-11-10`
- 脚本规范：[UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md)
- 总验收计划：[UI_ACCEPTANCE_PLAN.md](./UI_ACCEPTANCE_PLAN.md)（主观类验收项延期登记表的唯一权威是该文件 §8，本文件只引用、不另建清单）

> 本文件维护脚本建设、执行和归档计划；验收排序唯一来源是 `UI_ACCEPTANCE_PLAN.md`。脚本矩阵使用“波次-功能域-门槛”标识，不再使用含义不清的旧合并波次编号。

## 1. 工作目标

为每个高影响功能域建立三层证据：自动化测试证明代码合同，本地环境脚本证明 macOS 15+/Windows + Ollama 或兼容服务的真实链路，人工 UI 记录证明入口、状态、键盘和视觉行为。脚本编写完成不等于功能验收完成；测试人员必须回传脚本输出和人工观察中的**客观条目**，专项报告才能给出平台层结论。人工观察中依赖主观判断、专家评审或用户调研的条目按 [总计划 §8](./UI_ACCEPTANCE_PLAN.md) 登记为 `DEFERRED_AFTER_ALPHA`，不作为 Alpha 的回填前置条件；截图、哈希清单、退出码与 `provenance` 等机器证据不受此例外影响。当前 macOS UI 批次统一以 macOS 15+ 为最低版本，原生截图统一由 `swiftc` 构建的 ScreenCaptureKit helper 采集。

脚本必须区分：

- `P`：平台/结构验收，可用浏览器演示或桌面启动，但需要明确不能替代目标平台。
- `F`：fixture/合同验收，使用隔离临时目录、测试数据库和确定性数据，不依赖 Ollama。
- `E`：真实端到端验收，使用目标平台和真实 Ollama/profile 或批准的兼容服务。
- `R`：跨域回归，构造运行中任务、未保存文档、异步过期响应等交叉状态。

## 2. 分阶段计划

| 阶段 | 工作内容 | 交付物 | 完成标准 | 责任角色 |
| --- | --- | --- | --- | --- |
| 1. 盘点 | 从入口台账、功能域设计和源码登记入口、状态、数据边界 | `D-*`/`BF-*`/`EP-*` 用例清单 | 每个 P0/P1 功能点有稳定 ID | 产品/设计/开发 |
| 2. 分层 | 标记 P/F/E/R、自动化、真实服务和人工 UI 覆盖 | 门槛矩阵 | 明确 mock/fixture 不能替代的证据 | 测试/开发 |
| 3. 脚本合同 | 定义参数、schema、退出码、脱敏、日志位置和清理边界 | 脚本规范与 CLI 合同测试 | `--help`、`--json`、失败注入通过 | 开发/测试 |
| 4. W0 脚本 | 壳层 P、响应式 P、导航 F、编辑器 F | Playwright 壳层入口和结果 JSON；后续各域 `.sh`、`.ps1`、fixture 生成器 | 从仓库外目录可重复执行；浏览器上下文隔离；原生平台证据单列 | 开发 |
| 5. W1/W2 脚本 | 模型 E、IntentRouter E、对话 E、导航 E | 真实服务脚本和结果 schema | profile、模型、退出码和失败归因齐全 | 开发/测试 |
| 6. W3/W4 脚本 | 上下文 E、AI 改稿 E、长任务 E、导航/响应式 R | 交叉状态脚本和回归报告 | 状态保护、恢复和过期响应可复现 | 开发/测试 |
| 7. 本地执行 | 测试人员在目标桌面和真实模型运行 | `result.json`、日志、截图、观察表 | 环境元数据、命令、退出码齐全 | 测试人员 |
| 8. 报告回填 | 将机器摘要和人工观察中的客观条目写入专项报告；主观条目按总计划 §8 单列为后续版本验收项 | `UI_ACCEPTANCE_<DOMAIN>.md` | 原始附件可由 SHA-256 定位；延期项不得写成 PASS 或删除 | 测试/产品 |
| 9. 复审归档 | 处理失败/阻断、竞品变化和版本回归；对主观项的专家签字按总计划 §8 的 `DEFER-UI-012` 延后 | 遗留项、复审日期、版本记录 | 通过、未执行、阻断分开；机器证据与延期登记完整性仍在本版复核 | 产品/设计/测试 |

## 3. 当前版本脚本矩阵

状态说明：`已有` 只表示仓库已有可执行入口；`待编写` 表示不得在报告中假定通过；`待本地执行` 表示脚本/自动化具备但缺测试人员的目标环境证据；`阻断` 表示目标设计或依赖实现尚未具备。

| 验收标识 | 功能域 | 前置依赖 | 脚本 ID | 自动化证据 | 本地环境入口/计划 | 人工 UI | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `W0-SHELL-P` | `D-SHELL` 应用壳层 | macOS 15+ + `swiftc` + Accessibility/屏幕录制权限，或 Windows 对应平台能力 | `UI-ACC-SHELL-001` | store、原生窗口宽度同步已有；Playwright 只覆盖壳层容器/状态，截图前核对菜单合同但不执行菜单命令 | `npm run test:ui-shell-acceptance`；macOS 原生入口仅使用 ScreenCaptureKit helper，浏览器证据与 Tauri 原生窗口证据分层 | Overlay/自绘窗口承载、侧栏/设置、内容容器、错误/空态、主题/焦点、三种视口 | 浏览器脚本已实现；macOS 15+ helper 与依赖门槛已固化，原生窗口控制、交通灯和 DPI 待桌面执行；菜单只做一致性守卫，正式验收移交 `W0-SHELL-MENU-P/F` |
| `W0-SHELL-MENU-P` | `D-SHELL` 标题栏与功能菜单 | `W0-SHELL-P` 的桌面启动和平台权限 | `UI-ACC-TITLE-BAR-001` | `scripts/title-bar/` 机器层菜单树/查看/主题/设置/帮助/关闭焦点/中文与减法审计已有；macOS 原生 AX 菜单入口已有 | `npm run test:title-bar-p-acceptance -- --json`；macOS 原生入口 `npm run test:title-bar-native-mac` | 一级菜单树、平台窗口动作、主题、中文审计、菜单关闭 | **已执行（macOS）**：`UI-ACC-TITLE-BAR-001` 原生批次，P 子集 9 项 `9 PASS / 0 FAIL / 0 BLOCKED`（`TB-MENU-008` 全屏 `score=3 / verdict=fullscreen`、Reopen `0→1 / verdict=reopened`），结论 **P=PASS**；`13/13` 覆盖（`TB-MENU-004` 记 `NOT_APPLICABLE`〔批次归属不适用〕+ `authoritativeGate`），`provenance=PASS`；Windows 独立专项未执行，不计入本 macOS 专项结论；详见 [macOS 专项报告](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md)。**不得记为专项通过或完整通过** |
| `W0-RESP-P` | `Q-RESP` 响应式/主题 | 壳层 Token | `UI-ACC-RESPONSIVE-001` | 与壳层共用 Playwright 三种视口/主题/焦点场景 | 当前由 `test:ui-shell-acceptance` 提供结构截图；窄窗口专项仍待扩展 | 三种目标尺寸、主题、焦点、无横向溢出（机器可判）；视觉观感/对比度按总计划 §8 延期 | 部分自动化可执行，目标桌面 DPI 待回填；`Q-RESP` 范围不缩减 |
| `W0-NAV-F` | `D-NAV` 项目/会话导航 | 桌面桥接、SQLite、隔离 fixture | `UI-ACC-NAV-FIXTURE-001` | store、删除对话框和搜索单元证据；`scripts/navigation/` 与 `navigation-acceptance-cli.test.ts` 合同测试已有；组件直测仍需补 | `npm run test:navigation-acceptance:sh`；脚本自建隔离临时目录、双项目、双会话、中英文文档、删除边界和当前搜索；不调用 Ollama | 切换、恢复、确认、错误重试、结果范围 | 已执行：`NAV-F-001`~`006` 6/6 PASS；截图材料由 `UI-ACC-NAV-UI-001` 补齐 |
| `W0-EDITOR-F` | `D-EDITOR` 基础编辑器 | 工作区/文件桥接 | `UI-ACC-EDITOR-001` | `scripts/editor/` 复刻文档分类、读取、保存、冲突与越界保护合同；不覆盖用户文件 | `npm run test:editor-acceptance -- --json`；临时工作区含 Unicode/BOM/CRLF/二进制 fixture | 文件树、打开、编辑、保存、预览 | **本机已执行**：CLI `EDIT-F-001`~`006` 6/6 PASS、合同测试 10/10 PASS；修复 macOS `/var/folders` 符号链接导致的路径守卫误判与 `result.json` 自引用 hash。目标平台 WebView/人工材料仍待回传，见 [基础编辑器报告](./UI_ACCEPTANCE_EDITOR.md) |
| `W0-SHELL-MENU-F` | `D-SHELL` + 入口 fixture | `W0-SHELL-MENU-P`、`W0-NAV-F`、`W0-EDITOR-F`；设置使用可控 UI fixture | `UI-ACC-TITLE-BAR-FIXTURE-001` | **独立门槛脚本已建立**：`scripts/title-bar/title-bar-fixture-acceptance.ts` + runner/`.sh`/`.ps1`，独立批次 `artifacts/title-bar-fixture-acceptance/title-bar-w0-f-*`；内部调用 `title-bar-acceptance.ts` 产出 `machine/`，读取三个依赖批次的真实 `result.json`；不调用 Ollama | `npm run test:title-bar-fixture-acceptance:sh`（Windows 用 `:win`）；合同测试 `tests/title-bar/title-bar-fixture-acceptance-cli.test.ts` 6/6 | 添加/刷新项目、新建会话、页面状态、编辑焦点、设置打开/返回 | **已独立执行：`F=PASS`**。`W0-NAV-F` PASS、`W0-EDITOR-F` 本机 PASS；13/13 用例覆盖、`TB-MENU-004=PASS`、依赖不硬编码、`SHA256SUMS` 全 OK、`provenance=PASS`。**F 通过不等于专项通过**：`W0-EDITOR-F` 目标平台 WebView/人工材料未回传、目录取消保态 `not-observed`、Windows 独立专项未执行，`specialityPass=false` / `overallConclusion=条件通过`。不得与 P 子集混报 |
| `W1-MODEL-E` | `D-MODEL` 模型设置 | 桌面桥接、SQLite、系统凭据库 | `UI-ACC-SETTINGS-001` | `SettingsPage.test.tsx`、硬件和隐私测试 | 设置连接/凭据冒烟脚本；确认 profile 后再执行真实模型 | 设置入口、保存、切换、删除、键盘导航 | 已执行：2026-11-04 本机 macOS + Ollama（qwen3:8b），`MODEL-E-001`~`MODEL-E-005` 5/5 PASS；归档 `artifacts/model-acceptance/run-2026-11-04T11-26-30-345Z/` |
| `W1-INTENT-E` | `D-INTENT` IntentRouter | 模型 profile 和真实模型 | `AGENT-ACC-INTENT-001` | `intent-router-acceptance-cli.test.ts` | `npm run test:intent-router-acceptance -- --profile-id <id> --json`；统一 JSON 外层字段待核对 | profile、日志、失败恢复 | 脚本已有；真实 Ollama 待执行 |
| `W2-CHAT-E` | `D-CHAT` 对话 | W0 壳层、W1 模型/IntentRouter | `UI-ACC-CHAT-001` | 消息、流式、停止和运行锁定测试 | 真实短对话、停止、超时和错误恢复脚本 | 发送/停止、流式完成、模型状态、失败重试 | 已执行：2026-11-04 本机 macOS + Ollama（qwen3:8b），`CHAT-E-001`~`CHAT-E-004` 4/4 PASS（单轮/多轮上下文/流式中断/失败处理）；归档 `artifacts/chat-acceptance/run-2026-11-04T11-28-38-617Z/` |
| `W2-NAV-E` | `D-NAV` 真实导航 | `W0-NAV-F`、`W1-MODEL-E`、`W2-CHAT-E` | `UI-ACC-NAV-E2E-001` | 会话状态和持久化测试已由脚本覆盖 | `npm run test:navigation-e2e-acceptance:sh`；隔离 fixture + 本机真实 Ollama，2 项目 × 3 会话 × 2 轮、标题生命周期、刷新持久化、搜索分组跳转 | 标题前后、刷新、搜索分组和 Escape 返回 | 已编写并执行：`NAV-E-001`~`006` 6/6 PASS、退出码 0；截图由 `UI-ACC-NAV-UI-001` 补齐 |
| `W3-CONTEXT-E` | `D-CONTEXT` 上下文分析 | W0 编辑器、W1 模型、W2 对话 | `UI-ACC-CONTEXT-001` | 召回、权限、预算和来源收据测试 | 固定 fixture + 真实模型调用 | 选择文件、权限、来源和超限 | 待编写，依赖 W1/W2 |
| `W3-REVISION-E` | `D-REVISION` AI 改稿 | W0 编辑器、W2 对话 | `UI-ACC-EDITOR-002` | 提案解析、接受/拒绝和保存测试 | 真实模型改稿、冲突和提案完整性 | DiffProposal、接受/拒绝、保存 | 待编写，不与基础编辑器混写 |
| `W4-TASK-E` | `D-TASK-LOG` 长任务/日志 | W2 对话；分析还需 W3 上下文 | `UI-ACC-LOGS-001` | Worker/TaskJob、事件/段标签/终态/产物核查（`TASK-CHK-*`）与 `task-process-acceptance-cli.test.ts` 合同测试 | `scripts/task-process/`：只读核查 `.vinkey/analysis/jobs/<jobId>/` 产物与 SQLite，`--dump-manual` 生成人工回填模板 | 暂停/恢复、停止确认、折叠/自动跟随、产物预览、重启恢复、源变化拒绝、失败重试、窄栏/键盘（`TASK-UI-*`） | 已有（待本地执行） |
| `W4-NAV-R` | `D-NAV` 跨域回归 | W2 导航、W3 改稿、W4 任务 | `UI-ACC-NAV-REGRESSION-001` | 过期响应、运行锁定和草稿保护断言已由脚本覆盖 | `npm run test:navigation-regression-acceptance:sh`；隔离 fixture 建模生成中会话、运行任务、未保存草稿与延迟搜索响应 | 阻断、确认、取消、保存和恢复 | 已编写并执行：`NAV-R-001`~`005` 5/5 PASS、退出码 0；前置态由 `preconditionStates` 记录 |
| `UI-ACC-NAV-UI-001` | `D-NAV` UI 材料（三档） | W0/W2/W4 机器批次 | `UI-ACC-NAV-UI-001` | Playwright 逐场景断言 | `npm run test:navigation-ui-acceptance:sh`；启动 Vite 演示层、注入隔离 localStorage fixture、真实点击导航 UI | 21 张页面级截图 + UI 观察表 + `SHA256SUMS` | 已编写并执行：19/19 PASS；**浏览器演示层页面级证据，非原生窗口证据** |
| `UI-ACC-NAV-NATIVE-001` | `D-NAV` 原生窗口（macOS） | 已安装 `/Applications/Vinkey.app`、`ui-shell-native-macos` 已编译 CoreGraphics helper、`W0-NAV-F` fixture | `UI-ACC-NAV-NATIVE-001` | 四场景原生窗口断言 + 构建溯源 | `npm run test:navigation-native-mac:sh`；真实启动应用、隔离 `VINKEY_ACCEPTANCE_DATA_DIR`、按窗口 ID 捕获 | 4 张 CoreGraphics 原生窗口截图 + 原生观察表 + `SHA256SUMS` | 已编写并执行：4/4 PASS；与浏览器 companion 分层，互不冒充 |
| `W4-RESP-R` | `Q-RESP` 全局回归 | 各页面完成 | `UI-ACC-RESPONSIVE-REGRESSION-001` | 跨页面渲染/可访问性回归待补 | Windows/macOS 15+ 尺寸、DPI、菜单、主题和焦点复核 | 全页面无重叠、状态不丢失（机器可判）；全页面视觉回归按总计划 §8 延期 | 待编写，最后执行；脚本矩阵仍保留 `W4-RESP-R` |

## 4. 导航域脚本专项

### 4.1 `W0-NAV-F` fixture 合同

实现入口：`scripts/navigation/`（`navigation-acceptance.ts` 核心、`run-navigation-acceptance.mjs`/`.sh`/`.ps1` 包装、`tests/navigation/navigation-acceptance-cli.test.ts` 合同测试），通过 `npm run test:navigation-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）执行。

脚本生成并清理自有临时目录，至少包含两个项目、每项目两条会话和中英文文档。用例覆盖添加/去重（`NAV-F-001`）、项目切换/隔离（`NAV-F-002`）、会话恢复/删除（`NAV-F-003`）、删除不触碰文件（`NAV-F-004`）、当前搜索边界（`NAV-F-005`）、加载失败和重试（`NAV-F-006`）。结果包含 `fixtureManifest`、项目/会话计数、数据库摘要、文件 SHA-256 和退出码。禁止把真实用户目录作为 fixture。

### 4.2 `W2-NAV-E` 真实端到端

先由测试人员确认 `W1-MODEL-E` 和 `W2-CHAT-E` 的 profile/模型。脚本创建两个项目，每个至少三条会话并完成多轮消息；分别记录临时标题、语义标题（若已实现）、手动标题优先和刷新后持久化。全局搜索尚未实现时必须输出 `BLOCKED`，不能以当前侧栏搜索替代。

### 4.3 `W4-NAV-R` 跨域回归

脚本需要可控地产生运行中会话、后台任务、未保存文档和延迟搜索响应，验证切换/删除的阻断或确认、保存后继续以及过期响应丢弃。只报告交叉风险，不重复完整 CRUD。状态语义对齐 `src/lib/conversationActivity.ts`、`src/App.tsx:1430/1535/1710/1726` 与 W0 的 `applyIfMatchesActive`，在隔离 fixture 上建模，不在 Node 中引入浏览器侧 zustand store。

### 4.4 `UI-ACC-NAV-UI-001` 截图 companion

用 Playwright 启动 Vite 演示层、注入隔离 `localStorage` fixture，为三档门槛采集 21 张页面级截图并输出 UI 观察表。该证据是**浏览器演示层页面级截图**，不是 Tauri 原生窗口证据；macOS 使用系统原生菜单栏（`TitleBar` 在 `isMac` 时返回 `null`），标题栏菜单截图为 Windows 自绘标题栏的跨平台对照。macOS 系统原生菜单项动作属于 `W0-SHELL-MENU-P/F` 独立专项，本 companion 不覆盖、也不以其作为证据。该专项现已在 macOS 执行，结论为 `W0-SHELL-MENU-P` **PASS**、`W0-SHELL-MENU-F` **PASS（独立脚本 `UI-ACC-TITLE-BAR-FIXTURE-001`）**，构建溯源 `provenance=PASS`，专项整体仍为**条件通过**、不是「已通过」；详见 [macOS 标题栏菜单专项报告](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md)。

### 4.5 `UI-ACC-NAV-NATIVE-001` 原生窗口批次

复用 `ui-shell-native-macos` 已编译的 CoreGraphics helper（`CGWindowListCreateImage`）与 `W0-NAV-F` 的 SQLite fixture 生成器，真实启动 `/Applications/Vinkey.app` 并注入隔离 `VINKEY_ACCEPTANCE_DATA_DIR`，采集四组原生窗口状态：双项目登记与会话列表、切换当前项目、删除项目记录边界、无项目空态。应用构建 SHA 取自隔离 Profile 的 `vinkey-runtime.jsonl` `app.start.fields.commitSha`，并用 `src/`、`src-tauri/src/`、`index.html` 与 HEAD 的差异比较证明界面代码同版本。该批次与 §4.4 的浏览器 companion 是互补的两层证据，均不得冒充对方；与 `W0-SHELL-P` 的原生窗口证据分层方式一致（壳层同样由原生窗口用例 + Vite/Playwright companion 组成）。

## 5. 标题栏菜单脚本专项

### 5.1 `W0-SHELL-MENU-F` fixture 合同

实现入口（机器合同层）：`scripts/title-bar/`（`title-bar-acceptance.ts` 核心、`run-title-bar-acceptance.mjs`/`.sh`/`.ps1` 包装、`tests/title-bar/title-bar-acceptance-cli.test.ts` 合同测试），通过 `npm run test:title-bar-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）执行。**注意**：该入口只产出 F 的机器合同子证据，不读取依赖门槛、不覆盖 13 项用例、不单独归档；`W0-SHELL-MENU-F` 的权威判定由 §5.4 的独立门槛脚本 `UI-ACC-TITLE-BAR-FIXTURE-001` 承担。

脚本自建并清理隔离临时目录，包含一个已登记项目、两条会话和一个未保存草稿文档；机器用例 `TB-MENU-001`～`TB-MENU-007` 覆盖一级菜单树合同、项目添加/刷新去重与状态保持、新建会话到对话状态、编辑焦点命令分派、查看页面切换不混入设置、设置进入/返回的状态保持。结果包含 `fixtureManifest`、项目/会话/草稿 SHA-256、`result.json` 与 `SHA256SUMS`，且不读写真实应用数据目录。macOS 原生菜单树、交通灯与系统窗口证据仍属于 `W0-SHELL-MENU-P`，必须由测试人员在 macOS 15+ 桌面执行。

### 5.2 `W0-SHELL-MENU-P` 机器层合同

实现入口：`scripts/title-bar/`（`title-bar-menu-p-acceptance.ts` 核心、`run-title-bar-menu-p-acceptance.mjs`/`.sh`/`.ps1` 包装、`tests/title-bar/title-bar-menu-p-acceptance-cli.test.ts` 合同测试），通过 `npm run test:title-bar-p-acceptance` 执行。

机器层覆盖一级菜单树、查看页面切换与业务状态保持、主题切换、设置归属与进入/返回、帮助与诊断触发级证据、菜单关闭与焦点返回、中文菜单审计和首版菜单减法审计；该层按设计写出 `8 PASS / 1 BLOCKED`，`TB-MENU-008` 窗口状态改变在 WebView/jsdom 中保持阻断。此机器层结论不代表 `W0-SHELL-MENU-P` 的权威判定：后者由 §5.3 的 macOS 原生 runner 以 AX/CG 多信号判据独立给出 `PASS`，两个证据层不得互相冒充或互相升级。

macOS 原生入口：`scripts/title-bar/run-title-bar-native-macos.sh`（配套 `title-bar-ax-helper.swift`），命令 `npm run test:title-bar-native-mac`。它读取完整一级菜单树与目标菜单项、按压查看/主题/帮助菜单项、通过窗口菜单验证最小化/缩放/关闭/Reopen，并用 CoreGraphics 截图归档。WebView 页面与焦点仍由 machine/Playwright companion 或人工复核。

### 5.3 `UI-ACC-TITLE-BAR-001` macOS 原生批次执行结果

入口：`scripts/title-bar/run-title-bar-native-acceptance.mjs` + `.sh`，`npm run test:title-bar-native-acceptance`；原生自动化器 `scripts/title-bar/menu-ax-helper.swift`（ApplicationServices AX C API），M3 companion 为 `scripts/title-bar/run-title-bar-companion.mjs`。该 runner 只判定 P 子门槛；F 归属用例的权威结论归 §5.4 的独立脚本，本批次对 `TB-MENU-004` 记 `NOT_APPLICABLE`（批次归属不适用）并用 `authoritativeGate` 引用该门槛，不新增状态值。计划与判定规则见 [macOS 标题栏菜单专项计划](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR_PLAN.md) 与 [专项报告](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md)。

- **覆盖率基线**：`result.json.coverage.plannedCaseIds` 与 `executedCaseIds` 完全一致，共 13 项（`TB-MENU-001`~`TB-MENU-012` + `TB-MENU-003-GLOBAL-SEARCH` 遗留项），未删减、未合并、未改名。`P`/`F` 归属按计划 §3「关联缺口」列，两个子门槛分别给结论。
- **原生证据**：真实启动 `/Applications/Vinkey.app`，注入隔离 `VINKEY_ACCEPTANCE_DATA_DIR`，按「无项目 / 已打开项目」两阶段执行；`CGWindowListCreateImage` 捕获 20 张窗口截图，菜单展开用 `screencapture -R0,0,760,190` 只截系统菜单栏与下拉菜单区域。应用版本、构建号与嵌入 Git SHA 取自 `Info.plist` 与隔离 Profile 的 `app.start.fields.commitSha`，`provenance.status` 记录仓库/源码一致性（计划 §2）。
- **M3 companion**：计划要求的 Playwright/WebView 结构证据，逐批次用例结论与截图数量见 `webview/result.json`；**不能**证明 macOS 原生菜单、交通灯或物理 DPI，也**不能**升级 `BLOCKED` 用例或 `F` 子门槛。
- **忠实判定**：以 `artifacts/title-bar-acceptance/title-bar-w0-p-*/result.json` 最新批次为准，不硬编码批次号与 Git SHA。`13/13` 覆盖不变；`cases[].status` 只用 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE` 四态。`W0-SHELL-MENU-F` 不由本批次判定，权威结论见 §5.4 的独立 F 批次（`F=PASS`）；`TB-MENU-004` 在本批次记 `NOT_APPLICABLE`（批次归属不适用，非用例不适用），并用 `authoritativeGate` 引用独立门槛。`TB-MENU-003-GLOBAL-SEARCH` 为客观 `PASS`；`TB-MENU-008` 全屏/Reopen 由多信号判据与 LaunchServices Reopen 事件自动验证为 `PASS`（`score=3 / verdict=fullscreen`、`0→1 / verdict=reopened`）；app 按最终 HEAD 重建，`provenance.status=PASS`。`windowsPlatform=NOT_EXECUTED` 属独立 Windows 专项，不计入 macOS 专项判定。结果与 [macOS 专项报告](./macos/UI_ACCEPTANCE_MACOS_TITLE_BAR.md) 逐条对照计划判定规则。
- **实现偏差与修复**：`CF-023` 已落地为 `UnifiedSearchPanel`（按项目/会话/当前项目文档分组、Escape 返回），侧栏内联输入框降级为「快速筛选」，不再冒充全局搜索。未删除用例、未改写计划、未写 PASS。
- **自动化稳定性**：helper 提供 `activate` / `dismiss`，runner 通过 `establishFocus()`（激活 → 点击 → 读回验证焦点，最多 4 次）建立可判定前置状态；全屏采用多信号交叉判据（`AXFullScreen` + AX 几何 + CG 窗口边界），Reopen 由 LaunchServices 触发 Dock/系统 Reopen 事件自动验证，**不放宽任何断言**。

### 5.4 `UI-ACC-TITLE-BAR-FIXTURE-001` 独立 F 门槛（计划 §7 第 114 行「单独归档」）

实现入口：`scripts/title-bar/title-bar-fixture-acceptance.ts` 核心、`run-title-bar-fixture-acceptance.mjs`/`.sh`/`.ps1` 包装、`tests/title-bar/title-bar-fixture-acceptance-cli.test.ts` 合同测试；命令 `npm run test:title-bar-fixture-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）。独立批次目录 `artifacts/title-bar-fixture-acceptance/title-bar-w0-f-*`，批次号格式与 P 原生 runner 统一为 `YYYYMMDDTHHMMSSZ`。

- **依赖不硬编码**：从 `artifacts/navigation-acceptance/run-*`（`W0-NAV-F`）、`artifacts/editor-acceptance/run-*`（`W0-EDITOR-F`）、`artifacts/title-bar-acceptance/title-bar-w0-p-*`（`W0-SHELL-MENU-P`）读取最新 `result.json` 的 `conclusion` / `gitSha` / `provenanceStatus` / `repositoryClean`，并在 `dependencies/` 归档快照与原文。缺任一依赖 PASS 时 `F` 保持 `BLOCKED`，`TB-MENU-004` 也保持 `BLOCKED`。
- **范围不缩水**：`PLANNED_CASE_IDS` 与计划 §3 完全一致，共 13 项（`TB-MENU-001`~`012` + `TB-MENU-003-GLOBAL-SEARCH`）；`coverage.idsMatch=true`。F 归属 4 项由本脚本判定，P 归属 9 项引用 `UI-ACC-TITLE-BAR-001` 最新原生批次并标注来源，不重复判定、不混入 F 证据。
- **分层不冒充**：本脚本是机器 fixture / 组件合同层，内部调用 `npm run test:title-bar-acceptance` 产出 `machine/result.json`；引用 P 批次 `webview/result.json` 作为 M3 结构证据快照；**不产出**原生窗口截图，也不证明 macOS 原生菜单、交通灯或系统窗口动作。
- **忠实判定**：`W0-SHELL-MENU-F=PASS`；`decision.specialityPass=false`、`overallConclusion=条件通过`、`windowsPlatform=NOT_EXECUTED`。F 通过不会自动升级专项；`SHA256SUMS` 在 `result.json` 定稿后计算且不自引用。
- **与 P runner 的分工**：`run-title-bar-native-acceptance.mjs` 已移除写死的 `F=BLOCKED（W0-EDITOR-F 待编写）`。F 归属用例的判定权归本独立门槛，P runner 只把 F 归属菜单动作作为原生过程证据；`TB-MENU-004` 在 P 批次记四态内的 `NOT_APPLICABLE`（批次归属不适用），并以 `authoritativeGate` 登记本门槛的脚本 ID / 复跑命令 / 归档目录，**不新增状态值**（见 §8）。同一 HEAD 下只有一个 F 权威结论，两套 runner 不再互相矛盾。

## 6. 编辑器脚本专项

### 6.1 `W0-EDITOR-F` fixture 合同

实现入口：`scripts/editor/`（`editor-acceptance.ts` 核心、`run-editor-acceptance.mjs`/`.sh`/`.ps1` 包装、`tests/editor/editor-acceptance-cli.test.ts` 合同测试），通过 `npm run test:editor-acceptance`（macOS/Linux 加 `:sh`、Windows 加 `:win`）执行。

脚本自建并清理隔离临时工作区，包含 Markdown/代码/文本/环境文件/二进制文档 fixture；机器用例 `EDIT-F-001`～`EDIT-F-006` 复刻 `src-tauri/src/lib.rs` 的文档分类、打开与读取、保存与行尾/BOM 保真、修改时间冲突拒绝、新建与路径越界保护和边界隔离合同。报告入口：`docs/acceptance/ui/UI_ACCEPTANCE_EDITOR.md`。

本机执行状态（2026-11-10）：CLI 6/6 PASS、合同测试 10/10 PASS，批次归档在 `artifacts/editor-acceptance/run-*`。修复了两处真实缺陷：`resolveExisting()` / `resolveForCreate()` 的 `resolvedRoot` 未做 `realpath` 归一，导致 macOS `/var/folders` → `/private/var/folders` 符号链接下的合法 fixture 被误判「路径超出已授权工作区」（越界保护断言未放宽）；以及 `result.json` 自引用 hash 循环导致 `shasum -c` 报 `result.json: FAILED`。该 PASS 只覆盖 fixture / 文件桥接合同，目标平台 WebView 与人工材料仍待回传。

## 7. 模型设置与真实模型执行顺序

1. 执行 `W0-SHELL-P`、`W0-RESP-P` 和不依赖模型的 `W0-NAV-F`/`W0-EDITOR-F`。
2. 测试人员启动 Vinkey，在设置页确认 profile、模型、连接和系统凭据条件。
3. 使用 `--list-profiles` 或等效入口确认 profile，再执行 `W1-MODEL-E` 和 `W1-INTENT-E`。
4. 真实模型通过后执行 `W2-CHAT-E`，再执行 `W2-NAV-E`；不得反过来用无模型 fixture 冒充真实会话。
5. `W3`、`W4` 按总计划依赖关系执行，并回传 `result.json`、日志、人工观察表和截图/录屏索引。

## 8. 新脚本编写任务单

| 任务 | 产出 | 必检项 |
| --- | --- | --- |
| 壳层浏览器自动化 | `scripts/ui-shell/run-ui-shell-acceptance.mjs`、`.sh`、`.ps1`、npm 入口 | 隔离 localStorage、无项目空态、错误注入仅限验收 Vite、尺寸截图、原生证据不可冒认 |
| 用例建模 | 稳定 `caseId`、目标、前置、预期、清理 | 成功、失败、空态、禁用、恢复至少各一项 |
| 核心实现 | TypeScript 入口 | 只读配置、超时、取消、错误归因和脱敏 |
| 平台包装 | `.sh`、`.ps1`、npm 命令 | 仓库外目录、中文路径、退出码透传 |
| 输出实现 | 人类摘要、JSON、逐用例日志 | schemaVersion、环境、模型、计数、结论 |
| 合同测试 | `tests/<domain>/*-cli.test.ts` | 参数、边界、失败注入、字段稳定性 |
| 手工说明 | 回填模板和步骤 | 占位符不能当作 PASS；截图需关联操作记录 |
| 归档 | 结果目录和 `SHA256SUMS` | 原始证据可追溯，不提交密钥/正文 |

## 9. 完成定义与阻断处理

脚本只有同时具备核心实现、macOS/Linux 入口、Windows 入口、npm 入口、CLI 合同测试、`--json` schema、仓库外冒烟记录和失败归因时才能标记“已有”。环境库缺失、Ollama 未启动、没有目标模型、系统凭据不可用或目标设计尚未实现时，应产出 `BLOCKED` 和复现信息，不能修改脚本绕过。

## 10. 复审节奏

- 每次 Vinkey 版本发布：重跑 P0 脚本和受影响的 F/E/R 门槛。
- 模型、提示合同、输出 schema、连接协议或凭据边界变化：重跑 `D-MODEL`、`D-INTENT`、`D-CHAT` 及依赖域。
- `CF-022`/`CF-023` 证据或目标设计变化：先更新 `FEATURE_DECISIONS.md` 和导航设计，再更新 `W2-NAV-E` 用例。
- 竞品名录、术语或市场准入变化：先更新 `TERMINOLOGY.md`/`COMPETITOR_CATALOG.md`，再复审设计证据链。
- 后续版本启动：把 [总计划 §8.3](./UI_ACCEPTANCE_PLAN.md) 的 `DEFER-UI-001`~`012` 全表转入该版本验收范围，逐项给出脚本/评审/调研安排；未完成项继续标 `DEFERRED_AFTER_ALPHA`，不得静默丢弃。

## 11. Alpha 阶段延期项与脚本矩阵边界

唯一权威清单见 [总计划 §8](./UI_ACCEPTANCE_PLAN.md)；本节只说明它对**脚本建设计划**的影响，不重复登记。

- **脚本矩阵不缩减**：§3 的所有验收标识、脚本 ID、功能域与 `W0`~`W4` 门槛保持原样；`W0-RESP-P`、`W4-RESP-R` 等含视觉字样的行只把「人眼观感」部分标为延期，尺寸、状态保持、无横向溢出、机器探针等客观断言仍由脚本覆盖，脚本仍须编写与执行。
- **不新增状态值**：`result.json` 的 `cases[].status` 仍只用 `PASS` / `FAIL` / `BLOCKED` / `NOT_APPLICABLE`；`DEFERRED_AFTER_ALPHA` 只出现在计划与报告的排期字段，不进入 JSON schema，不参与覆盖率或计数。
- **不因延期改判定规则**：各专项 §6 的「条件通过 / 专项通过 / 完整通过」判定仍以机器结果与客观遗留项为准；主观项从 Alpha 的**前置条件**中移出，不等于把结论升级为通过。
- **仍需建设的客观脚本**：`TB-MENU-008` 的全屏多信号判据、Reopen 事件恢复、关闭后窗口隐藏稳定态、目录选择取消保态、弹窗焦点读回，属总计划 §8.2「不划出」范围，仍按现有脚本计划推进；不得借延期跳过。
- **待同步（下一阶段）**：[脚本规范](./UI_ACCEPTANCE_SCRIPT_SPEC.md) §1/§9.1 的人工观察表述与 8 份 `*_RUN_TEMPLATE.md` 的主观字段；在此之前以总计划 §8 为准。
