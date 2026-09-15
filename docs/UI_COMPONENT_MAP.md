# Vinkey UI 组件与业务功能映射

- 状态：当前实现组件基线，目标态组件明确标注
- 日期：2026-09-15
- 适用端：Windows、macOS 桌面应用；浏览器模式仅提供有限演示能力
- 功能点与入口编号来源：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)
- 现状盘点：[UI_INVENTORY.md](./UI_INVENTORY.md)

## 文档职责

本文件登记所有具有业务语义的交互组件，以及用户依赖其判断操作结果的展示组件。它用于回答：

1. 某个业务功能点由哪些 UI 组件承载。
2. 某个 UI 组件为什么存在、触发什么操作或展示什么结果。
3. 修改组件时需要回归哪些入口、状态和业务流程。

这里的“组件”是稳定的产品语义单元，不等同于每个 React 函数或 DOM 节点。动态列表中的会话行、文件行、任务行按组件模式登记一次。

## 登记范围

必须登记：

- 会触发导航、数据读取、写入、删除、模型调用、任务控制或状态切换的按钮、菜单、标签页、输入和选择控件。
- 确认对话框、上下文菜单、快捷入口和键盘命令等替代操作路径。
- 加载、空态、错误、进度、连接状态、保存状态、任务状态、分析产物和审核提案等结果组件。
- 一个控件在不同状态下承担不同动作时，登记其完整状态语义，例如“发送/停止”。

不单独登记：

- 纯布局容器、分隔线、装饰图标、头像和没有独立业务语义的说明文字。
- 同一组件模式产生的每个运行实例，例如每条会话、每个文件或每个模型选项。
- 只用于实现细节、用户不可见且不承载业务状态的内部组件。

## 字段与类型

| 字段 | 说明 |
| --- | --- |
| 组件 ID | `UI-<DOMAIN>-<SEMANTIC>`，一经引用不得复用 |
| 类型 | `入口`、`操作`、`输入`、`确认`、`状态`、`结果` |
| 组件 | 用户看到的控件或结果表面 |
| 功能点 / 入口 | 来自入口总表的 `BF-*`、`EP-*`；纯结果组件关联产生结果的入口 |
| 行为或结果 | 用户操作、状态变化、数据影响或展示内容 |
| 实现位置 | 当前源码组件或文件，不以行号作为稳定身份 |
| 状态 | `已实现`、`部分实现`、`待实现` |

## 应用壳层

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SHELL-APP-MENUS` | 入口 | Windows 应用菜单 / macOS 原生菜单 | `BF-WORKSPACE-001`、`BF-WORKSPACE-003`、`BF-CONVERSATION-001`、`BF-DOCUMENT-001`、`BF-DOCUMENT-005`、`BF-DOCUMENT-006`、`BF-NAV-001` 至 `BF-NAV-003`、`BF-SETTINGS-001`、`BF-SHELL-002` 至 `BF-SHELL-004`、`BF-DIAGNOSTICS-001` / `EP-WORKSPACE-001`、`EP-WORKSPACE-003`、`EP-CONVERSATION-001`、`EP-DOCUMENT-001`、`EP-DOCUMENT-005`、`EP-DOCUMENT-006`、`EP-NAV-001` 至 `EP-NAV-003`、`EP-SETTINGS-001`、`EP-SHELL-002` 至 `EP-SHELL-004`、`EP-DIAGNOSTICS-001` | 汇集文件、编辑、查看、窗口和帮助命令；平台承载不同但语义一致 | `src/App.tsx` `TitleBar`、`installMacMenu` | 已实现 |
| `UI-SHELL-MENU-TRIGGER` | 操作 | 文件、编辑、查看、窗口、帮助菜单按钮 | `BF-WORKSPACE-001`、`BF-WORKSPACE-003`、`BF-CONVERSATION-001`、`BF-DOCUMENT-001`、`BF-DOCUMENT-005`、`BF-DOCUMENT-006`、`BF-NAV-001` 至 `BF-NAV-003`、`BF-SETTINGS-001`、`BF-SHELL-002` 至 `BF-SHELL-004`、`BF-DIAGNOSTICS-001` / `EP-WORKSPACE-001`、`EP-WORKSPACE-003`、`EP-CONVERSATION-001`、`EP-DOCUMENT-001`、`EP-DOCUMENT-005`、`EP-DOCUMENT-006`、`EP-NAV-001` 至 `EP-NAV-003`、`EP-SETTINGS-001`、`EP-SHELL-002` 至 `EP-SHELL-004`、`EP-DIAGNOSTICS-001` | 展开一个菜单，点击外部或 Escape 后关闭；菜单项覆盖对应应用级命令 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-WINDOW-CONTROLS` | 操作 | 最小化、最大化/还原、关闭按钮 | `BF-SHELL-003` / `EP-SHELL-003` | 调用桌面窗口能力并同步最大化状态 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-CONTENT-SWITCHER` | 入口 | 对话、文件、任务分段控件 | `BF-NAV-001`、`BF-NAV-002`、`BF-NAV-003` / `EP-NAV-001`、`EP-NAV-002`、`EP-NAV-003` | 在三个内容页之间互斥切换，不改变当前会话和工作区 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-CONTENT-SUMMARY` | 状态 | 页面标题、工作区和模型摘要 | `BF-NAV-001`、`BF-NAV-002`、`BF-NAV-003` / `EP-NAV-001`、`EP-NAV-002`、`EP-NAV-003` | 展示当前页面、工作区和活动模型 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-GLOBAL-ERROR` | 结果/操作 | 全局错误条和关闭按钮 | `BF-FEEDBACK-001` / `EP-FEEDBACK-001` | 展示跨域错误；用户可关闭，不覆盖页面内容或改变业务状态 | `src/App.tsx` `App` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-DIALOG` | 结果 | 运行日志面板 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 展示日志路径、平台、版本和最近运行事件 | `src/App.tsx` `App` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-ACTIONS` | 操作 | 关闭、刷新、复制日志 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 控制日志面板并复制只读诊断内容 | `src/App.tsx` `App` | 已实现 |

## 项目、会话与搜索

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SIDEBAR-THEME` | 操作 | 侧栏主题切换按钮 | `BF-SHELL-002` / `EP-SHELL-002` | 在深色和浅色主题间切换 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-COLLAPSE` | 操作 | 折叠/展开会话栏按钮 | `BF-SHELL-001` / `EP-SHELL-001` | 切换侧栏宽度并同步 `aria-expanded` | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-ADD-PROJECT` | 入口 | 添加项目按钮及项目空态按钮 | `BF-WORKSPACE-001` / `EP-WORKSPACE-001` | 打开目录选择或浏览器演示工作区 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-REFRESH` | 操作 | 刷新项目列表按钮 | `BF-WORKSPACE-003` / `EP-WORKSPACE-003` | 重新读取项目和当前工作区状态 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-SEARCH` | 输入 | 项目、会话、文档统一搜索框及清除按钮 | `BF-WORKSPACE-004` / `EP-WORKSPACE-004` | 筛选项目/会话并触发当前项目正文搜索 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-SEARCH-RESULTS` | 结果 | 项目、会话和文档搜索结果/无结果状态 | `BF-WORKSPACE-004` / `EP-WORKSPACE-004` | 展示匹配范围、文档行号、摘要和搜索进度 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-PROJECT-EXPAND` | 操作 | 项目展开/收起按钮 | `BF-WORKSPACE-002` / `EP-WORKSPACE-002` | 只改变项目会话列表可见性，不切换工作区 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-PROJECT-SELECT` | 入口 | 项目名称和路径按钮 | `BF-WORKSPACE-002` / `EP-WORKSPACE-002` | 检查运行任务和未保存状态后切换项目 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-PROJECT-DELETE` | 入口 | 删除项目记录按钮 | `BF-WORKSPACE-005` / `EP-WORKSPACE-005` | 打开项目删除确认，不直接删除目录文件 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-CONVERSATION-NEW` | 入口 | 项目行和会话列表的新建会话按钮 | `BF-CONVERSATION-001` / `EP-CONVERSATION-001` | 必要时先切换项目，再打开空白对话 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-CONVERSATION-SELECT` | 入口 | 新会话项和历史会话项 | `BF-CONVERSATION-002` / `EP-CONVERSATION-002` | 恢复消息、标题和会话选择 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-CONVERSATION-DELETE` | 入口 | 删除会话记录按钮 | `BF-CONVERSATION-003` / `EP-CONVERSATION-003` | 打开会话删除确认；运行中的会话禁用 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-CONVERSATION-LOAD-STATE` | 状态 | 会话加载、空态和加载失败重试 | `BF-CONVERSATION-002` / `EP-CONVERSATION-002` | 展示每个项目的会话加载结果，失败可原位重试 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-RECORD-DELETE-DIALOG` | 确认 | 项目/会话记录删除对话框 | `BF-WORKSPACE-005`、`BF-CONVERSATION-003` / `EP-WORKSPACE-005`、`EP-CONVERSATION-003` | 项目采用两步确认和名称校验；会话采用单步确认 | `src/components/RecordDeletionDialog.tsx` | 已实现 |
| `UI-RECORD-DELETE-RESULT` | 结果 | 删除提交中和内联错误状态 | `BF-WORKSPACE-005`、`BF-CONVERSATION-003` / `EP-WORKSPACE-005`、`EP-CONVERSATION-003` | 禁止重复提交；失败保留对话框、输入和重试能力 | `src/components/RecordDeletionDialog.tsx` | 已实现 |
| `UI-SIDEBAR-SETTINGS` | 入口 | 模型与应用设置按钮 | `BF-SETTINGS-001` / `EP-SETTINGS-001` | 打开设置页并临时折叠侧栏 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |

## 对话、上下文与分析

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-CHAT-MESSAGE-STREAM` | 结果 | 用户和助手消息流 | `BF-CHAT-001` / `EP-CHAT-001` | 展示历史消息、流式正文和完成时间 | `src/App.tsx` `ChatPanel`、`ChatMessageItem` | 已实现 |
| `UI-CHAT-MESSAGE-COPY` | 操作 | 消息复制按钮和已复制状态 | `BF-CHAT-003` / `EP-CHAT-003` | 复制单条消息；成功状态原位短暂显示 | `src/App.tsx` `ChatMessageItem` | 已实现 |
| `UI-CHAT-COMPOSER` | 输入 | 多行对话输入框 | `BF-CHAT-001` / `EP-CHAT-001` | 接收指令；Enter 发送、Shift+Enter 换行、IME 组字不发送 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-CHAT-SEND-STOP` | 操作 | 发送/停止状态按钮 | `BF-CHAT-001`、`BF-CHAT-002` / `EP-CHAT-001`、`EP-CHAT-002` | 空闲时发送，运行时停止；停止中禁用重复操作 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-CHAT-MODEL-INDICATOR` | 状态/入口 | 当前模型或“添加模型” | `BF-MODEL-001` / `EP-MODEL-001` | 显示活动模型；未配置时进入设置页 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-CHAT-CONTEXT-BUDGET` | 状态 | 上下文占用、分析状态和运行状态文案 | `BF-CHAT-001`、`BF-CONTEXT-001` / `EP-CHAT-001`、`EP-CONTEXT-001` | 显示 token 预算、超限、暂停和生成阶段 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-CONTEXT-CHIPS` | 操作/状态 | 已引用文档标签和移除动作 | `BF-CONTEXT-001` / `EP-CONTEXT-001` | 展示当前上下文文件并支持逐项移除 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-CONTEXT-MENTION` | 输入/结果 | `@` 文件候选列表 | `BF-CONTEXT-001` / `EP-CONTEXT-001` | 按名称或路径筛选，支持键盘选择并标记已引用项 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-ANALYSIS-DOCUMENT-ACTIONS` | 入口 | 分析文本、拆分章节、提取人物线 | `BF-ANALYSIS-001`、`BF-STRUCTURE-001`、`BF-CHARACTER-001` / `EP-ANALYSIS-001`、`EP-STRUCTURE-001`、`EP-CHARACTER-001` | 预填结构化问题，不自动发送 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-ANALYSIS-WORKSPACE-ACTION` | 入口 | 分析整个项目 | `BF-ANALYSIS-002` / `EP-ANALYSIS-002` | 预填项目分析请求，发送后由策略选择分析范围 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-ANALYSIS-NEW-FILES-NOTICE` | 状态/入口 | 新增文本文件提示及逐个/全部分析 | `BF-ANALYSIS-001` / `EP-ANALYSIS-001` | 展示新增文件，允许选择分析或忽略 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-TASK-RECOVERY-NOTICE` | 状态/入口 | 未完成任务提示、恢复和忽略 | `BF-TASK-006` / `EP-TASK-006` | 恢复任务来源文件和指令，等待用户确认发送 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-TASK-PAUSE` | 操作 | 暂停/继续长文本任务按钮 | `BF-TASK-005` / `EP-TASK-005` | 向 Worker 和前端分析控制器同步暂停或恢复请求 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-ACTIVITY-TOGGLE` | 操作/状态 | 处理记录展开按钮和当前步骤摘要 | `BF-ACTIVITY-001` / `EP-ACTIVITY-001` | 展开/收起消息内活动轨迹；折叠时显示当前步骤 | `src/components/MessageActivity.tsx` | 已实现 |
| `UI-ACTIVITY-STEPS` | 结果 | 工序列表、进度、耗时、缓存和模型调用 | `BF-ACTIVITY-001` / `EP-ACTIVITY-001` | 展示可公开的执行事件，不展示隐藏思维链 | `src/components/MessageActivity.tsx` | 已实现 |
| `UI-ACTIVITY-ARTIFACT-ENTRY` | 入口 | 产物名称和“查看产物清单” | `BF-ACTIVITY-001` / `EP-ACTIVITY-001` | 打开指定 Job 的只读产物预览 | `src/components/MessageActivity.tsx` | 已实现 |
| `UI-ACTIVITY-ARTIFACT-DIALOG` | 结果 | 分析产物预览、加载、错误和复制 | `BF-ACTIVITY-001` / `EP-ACTIVITY-001` | 安全渲染 Markdown/JSON，允许复制，不写回源文档 | `src/components/MessageActivity.tsx` | 已实现 |
| `UI-MEMORY-CANDIDATE-NOTICE` | 确认/结果 | 项目记忆候选、确认写入和忽略 | `BF-MEMORY-001` / `EP-MEMORY-001` | 只有用户确认后写入当前项目记忆 | `src/App.tsx` `ChatPanel` | 已实现 |
| `UI-REVISION-PENDING-NOTICE` | 确认/状态 | 待审核修改提案提示 | `BF-REVISION-001` / `EP-REVISION-001` | 展示待审核数量并提供接受、拒绝和查看文档 | `src/App.tsx` `ChatPanel` | 部分实现 |

## 文件、编辑器与预览

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-FILE-HEADER-ACTIONS` | 入口/操作 | 新建文档、新建文件夹、刷新按钮 | `BF-DOCUMENT-001`、`BF-DOCUMENT-002`、`BF-WORKSPACE-003` / `EP-DOCUMENT-001`、`EP-DOCUMENT-002`、`EP-WORKSPACE-003` | 执行文件页主要命令；无工作区时转到打开工作区 | `src/App.tsx` `FileBrowserPanel` | 已实现 |
| `UI-FILE-WORKSPACE-EMPTY` | 入口/状态 | 未打开工作区空态和“打开文件夹” | `BF-WORKSPACE-001` / `EP-WORKSPACE-001` | 引导选择本机目录或加载演示工作区 | `src/App.tsx` `FileBrowserPanel` | 已实现 |
| `UI-FILE-FILTER` | 输入/结果 | 文件名筛选和清除按钮 | `BF-DOCUMENT-003` / `EP-DOCUMENT-003` | 原位过滤文件树并展示无匹配状态 | `src/App.tsx` `FileBrowserPanel`、`src/components/WorkspaceTree.tsx` | 已实现 |
| `UI-FILE-DIRECTORY-ROW` | 操作 | 目录展开/收起行 | `BF-DOCUMENT-003` / `EP-DOCUMENT-003` | 只改变目录子项可见性 | `src/components/WorkspaceTree.tsx` | 已实现 |
| `UI-FILE-DOCUMENT-ROW` | 入口 | 文件行及右键上下文动作 | `BF-DOCUMENT-003`、`BF-CONTEXT-001` / `EP-DOCUMENT-003`、`EP-CONTEXT-001` | 左键按类型打开，右键添加/移除对话上下文 | `src/components/WorkspaceTree.tsx` | 已实现 |
| `UI-EDITOR-CLOSE` | 操作 | 文档标签关闭和收起编辑器按钮 | `BF-DOCUMENT-006` / `EP-DOCUMENT-006` | 关闭当前标签或返回完整文件列表 | `src/App.tsx` `EditorPanel` | 已实现 |
| `UI-EDITOR-SAVE` | 操作/状态 | 保存按钮、未保存标记和保存状态 | `BF-DOCUMENT-005` / `EP-DOCUMENT-005` | 保存当前文档并原位更新状态 | `src/App.tsx` `EditorPanel` | 已实现 |
| `UI-EDITOR-CODE` | 输入 | CodeMirror 文本编辑区 | `BF-DOCUMENT-004` / `EP-DOCUMENT-004` | 编辑正文并报告选区和未保存状态 | `src/components/CodeEditor.tsx` | 已实现 |
| `UI-EDITOR-VIEW-MODE` | 操作 | 编辑、分栏、预览分段控件 | `BF-DOCUMENT-007` / `EP-DOCUMENT-007` | 切换 Markdown 编辑和预览布局 | `src/App.tsx` `EditorPanel` | 已实现 |
| `UI-EDITOR-AI-REVISION` | 入口 | 用 AI 修改选区按钮 | `BF-REVISION-001` / `EP-REVISION-001` | 将选区带回对话页形成有界改稿请求 | `src/App.tsx` `EditorPanel` | 已实现 |
| `UI-EDITOR-DIFF-PROPOSAL` | 确认/结果 | 修改提案正文、接受和拒绝按钮 | `BF-REVISION-001` / `EP-REVISION-001` | 校验提案后应用或拒绝；应用后仍需保存 | `src/App.tsx` `EditorPanel` | 部分实现 |
| `UI-EDITOR-DOWNLOAD` | 操作 | 下载文件按钮 | `BF-DOCUMENT-008` / `EP-DOCUMENT-008` | 下载当前文档字节，不修改源文件 | `src/App.tsx` `EditorPanel`、`src/components/FilePreview.tsx` | 已实现 |
| `UI-EDITOR-HTML-PREVIEW` | 入口 | 在新窗口预览 HTML | `BF-DOCUMENT-008` / `EP-DOCUMENT-008` | 在独立浏览上下文显示当前 HTML | `src/App.tsx` `EditorPanel` | 已实现 |
| `UI-FILE-PREVIEW` | 结果 | 图片、PDF、音视频、二进制预览状态 | `BF-DOCUMENT-008` / `EP-DOCUMENT-008` | 按文件类型显示媒体、加载、失败或不可编辑状态 | `src/components/FilePreview.tsx` | 已实现 |
| `UI-EDITOR-STATUS` | 状态 | 行列、字符、词数、编码、换行和保存状态 | `BF-DOCUMENT-004`、`BF-DOCUMENT-005`、`BF-DOCUMENT-008` / `EP-DOCUMENT-004`、`EP-DOCUMENT-005`、`EP-DOCUMENT-008` | 展示当前文档的编辑或只读状态 | `src/App.tsx` `EditorPanel` | 已实现 |

## 任务中心

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-TASK-COUNTS` | 状态 | 运行、完成、失败计数 | `BF-TASK-001` / `EP-TASK-001` | 汇总当前工作区任务状态 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-REFRESH` | 操作 | 刷新按钮和加载图标 | `BF-TASK-001` / `EP-TASK-001` | 重新读取任务列表；请求期间禁用 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-LIST-STATE` | 状态 | 未打开项目、暂无任务和全局读取错误 | `BF-TASK-001` / `EP-TASK-001` | 表达任务列表边界状态 | `src/components/TaskCenter.tsx`、`src/App.tsx` | 部分实现（首次加载和局部错误待补） |
| `UI-TASK-ROW-TOGGLE` | 操作 | 任务行展开/收起按钮 | `BF-TASK-002` / `EP-TASK-002` | 保持单个任务详情展开并同步 `aria-expanded` | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-STATUS` | 状态 | 任务状态、更新时间和步骤状态 | `BF-TASK-001`、`BF-TASK-002` / `EP-TASK-001`、`EP-TASK-002` | 展示持久化 Job/Step 状态、执行次数和检查点 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-FAILURE` | 结果 | 错误代码、消息和可重试语义 | `BF-TASK-002`、`BF-TASK-003` / `EP-TASK-002`、`EP-TASK-003` | 区分可重试失败和需重新发起 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-RETRY` | 输入/确认 | 步骤选择器和重跑按钮 | `BF-TASK-003` / `EP-TASK-003` | 默认失败步骤，确认后从指定检查点重跑；防重复提交 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-OUTPUT` | 入口/结果 | 查看结果按钮和只读结果区 | `BF-TASK-004` / `EP-TASK-004` | 展示正文、产物目录、耗时和缓存/模型指标 | `src/components/TaskCenter.tsx` | 已实现 |
| `UI-TASK-CONTROLS` | 操作 | 暂停、恢复和取消按钮 | `BF-TASK-005` / `EP-TASK-005` | 在任务中心控制可恢复任务 | `src/components/TaskCenter.tsx` | 待实现 |
| `UI-TASK-SOURCE-LINK` | 入口 | 返回来源消息/文件 | `BF-TASK-007` / `EP-TASK-007` | 返回稳定来源并保留任务上下文 | `src/components/TaskCenter.tsx` | 待实现 |

## 模型设置与硬件

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SETTINGS-BACK` | 操作 | 返回工作区按钮和 Escape | `BF-SETTINGS-001` / `EP-SETTINGS-001` | 检查未保存连接修改后退出设置 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-SETTINGS-NOTICE` | 结果 | 设置成功/失败内联提示 | `BF-MODEL-001` 至 `BF-MODEL-005` / `EP-MODEL-001` 至 `EP-MODEL-005` | 展示保存、连接、检查和删除结果 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-MODEL-PICKER` | 输入 | 当前模型组合框和选项列表 | `BF-MODEL-001` / `EP-MODEL-001` | 键盘或鼠标选择应用级活动模型 | `src/components/SettingsPage.tsx` `ModelPicker` | 已实现 |
| `UI-MODEL-ACTIVE-STATUS` | 状态 | 当前模型、服务、检查和上下文配置状态 | `BF-MODEL-001`、`BF-MODEL-004` / `EP-MODEL-001`、`EP-MODEL-004` | 显示可用、需要检查、未选择和自动配置结果 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-ADD` | 入口 | 添加服务按钮 | `BF-MODEL-002` / `EP-MODEL-002` | 打开新的连接表单 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-LIST` | 输入/状态 | 模型服务列表、选择和连接状态点 | `BF-MODEL-002`、`BF-MODEL-004` / `EP-MODEL-002`、`EP-MODEL-004` | 选择编辑对象并显示服务地址和可用模型数 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-DELETE` | 确认/操作 | 删除服务按钮 | `BF-MODEL-003` / `EP-MODEL-003` | 确认后删除连接；初始加载、保存、对话生成、分析运行或目标连接探测期间禁用 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-FORM` | 输入 | 名称、类型、服务地址和 API Key 字段 | `BF-MODEL-002` / `EP-MODEL-002` | 编辑连接草稿；API Key 可为空且不以明文持久化 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-KEY-CLEAR` | 输入 | 删除已保存密钥复选框 | `BF-MODEL-003` / `EP-MODEL-003` | 显式请求删除系统凭据中的密钥 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-CONNECTION-SAVE-CHECK` | 操作 | 保存并检查模型 | `BF-MODEL-002`、`BF-MODEL-004` / `EP-MODEL-002`、`EP-MODEL-004` | 校验复合身份、保存连接、获取模型并执行准入检查 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-MODEL-CATALOG-TOGGLE` | 操作 | 查看/收起模型列表 | `BF-MODEL-004` / `EP-MODEL-004` | 展开或收起当前服务模型目录 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-MODEL-CATALOG-ACTIONS` | 操作 | 刷新模型列表、检查全部模型 | `BF-MODEL-004` / `EP-MODEL-004` | 获取服务模型并按顺序执行准入检查 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-MODEL-CATALOG-RESULT` | 状态/结果 | 读取中、连接失败、无模型及逐模型检查结果 | `BF-MODEL-004` / `EP-MODEL-004` | 显示模型目录和可用/不可用/待检查状态 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-HARDWARE-DETECT` | 操作 | 重新检测本机配置 | `BF-HARDWARE-001` / `EP-HARDWARE-001` | 读取本机平台、内存和显存信息 | `src/components/SettingsPage.tsx` | 已实现 |
| `UI-HARDWARE-RESULT` | 状态/入口 | 硬件档位、建议和添加远程服务 | `BF-HARDWARE-001`、`BF-MODEL-005` / `EP-HARDWARE-001`、`EP-MODEL-005` | 显示本机能力；不足或未知时进入远程服务表单 | `src/components/SettingsPage.tsx` | 已实现 |

## 覆盖检查

每次 UI 修改至少执行以下追踪检查：

1. 新交互或结果组件是否分配了唯一 `UI-*`，并关联有效的 `BF-*`；用户可发起的组件还必须关联 `EP-*`。
2. 业务功能点是否至少有一个入口组件；入口触发异步操作时是否至少有一个加载、成功、空态或错误结果组件。
3. 同一功能在标题栏、侧栏、页面和快捷键中的入口是否使用一致语义。
4. 写入、删除、模型调用、任务控制等高影响操作是否登记确认、禁用、错误和恢复状态。
5. 当前实现、部分实现和待实现标记是否与源码及对应 `UI_DESIGN_*.md` 一致。
6. 删除组件时是否保留原 ID 并标记“已移除”，避免历史验收记录失去引用。

## 维护规则

- 新功能按顺序登记：在 `UI_ENTRY_POINTS.md` 分配 `BF-*`/`EP-*`，在本文件分配 `UI-*`，最后更新域设计和 `UI_INVENTORY.md`。
- 组件重命名、移动实现文件或调整文案不改变 `UI-*`；业务语义改变时新建 ID，并将旧 ID 标记为已移除。
- 一个复合控件只有在子控件共享同一业务语义、前置条件和结果时才能合并登记；独立副作用必须拆分。
- 结果组件必须关联产生结果的功能点和入口，不能只登记视觉名称。
- 本文件不复制 CSS token、完整状态机或后端数据结构；这些内容仍由系统、状态和域设计文档负责。
