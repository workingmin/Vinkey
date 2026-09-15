# UI 设计：对话页

- 状态：当前实现基线，完整 Diff 审核为目标态
- 日期：2026-09-15
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)

## 目标

对话页是创作构思、续写、改稿和设定梳理的首要入口。消息流可扫描，生成过程可中止，发送前可以确认所有附加上下文。

临时交互状态的完整目录、首版状态机和 Agent Runtime 目标态见[临时交互状态设计](TEMPORARY_INTERACTION_STATES.md)。

## 布局

```text
内容区顶栏：会话摘要                    对话 | 文件 | 任务
消息流：助手左对齐、用户右对齐
底部输入区：引用文件
             多行输入
             当前模型 | 上下文占用 | 发送/停止
```

- 消息流是主要滚动容器，输入区固定在底部并随内容在 96–220px 内增长。
- 助手消息使用无边框文本块；用户消息使用弱底色气泡，不把每条消息做成卡片。
- 每条消息显示复制操作和时间；助手生成中状态留在原条目内。

## 输入与上下文

- Enter 发送，Shift+Enter 换行；中文 IME 组字期间不触发发送。
- 已引用文档显示在输入框上方，标签包含文件图标、截断文件名和移除按钮。
- 输入 `@` 可搜索工作区文件；支持按名称或相对路径筛选，并通过方向键、Enter/Tab 选择文件加入上下文。
- 输入区底部左侧显示应用当前模型，右侧显示上下文使用百分比和发送按钮。会话内不切换模型，模型调整统一在设置页完成。
- 没有模型时显示“添加模型”入口；上下文超限时禁用发送并提示移除文档或缩短输入。

## 页面预览（Markdown 预览）

该 HTML 区块会直接显示对话页的空间层级和输入区入口。背景采用浅色中性灰阶，仅用于区分区域，不代表产品实际配色或状态语义：

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td bgcolor="#F1F3F5"><strong>会话摘要</strong>　会话标题　工作区 · 模型　　　　　　　<strong>对话</strong>　|　文件　|　任务</td></tr>
  <tr>
    <td height="180" valign="top" bgcolor="#FFFFFF">
      <strong>消息流</strong><br><br>
      <table border="1" cellpadding="6" cellspacing="0" width="100%">
        <tr><td width="22%" bgcolor="#F8F9FA">助手<br>复制　时间</td><td>回答内容与流式生成状态</td></tr>
        <tr><td align="right" colspan="2" bgcolor="#F4F5F6">用户消息　复制　时间</td></tr>
      </table>
    </td>
  </tr>
  <tr><td bgcolor="#F1F3F5"><strong>输入区</strong>　已引用文件　分析文本　拆分章节　提取人物线<br>多行输入<br><strong>当前模型</strong>　上下文占用　　<strong>发送 / 停止</strong></td></tr>
</table>

### 文件分析入口

- 已附加文档时，输入框上方显示“分析文本”“拆分章节”“提取人物线”快捷入口；点击只预填问题，不自动发送。“拆分章节”发送后在源文档同级创建 `<源文件名>-章节拆分/` 和编号文档，先走本地结构解析，不要求配置模型；完成后询问是否需要“重新梳理章节结构”，用户确认后才进入 AI 增强。“分析文本”和“提取人物线”在需要语义归纳时进入模型分析。
- 刷新工作区或首次打开项目发现新增 Markdown/TXT 时，对话区顶部显示新增文件提示条。
- 提示条支持逐个分析、全部分析和忽略；分析入口会将文件加入上下文并预填带文件名的问题。
- 用户主动新建文档后的静默刷新不生成新增文件提示，避免把自己的创建操作重复通知。
- 首次打开已有项目只提示少量候选文件，后续以工作区路径差异判断新增文件。

## 生成与消息操作

- 发送后先保存用户消息，再以流式 chunk 更新同一条助手消息。
- 生成期间发送按钮固定为停止图标；停止请求不会新增重复消息。
- 消息支持复制，复制成功原位显示短暂状态；失败使用统一错误反馈。
- 会话标题首次由用户输入生成，历史会话显示消息数和更新时间。

## 组件与业务功能映射

本表是对话页面验收清单；跨到任务中心或编辑器的组件仍登记在用户当前看到并操作它的页面。

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

## AI 修改审核（目标态）

普通回答留在消息流，可复制或插入光标处。文档修改提案切换到文件页的 diff 审核视图，支持接受全部、逐块接受/拒绝、放弃提案和返回对话继续调整。删除和新增不能只依赖红绿色，应同时使用图标和边标。

## 待补齐状态

- 首次打开且未配置模型的引导。
- 结构化修改提案与 diff 审核面板。
- 流式错误、超时、断线的可重试原位提示。

## 验收

- 消息流、输入、发送/停止和复制组件的状态与当前会话一致，不产生重复消息。
- `@` 引用、上下文标签、预算状态和分析快捷入口在键盘操作及中文 IME 下可用。
- 任务恢复、暂停、活动轨迹和产物预览保持当前工作区边界，不展示隐藏思维链或未授权内容。
- 表中每个 `UI-*` 均关联有效的 `BF-*`、`EP-*`，实现状态与源码和目标态说明一致。
