# UI 设计：应用壳层

- 状态：当前实现基线
- 日期：2026-09-15
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)

## 目标

让工作区、会话和当前模型始终可见；让“对话/文件/任务”成为稳定的内容级导航；平台差异只影响窗口外壳，不改变工作流。

## 结构

```text
Windows：36px 自绘标题栏
         左侧项目与会话栏  +  右侧统一内容区

macOS：  原生 Overlay 标题区与交通灯
         左侧项目与会话栏  +  右侧统一内容区
```

- 推荐窗口：1440 × 900；最小窗口：1024 × 680。
- 侧栏默认 288px，宽度不足时 248px；可折叠为 52px 图标栏。
- 右侧内容区最小 480px，并始终是最大、最稳定的区域。
- macOS 侧栏顶部预留 42px 交通灯安全区；Windows 不增加该留白。
- macOS 原生红黄绿按钮组按侧栏实际宽度缩放尺寸和间距；52px 折叠态居中并保留左右 6px 留白，展开时恢复原生尺寸。折叠动画、设置页自动折叠和窗口缩放均同步布局。

## 页面预览（Markdown 预览）

以下 HTML 会在 Markdown 预览中呈现应用壳层的区域比例和全局入口。背景采用浅色中性灰阶，仅用于区分区域，不代表产品实际配色或状态语义：

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td colspan="2" bgcolor="#F1F3F5"><strong>Windows 自绘标题栏 / macOS Overlay 标题区</strong>　品牌　工作区　模型　　文件　编辑　查看　窗口　帮助　　最小化 / 最大化 / 关闭</td></tr>
  <tr>
    <td width="28%" height="230" valign="top" bgcolor="#F8F9FA"><strong>项目与会话栏</strong><br>刷新　切换工作区　折叠<br><strong>统一搜索</strong><br><br>项目名称 · 路径　<strong>新建会话</strong><br>会话历史<br><br><strong>设置</strong></td>
    <td valign="top" bgcolor="#FFFFFF"><strong>内容区顶栏</strong>　会话标题/任务中心　工作区 · 模型　　　　<strong>对话</strong>　|　<strong>文件</strong>　|　<strong>任务</strong><br><br><div align="center"><strong>稳定内容工作面</strong><br>对话：消息流 + 输入区<br>文件：文件列表 + 编辑器 / 预览<br>任务：后台任务状态 + 分析产物</div></td>
  </tr>
</table>

## 标题栏和应用菜单

Windows 自绘标题栏显示品牌、工作区、模型、文件/编辑/查看/窗口/帮助菜单及窗口控制。空白区域可拖动，双击切换最大化。macOS 通过系统全局菜单提供同一命令集合，窗口使用原生 Overlay 标题区和红黄绿交通灯。

菜单命令包括：新建会话、打开工作区、新建文档、刷新、保存、关闭文档、撤销/重做/剪切/复制/粘贴/全选、对话/文件/任务切换、主题、设置、快捷键、诊断和关于。

## 项目与会话栏

- 展开态头部：品牌与折叠按钮同排，下一排显示添加项目及刷新按钮，再下方为统一搜索框。
- 折叠态按纵向单列排列：顶部品牌图标、第二项展开按钮，随后为添加项目、刷新和设置入口；按钮宽度适配侧栏可用宽度。
- 项目列表与当前工作区分开管理；添加新目录保留已有项目，重复添加同一目录选中已有项目。名称、路径、当前选中状态、独立展开按钮、新建会话及删除项目记录按钮均位于项目行。
- 每个项目独立加载会话并展示数量，提供加载、失败重试及空状态；点击其他项目的会话时先切换工作区，再加载该会话。
- 会话项显示标题、消息数、更新时间；当前会话使用中性选中底色。
- 搜索匹配全部已登记项目的名称、路径和会话标题，并搜索当前项目的文档正文；文档结果标明当前项目范围，点击后切换到文件页并打开编辑器。
- 删除项目采用两步模态确认：先显示项目路径、会话数量及删除范围，再要求准确输入项目名称。删除请求失败时保留弹窗和输入，允许重试；提交期间禁止重复操作。会话删除使用单独的记录删除确认弹窗。
- 删除只修改应用数据目录中的项目、会话及消息记录，不处理项目目录中的文件、附件、缓存、项目记忆或旧数据库；删除最后一个项目后保持空状态，重启或重新添加不恢复已删除记录。暂不实现归档/恢复模块。
- 切换项目时提示处理未保存文档，清理原项目编辑器及上下文状态；运行中任务结束前禁止切换或删除项目。删除当前项目前须保存或关闭未保存文档，成功后清空当前项目和会话选择。
- 设置入口固定在底部。打开设置时临时折叠侧栏，关闭后按进入前状态恢复；用户在设置期间的手动切换优先。

## 内容区导航

统一顶栏左侧显示会话标题或任务中心标题和“工作区 · 模型”，右侧显示互斥的“对话/文件/任务”分段控件。对话是默认页。切换到文件页时先显示完整文件列表，选中文档后再展开右侧编辑器；收起编辑器后保留文件列表。任务页显示当前工作区的后台任务和分析产物，不改变当前会话。

## 响应式规则

- 低于 1180px：侧栏 248px。
- 低于 900px：侧栏可进一步收窄至 232px；文件页优先隐藏文件列表，让编辑器占满右侧。
- 折叠侧栏后保留品牌图标、展开按钮、项目操作和设置入口；展开后恢复搜索和会话列表。
- 文本缩放、长工作区路径和长模型名不得挤压导航按钮。

## 组件与业务功能映射

本表是壳层页面验收清单；功能点和入口编号由 [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md) 统一定义。

### 标题栏、导航与诊断

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SHELL-APP-MENUS` | 入口 | Windows 应用菜单 / macOS 原生菜单 | `BF-WORKSPACE-001`、`BF-WORKSPACE-003`、`BF-CONVERSATION-001`、`BF-DOCUMENT-001`、`BF-DOCUMENT-005`、`BF-DOCUMENT-006`、`BF-NAV-001` 至 `BF-NAV-003`、`BF-SETTINGS-001`、`BF-SHELL-002` 至 `BF-SHELL-004`、`BF-DIAGNOSTICS-001` / `EP-WORKSPACE-001`、`EP-WORKSPACE-003`、`EP-CONVERSATION-001`、`EP-DOCUMENT-001`、`EP-DOCUMENT-005`、`EP-DOCUMENT-006`、`EP-NAV-001` 至 `EP-NAV-003`、`EP-SETTINGS-001`、`EP-SHELL-002` 至 `EP-SHELL-004`、`EP-DIAGNOSTICS-001` | 汇集文件、编辑、查看、窗口和帮助命令；平台承载不同但语义一致 | `src/App.tsx` `TitleBar`、`installMacMenu` | 已实现 |
| `UI-SHELL-MENU-TRIGGER` | 操作 | 文件、编辑、查看、窗口、帮助菜单按钮 | `BF-WORKSPACE-001`、`BF-WORKSPACE-003`、`BF-CONVERSATION-001`、`BF-DOCUMENT-001`、`BF-DOCUMENT-005`、`BF-DOCUMENT-006`、`BF-NAV-001` 至 `BF-NAV-003`、`BF-SETTINGS-001`、`BF-SHELL-002` 至 `BF-SHELL-004`、`BF-DIAGNOSTICS-001` / `EP-WORKSPACE-001`、`EP-WORKSPACE-003`、`EP-CONVERSATION-001`、`EP-DOCUMENT-001`、`EP-DOCUMENT-005`、`EP-DOCUMENT-006`、`EP-NAV-001` 至 `EP-NAV-003`、`EP-SETTINGS-001`、`EP-SHELL-002` 至 `EP-SHELL-004`、`EP-DIAGNOSTICS-001` | 展开一个菜单，点击外部或 Escape 后关闭；菜单项覆盖对应应用级命令 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-WINDOW-CONTROLS` | 操作 | 最小化、最大化/还原、关闭按钮 | `BF-SHELL-003` / `EP-SHELL-003` | 调用桌面窗口能力并同步最大化状态 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-CONTENT-SWITCHER` | 入口 | 对话、文件、任务分段控件 | `BF-NAV-001`、`BF-NAV-002`、`BF-NAV-003` / `EP-NAV-001`、`EP-NAV-002`、`EP-NAV-003` | 在三个内容页之间互斥切换，不改变当前会话和工作区 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-CONTENT-SUMMARY` | 状态 | 页面标题、工作区和模型摘要 | `BF-NAV-001`、`BF-NAV-002`、`BF-NAV-003` / `EP-NAV-001`、`EP-NAV-002`、`EP-NAV-003` | 展示当前页面、工作区和活动模型 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-DIALOG` | 结果 | 运行日志面板 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 展示日志路径、平台、版本和最近运行事件 | `src/App.tsx` `App` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-ACTIONS` | 操作 | 关闭、刷新、复制日志 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 控制日志面板并复制只读诊断内容 | `src/App.tsx` `App` | 已实现 |

### 项目、会话与搜索

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

## 验收

- Windows/macOS 都能访问同一组核心命令。
- 三组窗口尺寸（1440×900、1280×800、1024×680）无重叠或布局跳动。
- 设置打开/关闭正确处理侧栏状态；页面切换不丢失会话或编辑草稿。
- 壳层新增或调整业务入口时，同步更新 `UI_ENTRY_POINTS.md` 中的 `BF-*`/`EP-*` 和本文中的 `UI-*` 映射。
