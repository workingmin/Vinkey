# IntentRouter 测试与验收

- 对应设计：[IntentRouter 专项设计](INTENT_ROUTER_DESIGN.md)
- 评测套件：`intent-model-eval-2`
- 目标：分别验证确定性路由合同与真实本地模型的 Agent 分类能力

## 1. 测试分层

| 层级 | 是否调用真实模型 | 验证内容 |
| --- | --- | --- |
| TypeScript 单元测试 | 否 | 路由规则、目标去重、单/多/无文件、Agent/Skill 映射 |
| 配置与评测合同测试 | 否 | profile/connection 关联、无正文提示、流式拼接、严格 JSON 和评分 |
| Rust 调度测试 | 否 | `TaskPlan` 跨端字段、枚举和执行准入 |
| macOS/Windows 本地验收 | 是 | 已安装配置和实际模型能否完成版本化分类用例 |

CI 的 mock 结果只能证明代码合同正确，不能证明某个本地模型具备分类能力。模型能力结论必须来自最后一层。真实模型输入不包含 `caseId` 或期望分类名称，避免测试标签泄露答案。

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

共享测试素材位于 `tests/fixtures/chinese-fiction/`，包含 4 份公版中文小说文本、来源 URL、规模和 SHA-256 清单，可供 IntentRouter、Agent、Skill 和 Workflow 测试共同使用。`scripts/chinese-fiction-fixtures.test.ts` 会校验当前评测用例引用的文档均存在于素材清单，并验证文件内容未漂移。需要在 Vinkey 中手工复核时，可直接把该目录作为工作区打开。

## 3. 开发测试命令

仓库依赖安装完成后运行：

```bash
NODE_ENV=test npm test -- --run \
  scripts/chinese-fiction-fixtures.test.ts \
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
npm test -- --run scripts/chinese-fiction-fixtures.test.ts src/lib/intent.test.ts src/lib/taskRuntime.test.ts src/lib/intentModelEvaluation.test.ts
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

桌面应用当前把 `vinkey.activeModelId` 保存在 WebView localStorage，而不是 SQLite。独立 CLI 无法可靠读取该值，因此默认选择 SQLite 中 `updated_at` 最新的 profile。需要验收应用当前选中的模型时，先列出 profile，再显式指定 ID。

### 推荐执行顺序

在仓库根目录依次执行：

```bash
# 1. 查看帮助和参数
npm run test:intent-model -- --help

# 2. 只读检查 SQLite，并找出要验收的 profile ID
npm run test:intent-model -- --list-profiles

# 3. 使用明确的 profile 执行全部 12 个版本化用例
npm run test:intent-model -- --profile-id <profile-id>

# 4. 可选：保存机器可读结果用于验收归档
npm run test:intent-model -- --profile-id <profile-id> --json > intent-model-eval-result.json
```

`--list-profiles` 不会调用模型，也不会执行分类用例。它会显示数据库路径、评测套件、用例总数、候选 profile，以及下一条建议命令。只有不带 `--list-profiles` 的第三步才会逐项调用真实本地模型。

## 6. macOS 执行

在仓库根目录：

```bash
./scripts/run-intent-model-eval.sh --list-profiles
./scripts/run-intent-model-eval.sh --profile-id <profile-id>
```

输出完整 JSON 供归档：

```bash
./scripts/run-intent-model-eval.sh --profile-id <profile-id> --json \
  > intent-model-eval-result.json
```

自定义数据库或超时：

```bash
./scripts/run-intent-model-eval.sh \
  --db "$HOME/Library/Application Support/com.vinkey.desktop/vinkey.sqlite3" \
  --timeout-ms 180000
```

## 7. Windows 执行

在 PowerShell 的仓库根目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-intent-model-eval.ps1 -ListProfiles
powershell -ExecutionPolicy Bypass -File .\scripts\run-intent-model-eval.ps1 -ProfileId <profile-id>
```

输出完整 JSON：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-intent-model-eval.ps1 `
  -ProfileId <profile-id> -Json |
  Out-File -Encoding utf8 intent-model-eval-result.json
```

需要 API Key 的本地兼容服务：

```powershell
$env:VINKEY_MODEL_API_KEY = "本次测试使用的临时 Key"
powershell -ExecutionPolicy Bypass -File .\scripts\run-intent-model-eval.ps1 -ProfileId <profile-id>
Remove-Item Env:VINKEY_MODEL_API_KEY
```

macOS 和 Windows 也都可以直接使用统一入口：

```text
npm run test:intent-model -- --list-profiles
npm run test:intent-model -- --profile-id <profile-id> --json
```

## 8. 结果与退出码

### 配置检查输出

`npm run test:intent-model -- --list-profiles` 的输出结构如下：

```text
Vinkey IntentRouter 本地模型专项评测 - 配置检查
数据库：<vinkey.sqlite3 路径>
评测套件：intent-model-eval-2（12 个版本化用例）
已配置模型：2 个
[1] router（默认候选）
    名称：Router
    模型：qwen3:8b
说明：--list-profiles 仅检查配置，未调用模型，12 个版本化用例尚未执行。
执行评测：npm run test:intent-model -- --profile-id router
```

### 真实评测输出

人类可读输出首先声明将执行 12 个用例，然后按 `[01/12]` 到 `[12/12]` 显示 `PASS/FAIL` 及模型返回的 Intent、Agent、Skill、Scope、DocumentSelection。成功结尾如下：

```text
逐项结果（精确匹配 12/12）：
...
[12/12] PASS workspace-deep-analysis

汇总指标：
  执行完成：12/12
  JSON 解析：12/12（100.0%）
  Intent 准确率：100.0%
  Agent 准确率：100.0%
  Skill 准确率：100.0%
  Scope 准确率：100.0%
  DocumentSelection 准确率：100.0%
  全字段精确匹配率：100.0%
验收结论：通过，12 个版本化用例全部执行成功且精确匹配。
```

`--json` 模式保持纯 JSON 输出，不打印启动提示，适合重定向到验收记录文件。

| 退出码 | 含义 |
| --- | --- |
| `0` | 12 个版本化用例全部精确匹配 |
| `1` | 配置、SQLite、网络、超时或模型响应调用失败 |
| `2` | 模型完成调用，但至少一个分类用例不匹配 |

当前严格准入标准：JSON 解析率 100%，Intent/Agent/Skill/Scope/DocumentSelection 准确率均为 100%，全字段精确匹配率 100%。真实模型失败时先保留 JSON 输出，再判断是提示合同、模型能力还是注册映射发生变化；不能直接放宽期望值来使旧模型通过。

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
