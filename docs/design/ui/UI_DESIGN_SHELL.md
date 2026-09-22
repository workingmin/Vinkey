# UI 设计：应用壳层与入口

- 状态：当前版本实现基线与目标约束
- 版本：`0.1.0`
- 更新日期：`2026-09-22`
- 适用端：Windows、macOS 桌面应用；浏览器仅用于演示和代码层验证
- 功能域：应用壳层与入口（W0-A）
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)
- 全局视觉与组件：[UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)
- 状态、流程与跨域规则：[UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md)
- 标题栏专项：[TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md)
- 专项验收：[应用壳层与入口验收报告](./acceptance/UI_ACCEPTANCE_SHELL.md)
- 本地回填：[应用壳层与入口本地验收模板](./acceptance/UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md)

## 1. 文档总述

### 1.1 目标

应用壳层为项目、会话、当前模型和内容页面提供稳定的承载边界：

- 工作区、项目、会话和当前模型在可理解的位置持续可见。
- “对话 / 文件 / 日志”是互斥的内容级导航，不因页面切换而丢失工作区、会话或编辑草稿。
- Windows 和 macOS 可以使用不同的窗口装饰与菜单承载，但核心命令、业务语义和返回路径保持一致。
- 入口失败时在触发上下文中反馈，并保留可恢复的用户状态。

### 1.2 范围

本文件负责窗口级和跨页面的设计约束：标题栏、平台菜单、项目与会话栏、内容区导航、工作区/会话/搜索/诊断入口、设置入口承载、响应式和壳层边界状态。

以下内容由其他文档负责，本文件只引用其规则：

| 内容 | 责任文档 | 本文件的处理方式 |
| --- | --- | --- |
| 色彩、字体、间距、图标、焦点和 WCAG | [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) | 只记录壳层尺寸、平台例外和必须满足的引用约束 |
| 首次打开、空态、加载、错误和跨域流程 | [UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md) | 只展开壳层入口直接触发的状态 |
| 入口编号、前置条件和返回目标 | [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md) | `BF-*`、`EP-*` 以入口台账为唯一来源 |
| 标题栏菜单、快捷键和窗口诊断 | [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md) | 保留壳层承载和验收断言，细节以专项文档为准 |
| 测试执行、截图和人工回填 | [UI_ACCEPTANCE_SHELL.md](./acceptance/UI_ACCEPTANCE_SHELL.md) | 本文件定义设计断言，报告记录执行结果 |

### 1.3 术语

| 术语 | 规范含义 |
| --- | --- |
| 工作区（workspace） | 当前授权并打开的本地目录及其文件内容边界 |
| 项目（project） | Vinkey 应用目录中的登记记录，可指向一个工作区；删除项目只删除应用记录 |
| 会话（conversation） | 绑定项目的对话记录、标题、消息和运行状态 |
| 内容页 | `chat` 对话页、`file` 文件页、`logs` 日志中心三者之一 |
| 应用设置 | 由侧栏或菜单进入的模型与应用设置页面；打开时临时替换内容区 |
| 应用诊断日志 | 记录应用运行事件的只读弹窗；与“日志中心”中的任务记录不同 |
| 壳层 | 标题栏、侧栏、内容区顶栏、内容页面容器和窗口控制的组合 |

### 1.4 非目标

首版不在壳层中引入账号、云同步、团队成员、插件市场、通用 IDE 终端、远程 CLI 控制面或全局悬浮助手入口。对话生成、模型连接、文件保存和后台任务的领域行为由对应功能域验收；壳层只保证入口、承载和状态边界。

## 2. 竞品证据与设计决策

正式竞品名称和市场准入以[正式竞品名录](../../competitors/COMPETITOR_CATALOG.md)及[竞品术语规范](../../competitors/TERMINOLOGY.md)为准；功能决策台账见[FEATURE_DECISIONS.md](../../competitors/FEATURE_DECISIONS.md)。竞品存在某项能力只说明观察证据，不构成 Vinkey 必须复制该能力。

| 设计事项 | 规范参考 | 证据性质 | Vinkey 决策 | 决策编号 |
| --- | --- | --- | --- | --- |
| 本地工作区作为一级边界 | Obsidian、MarkText、NoteGen | 正式名录中的长期本地工作台 | 项目记录绑定本地目录；应用记录和用户文件分开；不隐式访问全盘 | `CF-019`、`CF-020` |
| AI 与文档共存的桌面壳层 | Cursor、Cherry Studio | 正式名录中的 AI 工作台和编辑器 | 左侧项目/会话，右侧统一内容区；当前工作区和活动模型可见 | `CF-019` |
| 低干扰菜单和快捷键 | Typora；Scrivener 作为写作界面观察对象 | Typora 为正式名录对象；Scrivener 仅作设计观察 | 文件、编辑、查看、窗口、帮助分层；不引入编译出版和复杂元数据入口 | `CF-019` |
| 多项目与会话导航 | Obsidian、Cherry Studio、CloudCLI | 正式名录中的本地工作台和多 CLI 控制面 | 项目、会话和文档搜索共用侧栏，但不复制 CloudCLI 的远程控制面 | `CF-020` |
| 平台窗口与可访问入口 | Cursor；Ulysses、ChatGPT Desktop、豆包桌面端作为平台观察对象 | 正式名录与补充产品观察分开标注 | Windows 自绘标题栏，macOS 原生菜单/Overlay；图标统一 tooltip、`aria-label` 和焦点路径 | `CF-021` |
| 状态与安全边界 | 无单一竞品可以直接证明 | Vinkey 原创产品约束 | 运行中或未保存时禁止静默切换；删除只删除应用记录；异步结果校验 `workspaceId` | `CF-019`、`CF-020`、`CF-021` |

### 2.1 设计来源分类

- **直接参考**：采用成熟产品已验证的工作区、导航、菜单或状态表达原则，不复制代码和品牌资产。
- **组合改造**：将文档工作台、AI 工作台和桌面平台行为组合到 Vinkey 的本地优先边界内。
- **Vinkey 原创**：由本地隐私、任务阻断、工作区隔离、异步回写防护或文学工作流产生的约束。
- **暂不采用**：竞品具备但不符合当前范围、权限模型或验收成本的功能。

## 3. 信息结构与 Shell 布局

### 3.1 区域层级

```text
应用窗口
├─ Windows：36px 自绘标题栏；macOS：原生 Overlay 标题区与系统菜单
└─ 应用工作区
   ├─ 项目与会话栏
   │  ├─ 品牌、主题、折叠
   │  ├─ 添加/刷新项目
   │  ├─ 项目、会话和文档统一搜索
   │  └─ 模型与应用设置
   └─ 内容区
      ├─ 内容区顶栏：页面标题、工作区/模型摘要、对话/文件/日志切换
      └─ 内容页：对话、文件或日志中心
```

### 3.2 布局基线

| 项目 | 当前基线 | 设计约束 |
| --- | --- | --- |
| 推荐窗口 | `1440 x 900` | 用于主验收截图和视觉比较 |
| 最小桌面窗口 | `1024 x 680` | 内容区仍应可达，不能出现横向遮挡 |
| 应用工作区 | `min-width: 800px` | 由当前 CSS 基线约束；桌面端不以窄手机布局替代桌面验收 |
| 侧栏默认宽度 | `288px` | 项目名称、路径和会话状态可截断但不能挤压主导航 |
| 侧栏窄窗口 | `248px`（<=1180px）、`232px`（<=900px） | 文件页在有编辑器时优先隐藏文件列表 |
| 折叠侧栏 | `52px` | 保留品牌图标、展开、添加、刷新、设置入口 |
| 内容区 | `minmax(480px, 1fr)` | 始终是最大、最稳定的区域 |
| 内容顶栏 | `56px` | 标题摘要和三项内容切换均保持稳定高度 |
| macOS 安全区 | 侧栏顶部 `42px` | 为 Overlay 交通灯预留空间；窗口控制布局由原生桥接同步 |

### 3.3 平台承载

| 能力 | Windows | macOS | 共同语义 |
| --- | --- | --- | --- |
| 标题栏 | 自绘 36px 标题栏、应用菜单、最小化/最大化/关闭 | Overlay 标题区、原生交通灯、系统全局菜单 | 品牌、工作区/模型摘要和核心命令一致 |
| 菜单 | 窗口内文件/编辑/查看/窗口/帮助菜单 | 系统菜单承载同一命令集合 | 命令文字、快捷键和前置条件一致 |
| 侧栏 | 默认展开，可折叠至 52px | 默认展开，Overlay 安全区随侧栏宽度同步 | 项目、会话、搜索、设置的业务语义一致 |
| 诊断 | 应用诊断日志弹窗 | 应用诊断日志弹窗和窗口诊断 | 只读、可刷新、可复制且不改变会话 |

## 4. 页面预览与流转

### 4.1 页面预览

以下示意只表达区域和入口关系，不定义色彩；实际颜色、字体和间距必须引用 [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)。

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td colspan="2"><strong>Windows 自绘标题栏 / macOS Overlay 标题区</strong>　品牌　工作区 · 模型　文件　编辑　查看　窗口　帮助　窗口控制</td></tr>
  <tr>
    <td width="28%" height="230" valign="top"><strong>项目与会话栏</strong><br>主题　折叠<br>添加项目　刷新<br>统一搜索<br>项目与路径　新建会话<br>会话历史<br><strong>模型与应用设置</strong></td>
    <td valign="top"><strong>内容区顶栏</strong>　会话标题/日志中心　工作区 · 模型　　<strong>对话</strong>　|　<strong>文件</strong>　|　<strong>日志</strong><br><br><div align="center"><strong>稳定内容工作面</strong><br>对话：消息流 + 输入区<br>文件：文件列表 + 编辑器 / 预览<br>日志：后台任务 + 分析产物</div></td>
  </tr>
</table>

### 4.2 页面流转

```text
启动
├─ 无工作区 -> 空态 -> 添加/打开工作区 -> 工作台
└─ 已登记项目 -> 恢复当前项目 -> 工作台

工作台
├─ 侧栏项目 -> 检查运行任务/未保存 -> 切换项目 -> 清理旧域状态 -> 加载新项目
├─ 会话 -> 新建或恢复 -> 对话页
├─ 搜索 -> 项目/会话结果；当前项目文档结果 -> 文件页并打开文档
├─ 内容页 -> 对话 / 文件 / 日志（互斥切换）
├─ 设置 -> 临时折叠侧栏并替换内容区 -> 返回工作台并恢复侧栏规则
└─ 帮助/诊断 -> 原生提示或只读弹窗 -> 关闭后回到原页面
```

### 4.3 状态保持矩阵

| 操作 | 必须保留 | 必须清理或阻断 | 入口依据 |
| --- | --- | --- | --- |
| 对话/文件/日志切换 | 当前工作区、会话、编辑草稿 | 不清理消息或任务 | `BF-NAV-001..003` |
| 设置打开/关闭 | 进入前的侧栏状态；用户在设置期间手动切换优先 | 设置打开时内容区暂时替换 | `BF-SETTINGS-001` |
| 项目切换 | 新项目记录和页面入口 | 运行任务阻断；未保存修改需确认；旧项目编辑器和上下文清理 | `BF-WORKSPACE-002` |
| 会话恢复 | 标题、消息和运行结果 | 不串写其他项目 | `BF-CONVERSATION-002` |
| 文档搜索结果 | 当前项目边界和结果定位 | 不改变当前项目选择；异步返回过期时丢弃 | `BF-WORKSPACE-004` |
| 应用诊断弹窗 | 当前页面和会话 | 不修改业务状态 | `BF-DIAGNOSTICS-001` |
| 全局错误提示 | 触发前的工作区、会话和页面 | 只移除提示，不静默重置业务状态 | `BF-FEEDBACK-001` |

## 5. 应用外壳模块

### 5.1 标题栏、菜单与窗口控制

Windows 自绘标题栏显示品牌、当前工作区/模型、文件/编辑/查看/窗口/帮助菜单及窗口控制；空白区域可拖动，双击切换最大化。macOS 通过系统全局菜单提供同一命令集合，窗口使用 Overlay 标题区和红黄绿交通灯。

应用级命令包括：新建会话、打开工作区、新建文档、刷新、保存、关闭文档、撤销/重做/剪切/复制/粘贴/全选、对话/文件/日志切换、主题、设置、快捷键、窗口诊断、应用诊断日志和关于。

菜单打开后一次只保留一个菜单；点击外部区域或按 `Escape` 关闭。按钮、菜单项和窗口控制必须有可读名称，图标不能成为唯一语义来源。详细菜单和快捷键见 [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md)。

### 5.2 项目与会话栏

- 展开态头部依次承载品牌/主题/折叠、添加项目/刷新、统一搜索。
- 折叠态保留品牌图标、展开、添加项目、刷新和设置入口；项目、会话和搜索列表隐藏。
- 项目记录与当前工作区分开管理；重复添加同一目录时选中已有项目，不创建重复记录。
- 项目行显示名称、路径、当前选中状态、展开按钮、新建会话和删除项目记录按钮。
- 每个项目独立加载会话，具备加载中、空态、错误重试和会话数量反馈。
- 会话项显示标题、消息数、更新时间和运行中状态；运行中的会话不能删除。
- 搜索覆盖项目名称、路径、会话标题和当前项目文档正文；文档结果显示项目范围、行号和摘要。
- 删除项目采用路径/范围说明加准确名称的二次确认；只删除应用数据中的项目、会话和消息记录，不处理用户目录文件、附件、缓存或项目记忆。
- 项目切换前检查运行任务和未保存文档；禁止静默切换或静默丢弃。异步加载结果必须验证当前 `workspaceId`。
- 设置入口固定在侧栏底部；打开设置时按状态规则临时折叠侧栏，关闭后恢复进入前状态。

### 5.3 内容区导航

内容区顶栏左侧显示当前会话标题或“日志中心”，下方显示工作区与活动模型摘要；右侧为互斥的“对话 / 文件 / 日志”分段控件。`ContentPanel` 通过 `chat | file | logs` 管理当前页：

- **对话**：默认页，承载消息流、输入区、模型和上下文入口。
- **文件**：先显示文件列表，选中文档后显示编辑器；收起编辑器仍保留文件列表。
- **日志**：显示当前工作区的后台任务、执行步骤和分析产物，不改变当前会话。

设置页面是内容区的临时替换页面，不是第四个内容页；返回后恢复之前的内容页和壳层状态。

### 5.4 诊断与全局反馈

- “窗口诊断信息”用于平台窗口和原生控制核对。
- “应用诊断日志”是只读弹窗，显示路径、平台、版本和最近事件，支持刷新和复制。
- 内容区错误条保留触发前的业务状态，支持关闭；触发上下文能处理的错误不升级为全局错误。
- 诊断和错误内容必须脱敏，不显示 API Key、完整作品正文、系统用户名和未脱敏绝对路径。

## 6. 关键场景与边界状态

这里的“场景”是跨模块入口链路，不代表每一项都是独立页面。详细业务功能仍登记在 [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)。

| 场景 | 前置状态 | 设计断言 |
| --- | --- | --- |
| 首次打开/无工作区 | 无当前工作区 | 空态提供添加/打开工作区入口；失败不覆盖已有项目记录 |
| 项目切换 | 多个登记项目 | 运行中阻断；未保存需明确确认；完成后不会读取旧项目状态 |
| 会话新建/恢复/删除 | 当前项目已加载 | 新建进入空白对话；恢复标题和消息；删除有确认且不删用户文件 |
| 搜索 | 项目、会话或当前项目文档存在 | 结果按范围区分；无结果可解释；文档点击进入文件页并定位 |
| 内容页切换 | 对话、文件、日志可用 | 页面互斥切换，保留工作区、会话和草稿 |
| 设置打开/返回 | 任何内容页 | 侧栏按规则临时折叠；返回不丢失进入前页面和侧栏偏好 |
| 加载/失败/重试 | 会话、项目或诊断请求进行中 | 显示进行中状态；错误留在上下文；重试不重复提交 |
| 运行任务/未保存文档 | 当前项目有任务或草稿 | 禁止删除/切换造成静默丢失；提供停止、保存或返回路径 |
| 窄窗口/文本缩放 | 1180px、900px、700px 断点 | 文字不遮挡命令；桌面断点按矩阵收窄；移动/窄演示模式明确隐藏侧栏和桌面菜单 |

## 7. 响应式、平台与可访问性规则

### 7.1 当前响应式行为

| 条件 | 当前行为 | 验收要求 |
| --- | --- | --- |
| `>1180px` | 侧栏 `288px`，内容区至少 `480px` | 主入口、摘要和内容切换不跳动 |
| `<=1180px` | 侧栏 `248px` | 项目路径和模型名截断并可通过 tooltip 查看 |
| `<=900px` | 侧栏 `232px`；文件页有编辑器时隐藏文件列表 | 编辑器保持可编辑，返回文件列表路径清晰 |
| `<=700px` | 当前 CSS 隐藏会话侧栏和桌面应用菜单，内容区占满窗口 | 仅作为窄屏/浏览器演示行为；不替代 Windows/macOS 桌面验收 |
| macOS Overlay | 侧栏顶部 `42px` 安全区；原生交通灯随侧栏宽度同步 | 展开、折叠、窗口缩放和主题切换后交通灯不遮挡入口 |

### 7.2 全局视觉和 A11y 约束

- 所有尺寸、颜色、字体、圆角、动效、焦点轮廓和图标规则引用 [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)，不在本文件复制 Token 值。
- 壳层按钮和菜单必须有键盘路径；图标按钮提供 `title` 和 `aria-label`，状态不能只依赖颜色。
- 菜单、弹窗、错误条和侧栏切换必须有明确焦点顺序；`Escape` 关闭临时层后焦点回到触发入口或合理的内容位置。
- 长工作区路径、会话标题和模型名使用省略，不得改变按钮和内容导航的稳定尺寸。
- 遵循系统减少动态效果偏好；侧栏和设置页折叠动画不影响状态提交。

## 8. 组件业务映射与实现追踪

本表登记承载稳定业务语义的组件；功能点和入口编号由 [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md) 统一定义。视觉 Token、完整状态机和后端数据结构不在此重复登记。

### 8.1 标题栏、导航与诊断

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SHELL-APP-MENUS` | 入口 | Windows 应用菜单 / macOS 原生菜单 | `BF-WORKSPACE-001/003`、`BF-CONVERSATION-001`、`BF-DOCUMENT-001/005/006`、`BF-NAV-001..003`、`BF-SETTINGS-001`、`BF-SHELL-002..004`、`BF-DIAGNOSTICS-001` / 对应同编号 `EP-*` | 汇集文件、编辑、查看、窗口和帮助命令；平台承载不同但语义一致 | `src/App.tsx` `TitleBar`、`installMacMenu` | 已实现 |
| `UI-SHELL-MENU-TRIGGER` | 操作 | 文件、编辑、查看、窗口、帮助菜单按钮 | 与 `UI-SHELL-APP-MENUS` 相同的 `BF-*` / `EP-*` | 一次展开一个菜单；外部点击或 `Escape` 关闭 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-WINDOW-CONTROLS` | 操作 | 最小化、最大化/还原、关闭按钮 | `BF-SHELL-003` / `EP-SHELL-003` | 调用桌面窗口能力并同步最大化状态 | `src/App.tsx` `TitleBar` | 已实现 |
| `UI-SHELL-CONTENT-SWITCHER` | 入口 | 对话、文件、日志分段控件 | `BF-NAV-001..003` / `EP-NAV-001..003` | 在三个内容页之间互斥切换，不改变当前会话和工作区 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-CONTENT-SUMMARY` | 状态 | 页面标题、工作区和模型摘要 | `BF-NAV-001..003` / `EP-NAV-001..003` | 展示当前页面、工作区和活动模型；日志页显示当前项目范围 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-DIALOG` | 结果 | 应用诊断日志弹窗 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 展示日志路径、平台、版本和最近事件，与日志中心区分；Escape 和焦点管理待补 | `src/App.tsx` `App` | 部分实现 |
| `UI-SHELL-RUNTIME-LOG-ACTIONS` | 操作 | 关闭、刷新、复制日志 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 控制只读诊断面板，不改变会话 | `src/App.tsx` `App` | 已实现 |

### 8.2 项目、会话与搜索

| 组件 ID | 类型 | 组件 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `UI-SIDEBAR-THEME` | 操作 | 侧栏主题切换按钮 | `BF-SHELL-002` / `EP-SHELL-002` | 在深色和浅色主题间切换 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-COLLAPSE` | 操作 | 折叠/展开会话栏按钮 | `BF-SHELL-001` / `EP-SHELL-001` | 切换侧栏宽度并同步 `aria-expanded` | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-ADD-PROJECT` | 入口 | 添加项目按钮及空态按钮 | `BF-WORKSPACE-001` / `EP-WORKSPACE-001` | 打开目录选择或浏览器演示工作区 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |
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
| `UI-RECORD-DELETE-DIALOG` | 确认 | 项目/会话记录删除对话框 | `BF-WORKSPACE-005`、`BF-CONVERSATION-003` / `EP-WORKSPACE-005`、`EP-CONVERSATION-003` | 项目名称确认；会话单独确认；均不删除用户文件 | `src/components/RecordDeletionDialog.tsx` | 已实现 |
| `UI-RECORD-DELETE-RESULT` | 结果 | 删除提交中和内联错误状态 | `BF-WORKSPACE-005`、`BF-CONVERSATION-003` / `EP-WORKSPACE-005`、`EP-CONVERSATION-003` | 禁止重复提交；失败保留对话框、输入和重试能力 | `src/components/RecordDeletionDialog.tsx` | 已实现 |
| `UI-SIDEBAR-SETTINGS` | 入口 | 模型与应用设置按钮 | `BF-SETTINGS-001` / `EP-SETTINGS-001` | 打开设置页并按规则临时折叠侧栏 | `src/components/ProjectSessionSidebar.tsx` | 已实现 |

### 8.3 实现边界

| 层级 | 代码位置 | 壳层责任 |
| --- | --- | --- |
| 页面组装 | [`src/App.tsx`](../../../src/App.tsx) | `ContentPage` 管理三页；`settingsOpen` 管理设置替换；错误、诊断和菜单挂载在应用层 |
| 应用状态 | [`src/store.ts`](../../../src/store.ts) | 工作区、会话、主题、设置折叠恢复、运行锁定和编辑草稿的状态边界 |
| 桌面桥接 | [`src/lib/desktop.ts`](../../../src/lib/desktop.ts) | 浏览器演示与 Tauri 分流；工作区、项目、会话、窗口和诊断入口统一封装 |
| 原生窗口控制 | [`src/lib/nativeWindowControls.ts`](../../../src/lib/nativeWindowControls.ts)、`src-tauri/src/window_controls.rs` | 侧栏宽度、macOS 交通灯和窗口诊断同步 |
| 桌面权限与路径 | `src-tauri/src/lib.rs`、`projects.rs`、`database.rs` | 工作区授权、路径守卫、项目记录和运行任务阻断 |
| 样式与断点 | [`src/styles.css`](../../../src/styles.css) | 网格宽度、平台安全区、折叠、内容页和 `1180/900/700px` 断点 |

## 9. 资源与工程交付约束

- 图标统一使用已启用的 Lucide 图标库；新增图标必须有业务语义、`title` 和 `aria-label`，不提交重复手绘 SVG。
- 颜色、字体、圆角、间距和焦点样式只能引用 `UI_DESIGN_SYSTEM.md` 的语义 Token；壳层新增 Token 先更新全局系统文档。
- 平台相关实现分为 React 入口、桌面桥接和 Rust/Tauri 命令三层，文档必须同时记录三层位置或明确 `N/A`。
- 设计截图使用 `1440x900`、`1280x800`、`1024x680` 命名；Windows/macOS 原生窗口截图、诊断日志和人工观察归档到验收附件，不把未脱敏原始材料提交到 Git。
- 入口变更必须同步更新 `UI_ENTRY_POINTS.md` 的 `BF-*`/`EP-*`、本文 `UI-*` 映射和 `UI_INVENTORY.md`；删除组件保留旧 ID 并标记“已移除”。

## 10. 设计验收标准

本节是设计层断言，执行结果和证据归档见[应用壳层与入口专项验收报告](./acceptance/UI_ACCEPTANCE_SHELL.md)。

### 10.1 必须满足

1. Windows/macOS 均可访问同一组核心命令；平台差异只改变承载方式。
2. 对话、文件、日志切换不清空工作区、会话、编辑草稿或运行状态。
3. 无工作区、无会话、搜索无结果、加载中、失败、运行中和未保存状态均有可理解反馈和恢复路径。
4. 运行任务或未保存文档存在时，项目切换和删除不会静默丢失状态。
5. 项目、会话和文档搜索结果明确显示范围；异步结果不会回写已切换的工作区。
6. 设置打开/关闭遵循侧栏恢复规则；诊断弹窗和全局错误关闭后不改变业务状态。
7. `1440x900`、`1280x800`、`1024x680` 可执行窗口尺寸无重叠、遮挡或导航跳动；小于 `700px` 的隐藏侧栏行为有明确说明。
8. 入口、菜单、图标按钮和弹窗有键盘路径、可见焦点、可读名称和 Escape 关闭路径。

### 10.2 当前实现与验收边界

- 前端自动化和构建结果记录在专项报告；`App`、`TitleBar`、`ContentPanel`、`ProjectSessionSidebar` 的直接渲染覆盖仍需补齐或由人工验收承担。
- 应用诊断日志弹窗已具备展示、刷新、复制和按钮关闭，但 Escape 关闭、初始焦点、焦点约束及关闭后的焦点恢复尚未形成实现与测试证据，因此对应组件标记为“部分实现”。
- `<=700px` 当前会隐藏项目与会话栏及桌面应用菜单，尚无等价的窄屏导航入口；该断点只可作为浏览器演示现状，不能宣称移动端壳层完成。
- macOS 原生菜单、Overlay 交通灯、Windows 自绘窗口控制、DPI、真实窗口尺寸和 Tauri 运行行为必须在目标平台执行；Linux/浏览器不能替代。
- 模型设置保存、真实模型状态、对话生成、文件保存和后台任务完整链路属于 W1/W2/W3/W4 复核，不由本文件单独宣称通过。

## 附录 A：相关 ID 与证据入口

| 类型 | 入口 |
| --- | --- |
| 功能入口 | [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md) |
| 竞品名录与术语 | [COMPETITOR_CATALOG.md](../../competitors/COMPETITOR_CATALOG.md)、[TERMINOLOGY.md](../../competitors/TERMINOLOGY.md) |
| 功能决策 | [FEATURE_DECISIONS.md](../../competitors/FEATURE_DECISIONS.md)，`CF-019` 至 `CF-021` |
| 设计系统 | [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) |
| 状态和流程 | [UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md) |
| 桌面验收 | [UI_ACCEPTANCE_SHELL.md](./acceptance/UI_ACCEPTANCE_SHELL.md)、[UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md](./acceptance/UI_ACCEPTANCE_SHELL_RUN_TEMPLATE.md) |

## 附录 B：变更记录

| 日期 | 变更 |
| --- | --- |
| `2026-09-15` | 建立应用壳层当前实现基线 |
| `2026-09-22` | 按壳层职责重构文档；补充竞品决策、页面流转、状态保持、关键场景、平台断点、资源交付和验收边界；统一“对话 / 文件 / 日志”术语 |
