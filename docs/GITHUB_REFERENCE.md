# GitHub 同类项目调研与功能取舍

- 调研日期：2026-08-27
- 目的：为 Vinkey 的本地 AI 创作工作台补全真实可用闭环
- 原则：只参考公开架构与交互模式，不复制 GPL/AGPL 项目源码

## 参考项目

| 项目 | 定位与许可证 | 对 Vinkey 的启发 |
| --- | --- | --- |
| [NoteGen](https://github.com/codexu/note-gen) | Tauri、本地优先 Markdown + AI，GPL-3.0 | 对话上下文需要独立预算；知识内容、会话和模型配置应分层 |
| [SoloMD](https://github.com/zhitongblog/solomd) | Tauri、本地 Markdown + BYOK，MIT | 本地 Ollama 与 OpenAI 兼容接口应并列；API Key 进入系统凭据库；地址需规范化并支持模型探测 |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | 多模型 AI 工作台，AGPL-3.0 | “提供商配置”与“当前模型选择”应分离，连接测试必须是设置页中的一等状态 |
| [Knote](https://github.com/1661169091kiwi/Knote) | 本地优先、可审改 AI 编辑器，MIT | AI 改稿不能直接覆盖正文，应先形成可接受/拒绝的修改提案 |
| [MarkText](https://github.com/marktext/marktext) | 跨平台 Markdown 编辑器，MIT | 原子保存、外部文件变化、全文搜索、主题和标签状态属于编辑器底座能力 |

调研时的规模与活跃度仅用于判断实现是否经过真实用户验证，不作为选型依据。Vinkey 保持自身的 Tauri 2 + React + Rust 边界，不引入上述项目的框架层。

## 本轮落地

1. Ollama 与 OpenAI 兼容模型配置、模型发现、连接测试和流式对话。
2. API Key 仅由 Rust 写入 macOS Keychain / Windows Credential Manager，不进入 SQLite、前端持久化或日志。
3. SQLite 会话和消息持久化，支持新建、列表和恢复历史会话。
4. 显式上下文文档注入及发送前预算估算，超限时阻止请求。
5. 授权工作区内的 Markdown/TXT 全文搜索。
6. 深色/浅色主题设置并在本机保存。

## 后续阶段

- AI 修改提案数据模型、逐块 diff 审核与接受/拒绝。
- 文件系统监听、外部修改冲突对比和重新加载/另存为。
- 多工作区授权记录与撤销、会话导出和数据清理。
- 长会话摘要、精确 tokenizer 和模型上下文容量注册表。
