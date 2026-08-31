# Vinkey
面向文学创作的本地大模型工作台。在本地管理文稿目录，对接 AI 大模型，所有文档数据留存本机，保护创作隐私。

当前项目已完成 Tauri 2 + React + TypeScript + Rust 的 MVP 脚手架。界面采用左侧授权工作区、中央 AI 对话区和右侧编辑/预览区；桌面端文件读写只经过 Rust 的工作区路径守卫。

## 当前能力

- 浏览、新建、编辑和保存授权目录内的 Markdown / TXT 文档
- 连接本机或局域网 Ollama，以及 OpenAI 协议兼容服务
- 测试连接、发现模型并以流式响应进行 AI 对话
- 显式选取本地文档作为上下文，并在发送前估算上下文预算
- 使用 SQLite 在本机保存会话与消息，支持历史会话恢复
- 在授权工作区内进行文档全文搜索
- 深色和浅色主题；API Key 仅保存到 macOS Keychain / Windows Credential Manager

## 本地开发

前置环境：Node.js 22+、Rust stable，以及 [Tauri 2 对应平台依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run desktop:dev
```

只调试浏览器界面时运行 `npm run dev`。浏览器模式自动载入内存演示工作区，不会访问本机目录。

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

产物为 `.app` 和 `.dmg`。公开分发前需要配置 Apple Developer ID 证书、公证凭据；Windows 公开分发建议配置代码签名证书。脚本不会内置或读取仓库中的签名密钥。

## 开发文档

- [开发框架与技术选型](docs/DEVELOPMENT_FRAMEWORK.md)
- [UI 设计方案](docs/UI_DESIGN.md)
- [GitHub 同类项目调研与功能取舍](docs/GITHUB_REFERENCE.md)
