# UI 测试验收脚本编写工作计划

- 计划基线：当前版本 `0.1.0`
- 更新日期：`2026-09-24`
- 脚本规范：[UI_ACCEPTANCE_SCRIPT_SPEC.md](./UI_ACCEPTANCE_SCRIPT_SPEC.md)
- 总验收计划：[UI_ACCEPTANCE_PLAN.md](./UI_ACCEPTANCE_PLAN.md)

> 本文件维护脚本建设、执行和归档计划；验收排序唯一来源是 `UI_ACCEPTANCE_PLAN.md`。脚本矩阵使用“波次-功能域-门槛”标识，不再使用含义不清的旧合并波次编号。

## 1. 工作目标

为每个高影响功能域建立三层证据：自动化测试证明代码合同，本地环境脚本证明 macOS/Windows + Ollama 或兼容服务的真实链路，人工 UI 记录证明入口、状态、键盘和视觉行为。脚本编写完成不等于功能验收完成；测试人员必须回传脚本输出和人工观察，专项报告才能给出平台层结论。

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
| 8. 报告回填 | 将机器摘要和人工观察写入专项报告 | `UI_ACCEPTANCE_<DOMAIN>.md` | 原始附件可由 SHA-256 定位 | 测试/产品 |
| 9. 复审归档 | 处理失败/阻断、竞品变化和版本回归 | 遗留项、复审日期、版本记录 | 通过、未执行、阻断分开 | 产品/设计/测试 |

## 3. 当前版本脚本矩阵

状态说明：`已有` 只表示仓库已有可执行入口；`待编写` 表示不得在报告中假定通过；`待本地执行` 表示脚本/自动化具备但缺测试人员的目标环境证据；`阻断` 表示目标设计或依赖实现尚未具备。

| 验收标识 | 功能域 | 前置依赖 | 脚本 ID | 自动化证据 | 本地环境入口/计划 | 人工 UI | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `W0-SHELL-P` | `D-SHELL` 应用壳层 | 无 | `UI-ACC-SHELL-001` | store、原生窗口宽度同步已有；Playwright 只覆盖壳层容器/状态，不执行菜单命令 | `npm run test:ui-shell-acceptance`；Playwright 浏览器证据与 Tauri 原生窗口证据分层 | Overlay/自绘窗口承载、侧栏/设置、内容容器、错误/空态、主题/焦点、三种视口 | 浏览器脚本已实现；原生窗口控制、交通灯和 DPI 待桌面执行；菜单移交 `W0-SHELL-MENU-P/F` |
| `W0-SHELL-MENU-P` | `D-SHELL` 标题栏与功能菜单 | `W0-SHELL-P` 的桌面启动和平台权限 | `UI-ACC-TITLE-BAR-001` | Playwright/WebView companion 只覆盖 DOM 菜单、窗口/菜单关闭、主题和无业务页面切换；原生菜单另行取证 | `docs/design/ui/acceptance/UI_ACCEPTANCE_TITLE_BAR_PLAN.md`；Windows UI Automation/macOS Accessibility | 一级菜单树、平台窗口动作、主题、中文审计、菜单关闭 | 计划已建立；当前源码仍存在 `TB-GAP-001`、`TB-GAP-003`、`TB-GAP-004`，不得假定通过 |
| `W0-RESP-P` | `Q-RESP` 响应式/主题 | 壳层 Token | `UI-ACC-RESPONSIVE-001` | 与壳层共用 Playwright 三种视口/主题/焦点场景 | 当前由 `test:ui-shell-acceptance` 提供结构截图；窄窗口专项仍待扩展 | 三种目标尺寸、主题、焦点、无横向溢出 | 部分自动化可执行，目标桌面 DPI 待回填 |
| `W0-NAV-F` | `D-NAV` 项目/会话导航 | 桌面桥接、SQLite、隔离 fixture | `UI-ACC-NAV-FIXTURE-001` | store、删除对话框和搜索单元证据；组件直测仍需补 | 临时目录、多项目、多会话、删除边界和当前搜索；不调用 Ollama | 切换、恢复、确认、错误重试、结果范围 | 待编写，可先行 |
| `W0-EDITOR-F` | `D-EDITOR` 基础编辑器 | 工作区/文件桥接 | `UI-ACC-EDITOR-001` | 文件 API、保存、越界测试 | 临时工作区、保存冲突和 Unicode 路径；不得覆盖用户文件 | 文件树、打开、编辑、保存、预览 | 待编写，可并行 |
| `W0-SHELL-MENU-F` | `D-SHELL` + 入口 fixture | `W0-SHELL-MENU-P`、`W0-NAV-F`、`W0-EDITOR-F`；设置使用可控 UI fixture | `UI-ACC-TITLE-BAR-FIXTURE-001` | 通过隔离项目/文档 fixture 验证菜单动作到页面和状态保持；不调用 Ollama | 同一标题栏专项计划的 F 子集；临时目录和结果 JSON 必须独立记录 | 添加/刷新项目、新建会话、页面状态、编辑焦点、设置打开/返回 | 计划已建立；需等待关联 fixture 门槛，不得与 P 子集混报 |
| `W1-MODEL-E` | `D-MODEL` 模型设置 | 桌面桥接、SQLite、系统凭据库 | `UI-ACC-SETTINGS-001` | `SettingsPage.test.tsx`、硬件和隐私测试 | 设置连接/凭据冒烟脚本；确认 profile 后再执行真实模型 | 设置入口、保存、切换、删除、键盘导航 | 自动化已有；脚本待编写 |
| `W1-INTENT-E` | `D-INTENT` IntentRouter | 模型 profile 和真实模型 | `AGENT-ACC-INTENT-001` | `intent-router-acceptance-cli.test.ts` | `npm run test:intent-router-acceptance -- --profile-id <id> --json`；统一 JSON 外层字段待核对 | profile、日志、失败恢复 | 脚本已有；真实 Ollama 待执行 |
| `W2-CHAT-E` | `D-CHAT` 对话 | W0 壳层、W1 模型/IntentRouter | `UI-ACC-CHAT-001` | 消息、流式、停止和运行锁定测试 | 真实短对话、停止、超时和错误恢复脚本 | 发送/停止、流式完成、模型状态、失败重试 | 待编写，依赖 W1 |
| `W2-NAV-E` | `D-NAV` 真实导航 | `W0-NAV-F`、`W2-CHAT-E` | `UI-ACC-NAV-E2E-001` | 会话状态和持久化测试待补 | 真实多项目、多轮会话、标题策略、目标全局搜索跳转 | 标题前后、刷新、搜索分组和 Escape 返回 | 阻断：`CF-022`/`CF-023` 与目标实现待完成 |
| `W3-CONTEXT-E` | `D-CONTEXT` 上下文分析 | W0 编辑器、W1 模型、W2 对话 | `UI-ACC-CONTEXT-001` | 召回、权限、预算和来源收据测试 | 固定 fixture + 真实模型调用 | 选择文件、权限、来源和超限 | 待编写，依赖 W1/W2 |
| `W3-REVISION-E` | `D-REVISION` AI 改稿 | W0 编辑器、W2 对话 | `UI-ACC-EDITOR-002` | 提案解析、接受/拒绝和保存测试 | 真实模型改稿、冲突和提案完整性 | DiffProposal、接受/拒绝、保存 | 待编写，不与基础编辑器混写 |
| `W4-TASK-E` | `D-TASK-LOG` 长任务/日志 | W2 对话；分析还需 W3 上下文 | `UI-ACC-LOGS-001` | Worker/TaskJob、状态转换和恢复测试 | 长任务、暂停/失败/恢复和产物完整性 | 进度、失败、重试、产物查看 | 待编写，fixture UI 可提前 |
| `W4-NAV-R` | `D-NAV` 跨域回归 | W2 导航、W3 改稿、W4 任务 | `UI-ACC-NAV-REGRESSION-001` | 过期响应、运行锁定和草稿保护测试待补 | 运行中任务、生成中会话、未保存文档下切换/删除 | 阻断、确认、取消、保存和恢复 | 待编写，等待依赖域 |
| `W4-RESP-R` | `Q-RESP` 全局回归 | 各页面完成 | `UI-ACC-RESPONSIVE-REGRESSION-001` | 跨页面渲染/可访问性回归待补 | Windows/macOS 尺寸、DPI、菜单、主题和焦点复核 | 全页面无重叠、状态不丢失 | 待编写，最后执行 |

## 4. 导航域脚本专项

### 4.1 `W0-NAV-F` fixture 合同

脚本必须生成并清理自有临时目录，至少包含两个项目、每项目两条会话和中英文文档。用例覆盖添加/去重、项目切换、会话恢复/删除、删除不触碰文件、当前搜索边界、加载失败和重试。结果必须包含 `fixtureManifest`、项目/会话计数、数据库摘要、文件 SHA-256 和退出码。禁止把真实用户目录作为 fixture。

### 4.2 `W2-NAV-E` 真实端到端

先由测试人员确认 `W1-MODEL-E` 和 `W2-CHAT-E` 的 profile/模型。脚本创建两个项目，每个至少三条会话并完成多轮消息；分别记录临时标题、语义标题（若已实现）、手动标题优先和刷新后持久化。全局搜索尚未实现时必须输出 `BLOCKED`，不能以当前侧栏搜索替代。

### 4.3 `W4-NAV-R` 跨域回归

脚本需要可控地产生运行中会话、后台任务、未保存文档和延迟搜索响应，验证切换/删除的阻断或确认、保存后继续以及过期响应丢弃。只报告交叉风险，不重复完整 CRUD。

## 5. 模型设置与真实模型执行顺序

1. 执行 `W0-SHELL-P`、`W0-RESP-P` 和不依赖模型的 `W0-NAV-F`/`W0-EDITOR-F`。
2. 测试人员启动 Vinkey，在设置页确认 profile、模型、连接和系统凭据条件。
3. 使用 `--list-profiles` 或等效入口确认 profile，再执行 `W1-MODEL-E` 和 `W1-INTENT-E`。
4. 真实模型通过后执行 `W2-CHAT-E`，再执行 `W2-NAV-E`；不得反过来用无模型 fixture 冒充真实会话。
5. `W3`、`W4` 按总计划依赖关系执行，并回传 `result.json`、日志、人工观察表和截图/录屏索引。

## 6. 新脚本编写任务单

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

## 7. 完成定义与阻断处理

脚本只有同时具备核心实现、macOS/Linux 入口、Windows 入口、npm 入口、CLI 合同测试、`--json` schema、仓库外冒烟记录和失败归因时才能标记“已有”。环境库缺失、Ollama 未启动、没有目标模型、系统凭据不可用或目标设计尚未实现时，应产出 `BLOCKED` 和复现信息，不能修改脚本绕过。

## 8. 复审节奏

- 每次 Vinkey 版本发布：重跑 P0 脚本和受影响的 F/E/R 门槛。
- 模型、提示合同、输出 schema、连接协议或凭据边界变化：重跑 `D-MODEL`、`D-INTENT`、`D-CHAT` 及依赖域。
- `CF-022`/`CF-023` 证据或目标设计变化：先更新 `FEATURE_DECISIONS.md` 和导航设计，再更新 `W2-NAV-E` 用例。
- 竞品名录、术语或市场准入变化：先更新 `TERMINOLOGY.md`/`COMPETITOR_CATALOG.md`，再复审设计证据链。
