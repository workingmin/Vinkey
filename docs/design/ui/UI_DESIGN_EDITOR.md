# UI 设计：文件与编辑器

- 状态：当前实现基线，完整 Diff 审核和外部冲突为目标态
- 日期：2026-09-15
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)

## 目标

文件页用于查找素材、人工修订和确认 AI 产出。文件列表和编辑器共享右侧内容区，编辑器是可收起的侧向工作面，不覆盖对话数据。

## 文件类型能力

文件树参考 ClaudeCodeUI 的“统一打开入口 + 能力路由”模式。文件类型由扩展名和 UTF-8 可读性决定，不再只显示 Markdown/TXT：

| 类型 | 示例 | 当前行为 |
| --- | --- | --- |
| Markdown | `.md`、`.markdown`、`.mdx` | CodeMirror 编辑、分栏/阅读预览 |
| 代码/配置 | `.js`、`.jsx`、`.ts`、`.tsx`、`.py`、`.html`、`.css`、`.json`、`.yaml`、`.toml`、`.sql`、`.rs` 等 | CodeMirror 编辑，按扩展名加载语法支持；未知语言仍可纯文本编辑 |
| 环境文件 | `.env`、`.env.*` | CodeMirror 编辑，键值/变量语法高亮 |
| 普通文本 | `.txt`、无扩展名或其他有效 UTF-8 文件 | CodeMirror 编辑 |
| 图片 | `.png`、`.jpg`、`.gif`、`.svg`、`.webp`、`.avif` 等 | 内嵌预览，不进入文本编辑器 |
| PDF | `.pdf` | 内嵌浏览器预览 |
| 音视频 | `.mp3`、`.wav`、`.mp4`、`.webm`、`.mov` 等 | 原生播放控件预览 |
| 二进制/Office/压缩包 | `.zip`、`.docx`、`.xlsx`、`.sqlite` 等 | 明确显示不可编辑，可下载 |

当前实现已覆盖表格中的路由；代码语言包首版重点覆盖 JavaScript/TypeScript、Python、HTML、CSS、JSON、Markdown，其他代码扩展以纯文本模式打开，不会阻止编辑。

## 文件列表

- 进入文件页默认显示占满右侧的工作区文件列表。
- 头部显示工作区名称和路径，提供新建文档、新建文件夹、刷新。
- 下方提供文件名筛选，包含可编辑、可预览和二进制文件。
- 目录用展开/收起按钮；文件图标和 tooltip 按类型区分。
- 当前文件使用中性选中底色和左侧强调线。
- 文件左键打开；右键添加/移除对话上下文。

## 编辑器布局

选中文档后，文件列表收窄至 260–340px，编辑器占用剩余空间。

```text
36px 文档标签栏：图标 / 文件名 / 未保存标记 / 关闭
40px 工具栏：相对路径 / 保存 / 编辑-分栏-预览 / 收起编辑器
可伸缩编辑区：CodeMirror 与可选 Markdown 预览
24px 状态栏：行列 / 字符 / 词数 / UTF-8 / LF 或 CRLF / 保存状态
```

- 编辑：单栏 CodeMirror，默认视图；显示行号、折叠、括号匹配、自动补全、查找和撤销/重做。
- 分栏：编辑器和 Markdown 预览各占一半。
- 预览：单栏阅读视图；TXT 禁用分栏和预览。
- 当前数据结构保留 `tabs`，但首版只呈现一个活动文档标签。

## 页面预览（Markdown 预览）

该 HTML 区块展示从文件列表进入文档后，各个编辑和预览入口的相对位置。背景采用浅色中性灰阶，仅用于区分区域，不代表产品实际配色或状态语义：

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td colspan="2" bgcolor="#F1F3F5"><strong>文件页顶栏</strong>　工作区名称 / 路径　　新建文档　新建文件夹　刷新</td></tr>
  <tr>
    <td width="28%" height="210" valign="top" bgcolor="#F8F9FA"><strong>文件列表</strong><br>筛选文件名<br>▾ 项目<br>　▸ 章节.md<br>　▸ 设定.txt<br>　▸ 素材.png<br><br>左键打开　右键添加上下文</td>
    <td valign="top" bgcolor="#FFFFFF">
      <strong>文档标签栏</strong>　文档.md　● 未保存　关闭<br>
      <strong>工具栏</strong>　相对路径　　保存　　<strong>编辑</strong>　|　<strong>分栏</strong>　|　<strong>预览</strong>　　收起编辑器
      <table border="1" cellpadding="8" cellspacing="0" width="100%">
        <tr><td width="50%" height="120" valign="top" bgcolor="#FFFFFF"><strong>CodeMirror 编辑器</strong><br>行号　折叠　查找　撤销 / 重做</td><td valign="top" bgcolor="#F4F5F6"><strong>Markdown 预览</strong><br>标题、段落、列表、引用</td></tr>
      </table>
      <small>状态栏：行列　字符 / 词数　UTF-8　LF / CRLF　保存状态</small>
    </td>
  </tr>
</table>

## 保存和冲突

- 内容变化后，文档标签和状态栏显示“未保存”，保存按钮可用。
- `Ctrl/Cmd+S`、标题栏菜单和工具栏按钮调用同一保存动作。
- 保存成功只更新原位状态，不弹成功 toast。
- 外部程序改变文件时，目标态显示持久冲突条，提供对比、重新加载、另存为；不得静默覆盖。
- 收起编辑器后文件列表保持可见，切回对话不会丢失草稿。

## AI 改稿审核（目标态）

文档修改提案在文件页打开 diff 审核，不直接覆盖正文。审核期间可以切回对话继续调整；接受或放弃前保留未保存状态和会话数据。

## 组件与业务功能映射

本表是文件列表、编辑器和预览表面的联合验收清单。

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

## 验收

- 从搜索结果或新建文稿进入时自动切换文件页并打开编辑器。
- 文件页未选文档时列表完整可用；收起编辑器后仍停留在列表。
- 代码、配置、媒体和二进制文件从同一文件树入口打开时，分别进入正确的编辑/预览/不可编辑状态。
- 长路径、长文件名和未保存标记不会挤压关闭/保存/视图按钮。
- 表中每个 `UI-*` 均关联有效的 `BF-*`、`EP-*`，实现状态与源码和目标态说明一致。
