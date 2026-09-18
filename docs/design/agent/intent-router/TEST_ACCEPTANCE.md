# IntentRouter 测试与验收

- 对应设计：[IntentRouter 专项设计](README.md)
- 三层架构：[IntentRouter 三层架构与本地模型补强](ARCHITECTURE.md)
- 候选式测试计划：[IntentRouter 候选路由测试计划](TEST_PLAN.md)
- 配置审计：[Vinkey 配置持久化审计](../CONFIG_PERSISTENCE_REVIEW.md)
- 评测套件：`intent-router-eval-3`
- 目标：分别验证确定性路由合同，以及“本地模型候选输出 + IntentRouter 工程化校验”的实际 Agent 分类能力

## 1. 测试分层

| 层级 | 是否调用真实模型 | 验证内容 |
| --- | --- | --- |
| TypeScript 单元测试 | 否 | 路由规则、目标去重、单/多/无文件、Agent/Skill 映射 |
| 配置与评测合同测试 | 否 | profile/connection 关联、无正文提示、流式拼接、严格 JSON 和评分 |
| Rust 调度测试 | 否 | `TaskPlan` 跨端字段、枚举和执行准入 |
| macOS/Windows 本地验收 | 是 | 已安装配置和实际模型经工程化路由校验后能否完成版本化分类用例 |

CI 的 mock 结果只能证明代码合同正确，不能证明某个本地模型具备分类能力。真实模型输入不包含 `caseId` 或期望分类名称，避免测试标签泄露答案。真实验收保留两套指标：`summary` 是模型原始 top-1 JSON 的能力指标，`effectiveSummary` 是经过候选排序、词元证据、目标数量和作用域事实校验后的 IntentRouter 有效指标；同时记录候选合同解析率、Top-2 召回率和澄清比例。只有后者决定脚本退出码。

## 2. 确定性测试矩阵

| 用例 | 输入 | 目标 | 预期 Agent / Skill | `documentSelection` |
| --- | --- | --- | --- | --- |
| `no-file-general-chat` | 帮我想三个标题 | 无 | `GeneralConversation / general-conversation` | `none` |
| `single-file-analysis` | 分析这个文档的故事主线 | `短篇/孔乙己.txt` | `StoryDeconstruction / long-text-analysis` | `single` |
| `single-file-character-analysis` | 分析阿Q与赵太爷之间的人物关系 | `中篇/阿Q正传.txt` | `StoryDeconstruction / character-arc-extraction` | `single` |
| `multi-file-continuity-review` | 检查这几章有没有前后矛盾 | 多文件 | `ContinuityReviewer / continuity-review` | `multiple` |
| `single-file-revision` | 根据这个文件改写一版 | `短篇/故乡.txt` | `RevisionEditor / document-revision` | `single` |
| `multi-file-revision` | 统一润色所选文件 | 多文件 | `RevisionEditor / document-revision` | `multiple` |
| `single-long-file-analysis` | 完整分析这篇小说的人物命运和情节结构，不要遗漏 | `中篇/阿Q正传.txt` | `StoryDeconstruction / character-arc-extraction` | `single` |
| `multi-file-comparison` | 比较所选文档的人物塑造和叙事视角 | 三文件 | `StoryDeconstruction / long-text-analysis` | `multiple` |
| `attached-file-unrelated-chat` | 给我三个适合雨天写作的灵感 | `短篇/故乡.txt` | `GeneralConversation / general-conversation` | `single` |
| `single-file-structure-segmentation` | 拆分章节和场景 | `中篇/阿Q正传.txt` | `StructureSegmentation / chapter-boundary-detect` | `single` |
| `workspace-overview` | 当前项目有哪些文件 | 无 | `StoryDeconstruction / workspace-overview` | `none` |
| `workspace-deep-analysis` | 详细分析这个项目的人物关系 | 无 | `StoryDeconstruction / workspace-analysis` | `none` |

还必须覆盖：重复 mention 去重、中文路径、路径内路由关键词不误触发、附带文件但普通聊天仍为 `documentAccess=none`、非法模型 JSON 不被接受。

共享测试素材位于 `tests/fixtures/chinese-fiction/`，包含 4 份公版中文小说文本、来源 URL、规模和 SHA-256 清单，可供 IntentRouter、Agent、Skill 和 Workflow 测试共同使用。`tests/fixtures/chinese-fiction.test.ts` 会校验当前评测用例引用的文档均存在于素材清单，并验证文件内容未漂移。需要在 Vinkey 中手工复核时，可直接把该目录作为工作区打开。

## 3. 开发测试命令

仓库依赖安装完成后运行：

```bash
NODE_ENV=test npm test -- --run \
  tests/fixtures/chinese-fiction.test.ts \
  src/lib/intent.test.ts \
  src/lib/taskRuntime.test.ts \
  src/lib/intentModelEvaluation.test.ts
```

全量前端测试和构建：

```bash
NODE_ENV=test npm test
npm run build
```

如果当前 shell 已设置 `NODE_ENV=production`，必须像上面一样显式覆盖，否则 React 组件测试会加载 production React。

Windows PowerShell 等价命令：

```powershell
$env:NODE_ENV = "test"
npm test -- --run tests/fixtures/chinese-fiction.test.ts src/lib/intent.test.ts src/lib/taskRuntime.test.ts src/lib/intentModelEvaluation.test.ts
npm test
npm run build
Remove-Item Env:NODE_ENV
```

Rust 合同测试：

```bash
cargo test --manifest-path src-tauri/Cargo.toml task_runtime::tests
```

Linux 构建机需要满足 Tauri 的 GLib/GDK 系统依赖；macOS/Windows 不使用这组 Linux GTK 依赖。

## 4. 真实模型验收前置条件

1. 安装 Node.js 22.5 或更高版本，推荐 Node.js 24 LTS。
2. 在仓库根目录执行 `npm ci --include=dev`，确保本地 `esbuild` 可用。
3. 至少启动过一次已安装的 Vinkey，并在设置页保存 model profile 和 connection。
4. Ollama 或 OpenAI-compatible 服务正在对应回环地址监听。
5. 模型已下载并能在 Vinkey 设置页通过连接检查。

CLI 只读 SQLite，不修改配置、会话或模型能力数据。它不读取 macOS Keychain 或 Windows Credential Manager；需要 Key 的本地兼容服务必须通过 `VINKEY_MODEL_API_KEY` 临时传入当前进程。

## 5. SQLite 配置来源

默认数据库路径：

```text
macOS    ~/Library/Application Support/com.vinkey.desktop/vinkey.sqlite3
Windows  %APPDATA%\com.vinkey.desktop\vinkey.sqlite3
```

CLI 读取 `model_profiles`、`model_profile_connections`、`model_connections`，并校验 profile/connection 关联、provider 和回环地址。

旧版桌面应用把 `vinkey.activeModelId` 保存在 WebView localStorage，而不是 SQLite。独立 CLI 无法可靠读取旧值，因此不能把 SQLite 中 `updated_at` 最新的 profile 当作“当前模型”。新版应用完成迁移后 CLI 会读取 SQLite 当前值；未迁移时应显式传入 `--profile-id`，避免误验其他模型。

新版 Vinkey 已将 `activeModelId` 持久化到 SQLite `app_preferences`。启动一次新版应用后，CLI 可以从 SQLite 读取带有 `（当前）` 标记的 profile；升级迁移和其他配置的保留策略见 [配置持久化审计](../CONFIG_PERSISTENCE_REVIEW.md)。

### 推荐执行顺序

在仓库根目录依次执行：

```bash
# 1. 查看帮助和参数（推荐入口）
npm run test:intent-router-acceptance -- --help

# 2. 只读检查 SQLite，并找出要验收的 profile ID
npm run test:intent-router-acceptance -- --list-profiles

# 3. 使用明确的 profile 执行全部 12 个版本化用例
npm run test:intent-router-acceptance -- --profile-id <profile-id>

# 4. 可选：保存机器可读结果用于验收归档
npm run test:intent-router-acceptance -- --profile-id <profile-id> --json > intent-router-acceptance-result.json
```

`--list-profiles` 不会调用模型，也不会执行分类用例。它会显示数据库路径、评测套件、用例总数和全部 profile，并标记 SQLite 中的当前 profile。确认标记无误后，可以直接执行评测或显式传入对应 ID；只有不带 `--list-profiles` 的第三步才会逐项调用真实本地模型。

每次真实评测默认会把诊断日志写入系统临时目录（macOS 通常是 `/tmp`，Windows 使用 `%TEMP%`），也可以显式指定路径：

```bash
./scripts/intent-router/run-intent-router-acceptance.sh --log-file /tmp/vinkey-intent-router-qwen3-8b.json
```

日志包含提示合同版本、数据库/profile、每个用例的原始输入、目标元数据、模型原始 JSON、候选排序、候选决策、margin、工程化有效预测、词元证据、期望结果、两套匹配字段、原始/有效错误归因和请求耗时。旧模型的单对象输出会标记为 `legacy-single`，不计入候选合同解析率。归因值包括 `format`（输出合同）、`scope-contract`（作用域）、`semantic-routing`（Intent/Agent/Skill）和 `mixed`。终端输出同时标出模型原始 PASS/FAIL 与工程化结果；日志适合归档和比较不同本地模型。

macOS/Linux 可只查看失败摘要：

```bash
jq '.cases[] | select(.effectiveExactMatch == false) | {caseId, diagnosis, resolutionSource, resolutionEvidence, prediction, effectivePrediction, expected, rawOutput}' /tmp/vinkey-intent-router-qwen3-8b.json
```

Windows PowerShell 可使用：

```powershell
(Get-Content $env:TEMP\vinkey-intent-router-qwen3-8b.json -Raw | ConvertFrom-Json).cases | Where-Object { -not $_.effectiveExactMatch } | Format-List caseId, diagnosis, resolutionSource, resolutionEvidence, prediction, effectivePrediction, expected, rawOutput
```

### 如何解读失败

- `documentSelection` 是由目标数量决定的事实字段：0/1/2+ 个目标对应 `none/single/multiple`，不应依赖模型自由发挥。
- `scope` 仍需结合语义：目标文件被真正要求分析时是 `selected-documents`；附带文件但只要求灵感/闲聊时是 `conversation`；项目级请求是 `workspace`。
- `intent`、`agent`、`skill` 是模型需要学习的语义分类。`故事主线/情节结构/叙事视角` 应偏向 `document-analysis + long-text-analysis`；`人物关系/人物命运` 应偏向 `character-analysis + character-arc-extraction`；“当前项目有哪些文件”和“项目级深度分析”分别对应 `workspace-overview` 与 `workspace-analysis`。
- 验收输出分别列出模型原始和工程化路由的“语义路由精确匹配”“上下文合同精确匹配”汇总，前者衡量 Intent/Agent/Skill，后者衡量目标数量和 scope 规则；工程化指标用于准入，原始指标用于观察模型能力和词元修正收益。

当前评测使用 `intent-router-prompt-4` 提示合同，要求模型输出最多 3 个候选、排序分数、reasonCodes 和澄清状态；Ollama 请求同时使用固定枚举的候选 JSON Schema。`modelScore` 只表示排序信号，不等同于校准概率；候选 margin 不足时进入澄清。不要在 CLI 中伪造 token attention 或修改模型权重：Ollama 的请求接口不提供可复现的逐 token 注意力控制，且这会掩盖模型实际分类能力。应优先比较原始候选、词元证据和有效路由结果，再通过固定版本的本地模型重新验收。

## 6. macOS 执行

在仓库根目录：

```bash
./scripts/intent-router/run-intent-router-acceptance.sh --list-profiles
./scripts/intent-router/run-intent-router-acceptance.sh --profile-id <profile-id>
```

输出完整 JSON 供归档：

```bash
./scripts/intent-router/run-intent-router-acceptance.sh --profile-id <profile-id> --json \
  > intent-router-acceptance-result.json
```

自定义数据库或超时：

```bash
./scripts/intent-router/run-intent-router-acceptance.sh \
  --db "$HOME/Library/Application Support/com.vinkey.desktop/vinkey.sqlite3" \
  --timeout-ms 180000
```

## 7. Windows 执行

在 PowerShell 的仓库根目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\intent-router\run-intent-router-acceptance.ps1 -ListProfiles
powershell -ExecutionPolicy Bypass -File .\scripts\intent-router\run-intent-router-acceptance.ps1 -ProfileId <profile-id>
```

也可以直接执行统一的 npm 入口：

```powershell
npm run test:intent-router-acceptance -- --list-profiles
npm run test:intent-router-acceptance -- --profile-id <profile-id>
```

输出完整 JSON：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\intent-router\run-intent-router-acceptance.ps1 `
  -ProfileId <profile-id> -LogFile "$env:TEMP\vinkey-intent-router.json" -Json |
  Out-File -Encoding utf8 intent-router-acceptance-result.json
```

需要 API Key 的本地兼容服务：

```powershell
$env:VINKEY_MODEL_API_KEY = "本次测试使用的临时 Key"
powershell -ExecutionPolicy Bypass -File .\scripts\intent-router\run-intent-router-acceptance.ps1 -ProfileId <profile-id>
Remove-Item Env:VINKEY_MODEL_API_KEY
```

macOS 和 Windows 也都可以直接使用统一入口：

```text
npm run test:intent-router-acceptance -- --list-profiles
npm run test:intent-router-acceptance -- --profile-id <profile-id> --json
```

## 8. 结果与退出码

### 配置检查输出

`npm run test:intent-router-acceptance -- --list-profiles` 的输出结构如下：

```text
Vinkey IntentRouter 本地模型专项评测 - 配置检查
数据库：<vinkey.sqlite3 路径>
评测套件：intent-router-eval-3（12 个版本化用例）
已配置模型：2 个
[1] router（当前）
    名称：Router
    模型：qwen3:8b
说明：--list-profiles 仅检查配置，未调用模型，12 个版本化用例尚未执行。
请确认带有 `（当前）` 标记的 profile；也可显式传入对应 profile ID 执行评测。
```

### 真实评测输出

人类可读输出首先声明将执行 12 个用例，然后按 `[01/12]` 到 `[12/12]` 显示 `PASS/FAIL` 及模型返回的 Intent、Agent、Skill、Scope、DocumentSelection。成功结尾如下：

```text
逐项结果（工程化路由精确匹配 12/12；模型原始 11/12）：
...
[12/12] PASS workspace-deep-analysis

汇总指标：
  执行完成：12/12
  JSON 解析：12/12（100.0%）
  候选合同解析率：100.0%
  候选 Top-2 召回率：100.0%
  澄清请求比例：0.0%
  模型原始全字段精确匹配率：91.7%
  工程化路由 Intent 准确率：100.0%
  工程化路由 Agent 准确率：100.0%
  工程化路由 Skill 准确率：100.0%
  工程化路由 Scope 准确率：100.0%
  工程化路由 DocumentSelection 准确率：100.0%
  工程化路由全字段精确匹配率：100.0%
验收结论：通过，工程化路由修正后 12 个版本化用例全部匹配；模型原始结果为 11/12。
```

`--json` 模式保持纯 JSON 输出，不打印启动提示，适合重定向到验收记录文件。

| 退出码 | 含义 |
| --- | --- |
| `0` | 工程化路由后的 12 个版本化用例全部精确匹配 |
| `1` | 配置、SQLite、网络、超时或模型响应调用失败 |
| `2` | 模型完成调用，但工程化路由后仍至少一个分类用例不匹配 |

当前模型评测准入标准：工程化 `effectiveSummary` 的 JSON 解析率、Intent/Agent/Skill/Scope/DocumentSelection 准确率和全字段精确匹配率均为 100%，候选合同解析率也必须为 100%。正文访问、Tool allowlist 和越权执行率仍由 `TaskPlan`/Rust/ToolGateway 测试单独保证，不能仅凭模型评测推断。`summary` 仍必须保留并用于观察模型原始能力；原始 11/12、工程化 12/12 表示模型有一处可由高置信词元或事实合同确定性修正的偏差，并不等同于 IntentRouter 验收失败。若工程化结果仍失败，先保留 JSON 输出，再判断是提示合同、模型能力、词元覆盖、候选 margin 还是注册映射发生变化；不能直接放宽期望值来使旧模型通过。

## 9. 常见问题

- **找不到数据库**：确认至少启动过一次安装版 Vinkey，或用 `--db` 指向实际文件。
- **选错模型**：运行 `--list-profiles`，再传 `--profile-id`。
- **连接被拒绝**：先启动 Ollama/兼容服务，并确认配置地址是 `localhost`、`127.x.x.x` 或 `::1`。
- **需要 API Key**：设置 `VINKEY_MODEL_API_KEY`；脚本不会读取操作系统凭据库。
- **模型返回 Markdown**：按严格合同记为失败，完整原始输出可在 `--json` 结果中查看。
- **Node SQLite 警告**：Node 22 可能显示 experimental warning，不影响只读执行；脚本使用 Node 内置 `node:sqlite`，各支持版本都不依赖外部 sqlite3 CLI。
- **单个用例超时**：用 `--timeout-ms` 增大到合理值，并记录模型和硬件信息。

## 10. 验收记录

每次真实跑批至少保存：测试日期、操作系统、Vinkey 版本/commit、suiteVersion、profileId、模型名、连接类型、上下文窗口、完整 summary、失败 case 和原始模型输出。不得记录 API Key。
