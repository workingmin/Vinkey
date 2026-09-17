# IntentRouter 测试与验收

- 对应设计：[IntentRouter 专项设计](INTENT_ROUTER_DESIGN.md)
- 评测套件：`intent-model-eval-1`
- 目标：分别验证确定性路由合同与真实本地模型的 Agent 分类能力

## 1. 测试分层

| 层级 | 是否调用真实模型 | 验证内容 |
| --- | --- | --- |
| TypeScript 单元测试 | 否 | 路由规则、目标去重、单/多/无文件、Agent/Skill 映射 |
| 配置与评测合同测试 | 否 | profile/connection 关联、无正文提示、流式拼接、严格 JSON 和评分 |
| Rust 调度测试 | 否 | `TaskPlan` 跨端字段、枚举和执行准入 |
| macOS/Windows 本地验收 | 是 | 已安装配置和实际模型能否完成版本化分类用例 |

CI 的 mock 结果只能证明代码合同正确，不能证明某个本地模型具备分类能力。模型能力结论必须来自最后一层。

## 2. 确定性测试矩阵

| 用例 | 输入 | 目标 | 预期 Agent / Skill | `documentSelection` |
| --- | --- | --- | --- | --- |
| `no-file-general-chat` | 帮我想三个标题 | 无 | `GeneralConversation / general-conversation` | `none` |
| `single-file-analysis` | 分析这个文档的故事主线 | 单文件 | `StoryDeconstruction / long-text-analysis` | `single` |
| `single-file-character-analysis` | 林晚和林崇山是什么关系 | 单文件 | `StoryDeconstruction / character-arc-extraction` | `single` |
| `multi-file-continuity-review` | 检查这几章有没有前后矛盾 | 多文件 | `ContinuityReviewer / continuity-review` | `multiple` |
| `single-file-revision` | 根据这个文件改写一版 | 单文件 | `RevisionEditor / document-revision` | `single` |
| `multi-file-revision` | 统一润色所选文件 | 多文件 | `RevisionEditor / document-revision` | `multiple` |
| `workspace-overview` | 当前项目有哪些文件 | 无 | `StoryDeconstruction / workspace-overview` | `none` |
| `workspace-deep-analysis` | 详细分析这个项目的人物关系 | 无 | `StoryDeconstruction / workspace-analysis` | `none` |

还必须覆盖：重复 mention 去重、中文路径、路径内路由关键词不误触发、附带文件但普通聊天仍为 `documentAccess=none`、非法模型 JSON 不被接受。

## 3. 开发测试命令

仓库依赖安装完成后运行：

```bash
NODE_ENV=test npm test -- --run \
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
npm test -- --run src/lib/intent.test.ts src/lib/taskRuntime.test.ts src/lib/intentModelEvaluation.test.ts
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

人类可读输出逐项显示 `PASS/FAIL`，最后显示 Agent 准确率和全字段精确匹配率。

| 退出码 | 含义 |
| --- | --- |
| `0` | 8 个版本化用例全部精确匹配 |
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
