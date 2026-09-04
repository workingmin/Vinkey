# Vinkey
面向文学创作的本地大模型工作台。在本地管理文稿目录，对接 AI 大模型，所有文档数据留存本机，保护创作隐私。

当前项目已完成 Tauri 2 + React + TypeScript + Rust 的 MVP 脚手架。界面采用左侧授权工作区、中央 AI 对话区和右侧编辑/预览区；桌面端文件读写只经过 Rust 的工作区路径守卫。

## 当前能力

- 浏览、新建、编辑和保存授权目录内的 Markdown、TXT、代码和配置文本文件；图片、PDF、音视频可预览，二进制文件可下载
- 连接本机或局域网 Ollama，以及 OpenAI 协议兼容服务
- 测试连接、发现模型并以流式响应进行 AI 对话
- 显式选取本地文档作为上下文，并在发送前估算上下文预算
- 使用项目级 SQLite 在本机保存会话与消息，支持历史会话恢复；数据位于项目根目录 `.vinkey/conversations.sqlite3`，不随应用更新替换丢失
- 自动记住最近打开的工作区，重启 Vinkey 后恢复项目和对应会话历史；首次升级会将旧应用数据库中的会话迁移到当前项目
- 在授权工作区内进行文档全文搜索
- 长文本/项目分析完成后生成项目记忆候选；用户确认后保存到项目数据库，并在后续相关对话中作为辅助上下文检索
- 长文本分析会将任务清单、分块和摘要产物保存到项目 `.vinkey/analysis/jobs/`，应用重启后可发现并恢复未完成任务
- 深色和浅色主题；API Key 仅保存到 macOS Keychain / Windows Credential Manager
- 桌面端记录跨平台 JSONL 运行日志，可从“帮助 → 运行日志”查看并复制最近事件

## 本地开发

前置环境：Node.js 22+、Rust stable，以及 [Tauri 2 对应平台依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run desktop:dev
```

只调试浏览器界面时运行 `npm run dev`。浏览器模式自动载入内存演示工作区，不会访问本机目录。

### 桌面运行日志

macOS 和 Windows 桌面端会在 Tauri 应用数据目录写入 `vinkey-runtime.jsonl`。通常位于 macOS 的 `Application Support` 目录和 Windows 的 `%APPDATA%` 对应应用目录。日志采用 JSONL，每行一个事件，写入后立即 flush，便于应用异常退出后保留证据。

日志只记录启动、工作区、文档、搜索、模型连接和聊天任务的状态、耗时及计数，不记录正文、完整 Prompt、上下文或 API Key；工作区路径会显示为相对路径，敏感凭据会脱敏。跨平台测试遇到问题时，请打开“帮助 → 运行日志”，点击“复制日志”，再附上复现步骤、操作系统版本、模型服务类型和是否能稳定复现。

## 测试和构建

```bash
npm test
npm run build
```

Windows 应在 Windows 构建机执行：

```powershell
npm run package:win
```

产物为 `src-tauri/target/release/bundle/nsis/*.exe`。

macOS 应在 macOS 构建机执行：

```bash
npm run package:mac
```

产物为 `.app` 和 `.dmg`。需要更新本机安装版本并启动新应用时执行：

```bash
npm run package:mac -- --install --open
```

其中 `--install` 会将新生成的 `.app` 更新到 `/Applications/Vinkey.app`，`--open` 会启动该版本；不带参数时脚本只构建，不修改 `/Applications`。DMG 使用无 Finder 自动化的兼容模式生成，避免构建被 macOS 的 Apple Events 权限阻止。公开分发前需要配置 Apple Developer ID 证书、公证凭据；Windows 公开分发建议配置代码签名证书。脚本不会内置或读取仓库中的签名密钥。

## 开发文档

- [开发框架与技术选型](docs/DEVELOPMENT_FRAMEWORK.md)
- [UI 设计总览](docs/UI_DESIGN.md)
- [UI 现状盘点](docs/UI_INVENTORY.md)
- [UI 设计：应用壳层](docs/UI_DESIGN_SHELL.md)
- [标题栏与功能菜单设计](docs/TITLE_BAR_DESIGN.md)
- [UI 设计：对话页](docs/UI_DESIGN_CHAT.md)
- [UI 设计：文件与编辑器](docs/UI_DESIGN_EDITOR.md)
- [UI 设计：设置页](docs/UI_DESIGN_SETTINGS.md)
- [UI 设计：视觉与组件系统](docs/UI_DESIGN_SYSTEM.md)
- [UI 设计：状态、流程与验收](docs/UI_DESIGN_STATES.md)
- [GitHub 同类项目调研与功能取舍](docs/GITHUB_REFERENCE.md)
- [Agent 与 Skill 建设计划](docs/AGENT_SKILL_PLAN.md)
