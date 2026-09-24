# UI 测试验收脚本设计规范

- 状态：当前版本验收规范
- 更新日期：2026-09-24
- 适用端：Windows、macOS；Linux 仅用于开发机或 CI 的代码层验证
- 应用壳层浏览器实现：[Playwright 验收脚本](../../../scripts/ui-shell/run-ui-shell-acceptance.mjs)
- macOS 原生实现：[Accessibility/System Events 验收脚本](../../../scripts/ui-shell/run-ui-shell-native-macos.sh)
- 关联计划：[UI_ACCEPTANCE_SCRIPT_PLAN.md](./UI_ACCEPTANCE_SCRIPT_PLAN.md)
- 关联回填模板：[UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md](./acceptance/UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md)、[UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md](./acceptance/UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)、[UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md](./acceptance/UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md)
- 标题栏菜单专项：[UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./acceptance/UI_ACCEPTANCE_TITLE_BAR_PLAN.md)

## 1. 目的与适用范围

测试验收脚本是“测试代码”和“验收报告”之间的可重复证据采集工具。它不代替 UI 设计评审，也不把一次 mock 测试误认为真实 Ollama 能力。每个功能域应按需要组合以下三层：

| 层级 | 是否调用真实服务 | 主要证据 | 适合执行位置 |
| --- | --- | --- | --- |
| 自动化测试 | 否，除非测试明确标记为集成测试 | Vitest、Rust 测试、CLI 合同测试 | CI、开发机 |
| 本地环境脚本 | 是或读取真实本机配置 | Ollama/兼容服务响应、SQLite 配置、版本和退出码 | 测试人员的 macOS/Windows |
| 人工 UI 验收 | 由测试人员观察 | 入口链路、视觉状态、键盘操作、截图/录屏和备注 | 测试人员的 macOS/Windows |

本规范覆盖 UI 组件测试的辅助入口、跨模块验收、本地 Ollama 验收和人工 UI 验收的证据归档。脚本不得为了“绿色”而改写业务结果、跳过失败用例或把环境阻断标记为通过。

## 2. 与统一生命周期的关系

当前版本采用扩展后的统一生命周期：

```text
功能域
→ 竞品证据
→ 设计决策
→ 前后端实现
→ 自动化测试代码
→ 本地环境验收脚本
→ 测试人员执行与证据回传
→ 验收报告
→ 遗留项复审
```

原有设计追踪节点仍然合理，但无法单独表达真实 Ollama、操作系统凭据库、窗口行为和人工观察。因此“本地环境脚本”和“证据回传”是当前版本的必选控制点；没有这两项时，报告最多只能给出代码层通过或条件通过。

脚本结果还必须标明验收门槛：`P` 表示平台/结构、`F` 表示 fixture/合同、`E` 表示真实端到端、`R` 表示跨域回归。例如 `W0-NAV-F` 中的 `F` 不要求 Ollama，`W2-NAV-E` 中的 `E` 必须记录真实模型/profile，`W4-NAV-R` 中的 `R` 必须记录跨域前置状态。`W0` 至 `W4` 是排期阶段，`D-*` 才是功能域身份。

应用壳层的 `W0-SHELL-P` 只覆盖窗口/Overlay、窗口控制、侧栏与内容容器、设置替换、诊断/错误承载、主题/焦点和响应式基线。标题栏菜单树、菜单项动作、中文审计、菜单 Escape/外部点击和编辑命令焦点分派属于 `W0-SHELL-MENU-P/F`，壳层脚本不得通过菜单选择器或旧菜单结果扩大 `W0-SHELL-P` 的结论范围。

## 3. 目录与职责边界

遵循 [`scripts/README.md`](../../../scripts/README.md) 和 [`tests/README.md`](../../../tests/README.md)：

| 位置 | 放置内容 | 禁止内容 |
| --- | --- | --- |
| `src/**/*.test.ts(x)` | 与单个模块紧密相关的 Vitest 测试 | 依赖真实 Ollama 的长时间验收 |
| `tests/<domain>/` | 跨模块合同测试、CLI 测试、测试素材和 harness | 面向测试人员的命令行入口 |
| `scripts/<domain>/` | 可执行验收脚本、跨平台包装器和结果格式化 | `*.test.*`、永久 API Key、业务 fixture 正文 |
| `docs/design/ui/acceptance/` | 报告、回填模板和人工观察记录 | 未脱敏的原始日志或凭据 |
| 测试人员本地归档目录 | `result.json`、原始平台诊断、截图/录屏和校验清单；完整终端 stdout/stderr 仅在需要时由调用方另行保存 | 提交到 Git 的密钥、正文全文、个人目录信息 |

脚本必须通过自身路径解析仓库根目录，不能依赖调用者当前目录。Shell、PowerShell 和 npm 入口应调用同一份核心实现，不能各自复制业务逻辑。

## 4. 脚本入口与参数契约

### 4.1 跨平台入口

每个需要真实本地验收的脚本至少提供：

- macOS/Linux：`run-<domain>-acceptance.sh`，使用 `set -euo pipefail`，解析脚本所在路径后切换到仓库根目录。
- Windows：`run-<domain>-acceptance.ps1`，使用 `$ErrorActionPreference = "Stop"`，通过 `Push-Location`/`Pop-Location` 保证路径恢复。
- 统一入口：在 `package.json` 注册 `test:<domain>-acceptance`，让 npm 参数在两个平台保持一致。

包装器只负责参数转换、工作目录和退出码透传；业务读取、请求、断言和 JSON 生成放在 TypeScript 核心脚本中。现有 `scripts/intent-router/` 是该模式的基准实现。

### 4.2 通用参数

参数名称保持跨功能域稳定；功能域专属参数必须使用长参数并在 `--help` 中说明。

| 参数 | 用途 | 约束 |
| --- | --- | --- |
| `--profile-id <id>` | 指定要验收的模型 profile | 不传时只可读取已持久化的当前 profile；不得猜测最新记录 |
| `--db <path>` | 指定只读的 `vinkey.sqlite3` | 只读打开；路径写入结果但应在报告中脱敏 |
| `--timeout-ms <ms>` | 单用例或单请求超时 | 必须有上限；超时属于失败或阻断，不得无限等待 |
| `--log-file <path>` | 指定逐用例诊断日志 | 父目录不存在时应给出明确错误；日志不含凭据 |
| `--json` | 输出完整机器可读结果 | stdout 只能输出 JSON，诊断信息写 stderr 或日志 |
| `--list-profiles` | 只读列出可用 profile | 不调用模型、不修改 SQLite；退出码为 0 表示配置读取成功 |
| `--help` | 输出用法和环境变量 | 不读取数据库，不调用服务 |

命令行参数优先级为：显式参数 > 功能域环境变量 > 平台默认值。至少应沿用 `VINKEY_DB_PATH`、`VINKEY_PROFILE_ID` 的命名方式；需要临时 API Key 时使用 `VINKEY_MODEL_API_KEY`，并在进程结束后清除。

## 5. 输出与 JSON Schema 契约

脚本必须同时提供人类可读输出和机器可读输出。两者必须来自同一份内存结果，不能分别重新执行测试。

### 5.1 必填字段

JSON 顶层字段保持稳定，新增字段只能向后兼容地追加：

```json
{
  "schemaVersion": 1,
  "generatedAt": "<ISO-8601>",
  "acceptance": {
    "id": "<W0-NAV-F>",
    "domainId": "<D-NAV>",
    "gate": "<P|F|E|R>"
  },
  "suite": { "id": "<SUITE_ID>", "version": "<SUITE_VERSION>" },
  "repository": {
    "version": "<VINKEY_VERSION>",
    "gitSha": "<GIT_SHA>",
    "dirty": false,
    "lastCommitter": "<GIT_COMMITTER>"
  },
  "application": {
    "version": "<INSTALLED_APP_VERSION>",
    "buildNumber": "<BUNDLE_BUILD_NUMBER>",
    "gitSha": "<EMBEDDED_GIT_SHA_OR_NULL>",
    "architectures": ["<arm64|x86_64>"]
  },
  "provenance": {
    "status": "<PASS|FAIL|BLOCKED>",
    "versionMatch": true,
    "gitShaMatch": true,
    "repositoryClean": true
  },
  "execution": {
    "executor": "<TESTER_OR_GIT_COMMITTER>",
    "executorBasis": "<IDENTITY_SOURCE>"
  },
  "environment": {
    "os": "<macOS|Windows>",
    "osVersion": "<OS_VERSION>",
    "arch": "<arm64|x64>",
    "node": "<NODE_VERSION>",
    "rust": "<RUST_VERSION_OR_NA>",
    "tauriCli": "<TAURI_CLI_VERSION_OR_NA>",
    "tauriFramework": "<TAURI_FRAMEWORK_VERSION_OR_NA>",
    "ollama": "<OLLAMA_VERSION_OR_NA>"
  },
  "selectedModel": {
    "profileId": "<PROFILE_ID>",
    "profileName": "<PROFILE_NAME>",
    "model": "<MODEL_NAME>",
    "connectionKind": "<ollama|openai-compatible>",
    "connectionBaseUrl": "<BASE_URL>"
  },
  "cases": [],
  "summary": { "caseCount": 0, "passed": 0, "failed": 0, "blocked": 0 },
  "exitCode": 0,
  "artifacts": { "manifestFile": "SHA256SUMS", "screenshots": [], "sha256": {} },
  "conclusion": "<PASS|FAIL|BLOCKED>"
}
```

每个 `cases[]` 元素至少包含 `caseId`、`title`、`status`；自动计时用例还应包含 `durationMs` 和 `error`（无错误时为 `null`），平台原始事件可使用 `detail` 和 `source`。真实模型用例还应记录模型原始结果、工程化结果、提示/套件版本和失败归因。桌面安装包验收必须区分 `application.gitSha` 与 `repository.gitSha`，不能用当前仓库 SHA 推定安装包来源；无法取得嵌入 SHA 时将 provenance 标为 `BLOCKED`。字段名称沿用 IntentRouter 的 `schemaVersion`、`selectedModel`、`summary`、`logFile` 和 `cases`，避免不同功能域出现 `model`/`modelName` 等同义字段。新增脚本不得省略 `acceptance.id`、`acceptance.domainId` 或 `acceptance.gate`；旧脚本迁移期间可由报告适配器根据命令参数补齐，但不能猜测门槛。

**现有脚本迁移说明**：当前 IntentRouter 的 `--json` 输出已经提供 `selectedModel`、`logFile`、评测 `summary` 和逐用例结果；其诊断日志也有 `schemaVersion`。但它尚未把 `repository`、`environment`、`artifacts` 和顶层 `conclusion` 放入同一个 JSON 外层。新功能域应直接使用本节完整结构；IntentRouter 后续按兼容方式补齐字段，在迁移完成前由验收报告适配器根据退出码和 `effectiveSummary.passed` 推导 `conclusion`，不得把缺少元数据误写成“规范已完全实现”。

### 5.2 人类可读输出

环境、模型/profile、套件版本和逐用例结果只写入 `result.json`；终端 stdout 保持短且稳定，不作为第二份结果或日志。输出不得只写“测试通过”，也不得把没有执行的用例计入通过数。

`--json` 模式下 stdout 只允许一个完整 JSON 文档；若需要进度信息，写入 stderr。原始 JSON 应保存为测试证据，报告只引用摘要和 SHA-256。

`result.json` 是批次唯一的机器可读结果源；不得再生成内容重复的 `result.txt` 或伪造的 `stdout.txt`。脚本 stdout 只输出最终摘要，不承担逐用例日志或第二份结果文件，固定为以下四行：

```text
<suite> acceptance: <PASS|FAIL|BLOCKED> (<passed>/<caseCount> passed, <failed> failed, <blocked> blocked)
Results: <absolute-path>/result.json
SHA256SUMS: <absolute-path>/SHA256SUMS
exit=<exitCode>
```

逐用例进度、服务启动信息和异常详情写入 stderr；`result.json.exitCode` 是退出码唯一归档事实，终端最后一行 `exit=<n>` 只用于让 CI/人工日志可见，不能再被当作第二个结果源。测试人员无需手工执行 `echo $?`。

## 6. 退出码与结论

保持与现有 IntentRouter 入口兼容：

| 退出码 | 含义 | 报告处理 |
| --- | --- | --- |
| `0` | 配置检查成功，或全部准入条件满足且用例通过 | 可作为机器层通过证据，但仍需人工 UI 结果 |
| `1` | 参数错误、脚本异常、数据库不可读或请求基础设施异常 | 标记为阻断或脚本失败，不能归入业务失败 |
| `2` | 脚本执行完成但有业务断言/模型用例失败 | 标记为不通过，保留逐用例失败原因 |
| 其他 | 功能域明确声明的专用状态 | 必须在脚本规范和报告中注册后使用 |

“阻断”与“失败”必须分开：无法启动 Ollama、缺少 GTK、没有凭据或平台 API 不可用是阻断；页面可进入但结果错误是功能失败。

退出码只写入 `result.json` 顶层 `exitCode`，并在终端以 `exit=<n>` 打印。`SHA256SUMS` 校验 `result.json`、截图和其他原始证据，不校验终端 stdout/stderr；如测试人员需要保留完整终端转储，应在脚本外重定向为附加文件，并将该文件加入 `SHA256SUMS` 后再回传。

## 7. 安全、隐私与可重复执行

- 不输出 API Key、系统凭据、完整用户正文、Authorization header 或完整 Cookie。连接结果只保留协议、脱敏地址和 `hasApiKey`。
- 日志中的绝对路径应尽量替换为 `<REPO_ROOT>`、`<USER_HOME>` 等占位符；模型输入正文只记录稳定的 `caseId`，除非专项报告明确批准保留脱敏片段。
- 脚本默认只读 SQLite；需要写入的 fixture 或临时目录必须显式命名并在结束时清理。
- 相同版本、相同 profile 和相同参数重复执行应产生可比较结果；时间戳和耗时可以不同，套件版本、case ID 和字段语义不能漂移。
- 真实 Ollama 评测应固定温度、上下文窗口、套件版本和超时；报告中记录模型标签，不把模型 `modelScore` 当作概率。
- 失败时保留 `result.json`、`SHA256SUMS` 和平台诊断文件；终端 stdout/stderr 是否另行保存由调用方决定。清理只删除临时目录，不删除测试人员指定的归档文件。

## 8. 脚本自身的测试要求

每个脚本至少配套：

1. CLI 合同测试：参数解析、默认值、未知参数、超时边界、`--json` 单文档输出和退出码。
2. 配置读取测试：不存在数据库、缺少 profile/connection、多个 profile、中文路径和脱敏字段。
3. 失败注入测试：HTTP 非 2xx、非法 JSON、超时、空模型结果、断开连接；测试不依赖真实 Ollama。
4. 结果契约测试：必填字段、`schemaVersion`、用例计数和 `PASS/FAIL/BLOCKED` 映射。
5. 至少一次 macOS 和 Windows 手工冒烟：从仓库外目录调用入口，确认脚本仍能定位仓库根目录并透传退出码。

真实本地模型用例不应在普通 CI 中隐式执行；由测试人员按[脚本编写计划](./UI_ACCEPTANCE_SCRIPT_PLAN.md)和本地环境前置条件显式运行。

## 9. 测试人员证据回传规范

### 9.1 输出文件责任边界

| 文件/目录 | 必选性 | 唯一责任 | 不承担的责任 |
| --- | --- | --- | --- |
| `result.json` | 所有脚本必选 | 批次元数据、逐用例状态、汇总、`conclusion`、唯一 `exitCode` 和证据索引 | 不替代截图原件、平台原始日志或终端转储 |
| `SHA256SUMS` | 所有脚本必选 | 校验 `result.json`、截图和实际产生的原始证据 | 不记录新的测试结论，不校验自身或未归档的终端流 |
| `screenshots/`、录屏 | 按功能域 | 可视化 UI/平台行为原件 | 不作为机器通过/失败判定源 |
| `display-info.txt` | macOS 显示诊断时 | `system_profiler` 原始显示器信息 | 不等同于物理 DPI 结论 |
| `events.txt` | macOS 原生脚本 | Accessibility/System Events 用例原始结果 | 不替代 `result.json` 汇总 |
| `automation-stderr.txt` | macOS 原生脚本 | `osascript` 原始 stderr | 不代表整个 shell 进程 stderr |
| `native-automation.applescript` | macOS 原生脚本 | 本批次实际执行的自动化输入 | 不代表应用源码版本 |
| `tauri-dev.log` | macOS `--dev` 时 | 桌面开发进程启动/运行日志 | 不替代用例结果 |
| `webview/` | 原生批次包含 Playwright companion 时 | companion 自身的 `result.json`、截图和子清单，便于独立复核 | 不替代顶层统一结论或原生平台证据 |
| `webview-stdout.txt` | 原生批次包含 companion 时 | 隔离内部子进程固定四行输出，防止污染顶层 stdout | 不作为第二份结果源 |
| `webview-stderr.txt` | 原生批次包含 companion 时 | Vite/Playwright 逐用例和异常诊断 | 不作为顶层结论 |

每次执行以以下目录结构归档（目录可位于本地或测试附件系统，不要求提交原始日志到 Git）：

```text
<domain>-<YYYYMMDD>-<platform>-<profile-safe-name>/
├── result.json                         # 必选：唯一机器结果源
├── SHA256SUMS                          # 必选：结果与原始证据完整性清单
├── screenshots/                        # 按功能域产生的截图/录屏帧
├── display-info.txt                    # macOS 原生可选：显示器原始信息
├── events.txt                          # macOS 原生可选：Accessibility 事件结果
├── automation-stderr.txt              # macOS 原生可选：osascript 原始 stderr
├── native-automation.applescript      # macOS 原生可选：本批次生成的自动化输入
├── tauri-dev.log                       # macOS --dev 可选：开发应用启动日志
├── webview-stdout.txt                  # macOS companion：内部子进程 stdout
├── webview-stderr.txt                  # macOS companion：内部子进程 stderr
└── webview/                            # macOS companion：独立结果、清单和截图
```

回传给验收报告的最小集合是：`result.json`、`SHA256SUMS`、执行命令、人工 UI 观察表、截图/录屏索引和该平台实际产生的原始诊断文件。报告按功能域使用对应模板回填：模型设置使用 [`UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md`](./acceptance/UI_ACCEPTANCE_SETTINGS_RUN_TEMPLATE.md)，壳层使用 [`UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md`](./acceptance/UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)，项目/会话导航使用 [`UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md`](./acceptance/UI_ACCEPTANCE_NAVIGATION_RUN_TEMPLATE.md)。未提供原始 JSON 或人工观察时，结论保持“待回填”或“条件通过”。

测试人员可以上传完整附件，也可以在协作平台只粘贴脱敏摘要并提供文件 SHA-256。任何上传前必须检查 API Key、正文、用户目录和系统凭据是否已脱敏。
