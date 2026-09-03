# Vinkey 开发框架与技术选型

- 状态：已确定，作为首版开发基线
- 日期：2026-08-24
- 参考项目：[NoteGen](https://github.com/codexu/note-gen)

## 1. 选型结论

Vinkey 采用 **Tauri 2 + React + TypeScript + Rust + SQLite** 的本地优先桌面架构。

界面布局、视觉令牌和交互约束见 [UI 设计方案](UI_DESIGN.md)。

NoteGen 已验证这条技术路线可同时覆盖 Windows、macOS、本地 Markdown 工作区、AI 对话和知识库。Vinkey 只参考其产品分层和工程思路，不直接复制代码：NoteGen 使用 GPL-3.0 许可证，且其 Tauri 文件能力包含全路径通配符。Vinkey 必须把“仅访问用户授权目录”作为后端强制边界。

## 2. 技术栈

| 领域 | 选型 | 用途 |
| --- | --- | --- |
| 桌面容器 | Tauri 2 | 生成 Windows `.exe` 和 macOS `.app` / `.dmg`，提供系统对话框、窗口和更新能力 |
| 前端 | React + TypeScript | 工作区、编辑器、上下文选择器、对话与设置界面 |
| 构建 | Vite | 前端开发服务和静态资源构建 |
| 样式 | Tailwind CSS | 统一布局、主题和响应式样式 |
| 无样式组件 | Radix UI | 对话框、菜单、标签页、提示和无障碍交互 |
| 图标 | Lucide React | 统一命令和工具图标 |
| 文本编辑器 | CodeMirror 6 | 直接编辑 Markdown/TXT，保持原文、换行和撤销语义 |
| Markdown 预览 | react-markdown + remark-gfm + rehype-sanitize | 安全预览 Markdown，支持 GFM |
| 前端状态 | Zustand | 管理标签页、当前文档、对话状态和界面偏好 |
| 后端 | Rust + Tauri Commands | 文件系统、模型请求、密钥、数据库和安全校验 |
| 模型 HTTP | reqwest | 连接 Ollama 和 OpenAI 兼容接口，处理流式响应 |
| 本地数据 | SQLite + SQLx | 保存会话、消息、文档引用、工作区记录和非敏感设置 |
| 密钥存储 | Rust `keyring` | 使用 macOS Keychain 和 Windows Credential Manager 保存 API Key |
| 前端测试 | Vitest + Testing Library | 组件、状态和对话组装逻辑 |
| 后端测试 | Rust unit/integration tests | 路径校验、文件操作、模型适配和数据库迁移 |
| 端到端测试 | Playwright | 覆盖工作区、编辑保存、上下文附加和对话流程 |

依赖的精确版本在初始脚手架阶段选用当时稳定版，并通过 lockfile 固定，不在本文档中写死小版本号。

## 3. 系统分层

```text
React WebView
  ├─ Workspace UI
  ├─ AI conversation UI
  ├─ CodeMirror editor + Markdown preview
  ├─ Context picker
  └─ Settings UI
          │ typed invoke/events
Rust application core
  ├─ WorkspaceGuard
  ├─ FileService
  ├─ LongTextServices
  │   ├─ DocumentIngestionService
  │   ├─ StructureParserService
  │   ├─ ChunkService
  │   ├─ TokenBudgetService
  │   ├─ SummaryCompressionService
  │   ├─ LongTextAnalysisService
  │   ├─ ArtifactCacheService
  │   ├─ EvidenceService
  │   ├─ ModelCapabilityService
  │   └─ JobService
  ├─ AgentRuntime
  │   ├─ IntentRouter
  │   ├─ TaskPlanner
  │   ├─ ToolRegistry
  │   ├─ SkillRegistry
  │   └─ Approval/Checkpoint
  ├─ ModelService
  │   ├─ OllamaProvider
  │   └─ OpenAICompatibleProvider
  ├─ ContextService
  ├─ ConversationRepository
  └─ SecretStore
          │
Local machine
  ├─ Authorized workspace folders
  ├─ SQLite app database
  ├─ OS credential store
  └─ Configured model endpoints
```

前端不直接获得通用文件系统和网络能力。所有文件和模型请求均经过 Rust 服务层，以便集中实施权限、超时、取消、日志脱敏和错误映射。

## 4. 工作区权限模型

1. 用户必须通过系统目录选择器授权一个工作目录。
2. Rust 后端保存授权根目录，前端只传递工作区 ID 和相对路径。
3. 每次读写前都要规范化根目录和目标路径，拒绝绝对路径、`..` 越界和符号链接逃逸。
4. 工作区外文件仅能通过单文件选择器临时附加为上下文，不自动获得写权限。
5. 不授予 WebView `fs:read-all`、`fs:write-all` 或 `path: "**"` 能力。
6. 应用重启后可重新打开已记录的工作区；若操作系统要求重新授权，必须由用户操作触发。

权限校验是 Rust 后端的安全边界，不依赖前端隐藏菜单或路径字符串前缀判断。

## 5. 文档与编辑器策略

首版仅把 `.md`、`.markdown` 和 `.txt` 识别为可编辑文档。文档内容保持 UTF-8 字节语义，读取时记录 BOM、LF/CRLF 和文件修改时间，保存时尽量原样保留。

选择 CodeMirror 6 而不是首版直接使用 TipTap WYSIWYG，原因是：

- Markdown/TXT 是真实数据源，不应在富文本和 Markdown 之间往返转换。
- 文学创作对长文本、中文输入法、撤销栈、选区和大文件性能更敏感。
- AI 改稿需要稳定的字符区间和 diff，源文本编辑器更容易保证位置一致性。

后续可在不改变文件格式的前提下增加所见即所得视图，但不作为 MVP 的基础依赖。

## 6. 模型适配层

对上层暴露统一的 `ModelProvider` 接口，首版实现两个适配器：

- `OllamaProvider`：使用 Ollama 原生 `/api/tags` 和 `/api/chat`，支持本机及用户配置的局域网地址。
- `OpenAICompatibleProvider`：使用 `/v1/models` 和 `/v1/chat/completions`，支持自定义 Base URL、模型名和 API Key。

每个提供商配置包含：名称、类型、Base URL、默认模型、超时、上下文窗口和可选请求头。API Key 不写入 SQLite 或 JSON，仅在数据库中保存密钥引用 ID。

后端只允许请求用户已保存配置的精确 origin。不使用只允许 localhost 的固定白名单，以便支持局域网 Ollama；也不给前端开放通用 HTTP 访问。

## 7. 本地数据边界

| 数据 | 存储位置 |
| --- | --- |
| Markdown/TXT 正文 | 用户授权的工作目录 |
| 对话、消息、文档引用 | 应用数据目录中的 SQLite |
| 模型地址、模型名、界面偏好 | SQLite 或应用配置文件 |
| API Key | 操作系统凭据库 |
| 日志 | 应用日志目录，不记录正文、完整 prompt 或 API Key |

### 运行日志与跨平台诊断

桌面端使用 Rust `RuntimeLogState` 统一写入 JSONL 运行日志：

- 文件位于 `app.path().app_data_dir()/vinkey-runtime.jsonl`，由 Tauri 在 macOS 和 Windows 分别映射到应用数据目录。
- 每行包含时间戳、级别、事件名和脱敏字段；写入后立即 flush，支持崩溃或卡顿后的证据收集。
- 记录应用启动、工作区恢复/刷新、文档读写/分块、全文搜索、模型连接、流式聊天和前端错误等事件。
- 不写入正文、完整 Prompt、上下文、API Key 或工作区绝对路径；路径字段使用工作区相对路径，错误文本会截断并脱敏。
- “帮助 → 运行日志”调用 `get_runtime_diagnostics`，显示最近 240 行并提供复制按钮；浏览器演示模式不创建本地日志。

提交跨平台问题时，优先提供复制出的日志、复现步骤、操作系统版本、模型服务类型和时间范围。日志仅用于本地诊断，不上传或自动发送到任何服务。

应用默认不启用遥测、云同步和账号系统。

## 8. 建议目录结构

```text
Vinkey/
├─ docs/
│  ├─ DEVELOPMENT_FRAMEWORK.md
│  └─ UI_DESIGN.md
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ workspace/
│  │  ├─ editor/
│  │  ├─ context/
│  │  ├─ chat/
│  │  └─ settings/
│  ├─ stores/
│  └─ lib/
├─ src-tauri/
│  ├─ capabilities/
│  ├─ migrations/
│  └─ src/
│     ├─ workspace/
│     ├─ files/
│     ├─ long_text/
│     │  ├─ ingestion.rs
│     │  ├─ structure.rs
│     │  ├─ chunking.rs
│     │  ├─ budget.rs
│     │  ├─ summaries.rs
│     │  ├─ analysis.rs
│     │  ├─ cache.rs
│     │  ├─ evidence.rs
│     │  ├─ capabilities.rs
│     │  └─ jobs.rs
│     ├─ agents/
│     ├─ skills/
│     ├─ models/
│     ├─ context/
│     ├─ conversations/
│     └─ secrets/
├─ tests/
│  └─ e2e/
└─ README.md
```

## 9. MVP 实施顺序

1. 初始化 Tauri 2、React、TypeScript 和跨平台构建流程。
2. 实现 `WorkspaceGuard` 和只读工作区浏览，先完成越界与符号链接测试。
3. 实现 Markdown/TXT 新建、打开、编辑、原子保存和外部变更检测。
4. 实现 SQLite 迁移、会话与设置持久化。
5. 实现 Ollama 和 OpenAI 兼容适配器及流式输出。
6. 实现手动文档上下文附加、预算计算和对话引用记录。
7. 完成 Windows/macOS 安装包、签名前验证和端到端测试。

## 10. 首版不引入

- 不引入服务端、强制账号或自建云代理。
- 不引入向量数据库；首版由用户显式选择上下文文档。
- 不引入 Electron、Next.js 或内嵌 Node.js 服务。
- 不引入 Word/PDF/OCR 解析。
- 不引入 WYSIWYG 与 Markdown 往返转换。
- 不让模型未经确认直接覆盖用户文档。

## 11. 架构验收门槛

开始功能开发前，项目脚手架必须满足：

- Tauri capability 中不存在全文件系统通配授权。
- WebView 无法绕过 Rust 命令直接读写本机文件。
- 对绝对路径、`..`、符号链接和工作区切换有自动化测试。
- 模型请求只能发往用户已配置的精确地址。
- 在未配置任何云服务时，文件编辑、保存和历史会话仍可完全离线使用。
