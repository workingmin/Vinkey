# 竞品术语规范

- 版本：`2026-09-22`
- 适用范围：`docs/competitors/` 全部文档；新增竞品报告必须遵守。
- 目标：区分模型、产品、命令行客户端、SDK、GUI、路由器和 API 代理，避免把不同层级的对象混成同一个竞品。

## 1. 规范名称表

| 规范写法 | 指代 | 不要写成 | 说明 |
| --- | --- | --- | --- |
| `Claude` | Anthropic 的模型或模型家族 | `Claude Code`、`Claude CLI` | 只有讨论模型能力或模型系列时使用 |
| `Claude Code` | Anthropic 的编码 Agent 产品及其产品体系 | `Claude`、`Claude CLI` | 首次出现可写“Anthropic Claude Code” |
| `Claude Code 的命令行客户端` | Claude Code 的终端交互表面 | `Claude CLI`、`Claude Code CLI` | 不把交互表面另造为独立产品名 |
| `Claude Agent SDK` | 面向开发者的 Claude Code Agent 集成 SDK | `Claude SDK`、`Claude CLI SDK` | 与产品客户端分开比较 |
| `OpenAI Codex` | OpenAI Codex 产品体系 | `Codex`（首次出现时） | 后文可在不歧义时简称 `Codex` |
| `Codex CLI` | OpenAI Codex 的命令行客户端 | `OpenAI CLI`、`Codex 命令行 Agent` | 首次出现写 `OpenAI Codex CLI（简称 Codex CLI）` |
| `Codex SDK` | OpenAI Codex 的程序化控制 SDK | `Codex API` | 不与 OpenAI Responses API 混同 |
| `CloudCLI` | `siteboon/claudecodeui` 的正式产品名称/当前品牌 | `ClaudeCodeUI`（作为产品名） | 首次出现写 `CloudCLI（仓库名 claudecodeui，原 Claude Code UI）` |
| `豆包` | 字节跳动的中文通用 AI 助手产品 | 独立的“长文助手”产品名 | 功能场景可写“豆包的长文/附件能力” |
| `千问` | 阿里巴巴中文通用 AI 助手产品 | `通义`（历史品牌） | 首次出现可写“千问（历史品牌：通义）” |
| `Kimi` | 月之暗面中文长文本与研究助手产品 | `Kimi 助手`（除非描述 App） | 产品名统一写 `Kimi` |
| `元宝` | 腾讯中文通用 AI 助手产品 | `腾讯元宝`（正文简称） | 首次出现可写“元宝（腾讯全能 AI 助手）” |
| `文心` | 百度中文通用 AI 助手产品 | `文小言`（历史品牌） | 首次出现可写“文心（历史品牌：文小言）” |
| `讯飞星火` | 科大讯飞中文通用 AI 助手产品 | `星火`（正式名录中不单独使用） | 统一写完整产品名 |
| `DeepSeek` | DeepSeek 通用 AI 助手与模型产品体系 | `深度求索助手` | 模型名和 App/产品名需按上下文区分 |
| `WPS Office AI` | 金山办公文档办公工作台中的 AI 能力 | `WPS AI`（能力简称，不作为正式产品名） | 与通用中文助手单独分类 |
| `Opcode` | `winfunc/opcode` 的 Claude Code GUI/Toolkit | `ClaudeCodeUI`、`Claude CLI GUI` | 单 CLI 工作台，不是多 CLI 聚合器 |
| `Claude Code Router` | `musistudio/claude-code-router` 的本地路由控制平面 | `Claude Router` | 不是 Claude Code 本身 |
| `CLIProxyAPI` | `router-for-me/CLIProxyAPI` 的多模型 API 兼容代理 | `Agent CLI` | 主要是代理/兼容层，不是用户创作工作台 |
| `OpenCode` | `anomalyco/opencode` 的开源终端编码 Agent | `Open Code`、`OpenCode CLI` | 产品名写作一个词 |
| `OpenHands` | 开源 Agent 平台 | `OpenHands CLI`（除非指具体命令） | 产品平台与 CLI 表面分开 |
| `Agent CLI` | 泛称：以终端为主要交互入口的 Agent 产品类别 | `Claude CLI` | 不能作为具体产品名称 |
| `多 Agent CLI 集成工作台` | 同时接入多个 Agent CLI 并统一管理项目/会话/任务的产品类别 | `Agent CLI 代理` | CloudCLI 属于此类 |
| `模型路由控制平面` | 在多个模型/Provider 之间路由请求的控制层 | `多 Agent CLI` | Claude Code Router 属于此类 |
| `API 兼容代理` | 将不同服务包装成兼容 API 的代理层 | `Agent Runtime` | CLIProxyAPI 属于此类 |

## 2. 书写规则

1. 第一次提到产品时使用正式名称、组织或仓库和类别；后续只用规范简称。
2. `Claude` 只能表示模型家族；谈产品流程时必须写 `Claude Code`。
3. 不使用 `Claude CLI`。需要强调终端形态时写“Claude Code 的命令行客户端”。
4. 不把 `CloudCLI`、`Opcode`、`Claude Code Router` 和 `CLIProxyAPI` 合并为“Claude Code 竞品”；它们分别属于多 CLI 工作台、单 CLI GUI/Toolkit、模型路由控制平面和 API 兼容代理。
5. `Codex CLI` 与 `Claude Code 的命令行客户端`可以比较交互层，但不能把二者的 SDK、云端产品或模型 API 混写。
6. “商业产品”“开源项目”“Agent Runtime”“Agent CLI”“SDK”“API 兼容代理”是不同分类字段，不在同一层级互换使用。
7. 竞品表、功能台账、报告标题和 YAML `product` 字段统一使用本文件中的规范名称。

## 3. 示例

推荐：

> CloudCLI 是一个多 Agent CLI 集成工作台，可统一管理 Claude Code、OpenCode、Cursor CLI 和 Codex 的项目与会话。它不等同于 Claude Code，也不是模型路由器。

不推荐：

> Claude CLI 可以接入 Codex 和 OpenCode，ClaudeCodeUI 是 Claude 的 GUI。

推荐：

> 本报告比较 OpenAI Codex、Claude Code 和 OpenCode 的 Agent 任务控制；需要讨论终端入口时，分别使用 Codex CLI、Claude Code 的命令行客户端和 OpenCode 的终端交互。
