# UI 设计：应用壳层与入口

- 状态：`D-SHELL` 当前实现基线与目标约束；标题栏目标菜单待实现对齐
- 版本：`0.1.0`
- 更新日期：`2026-09-24`
- 适用端：Windows、macOS 桌面应用；浏览器仅用于演示和代码层验证
- 功能域：`D-SHELL` 应用壳层与入口
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)
- 导航业务：[UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md)
- 全局视觉与组件：[UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)
- 状态、流程与跨域规则：[UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md)
- 标题栏专项：[TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md)
- 壳层验收：[UI_ACCEPTANCE_SHELL.md](./acceptance/UI_ACCEPTANCE_SHELL.md)
- 导航验收：[UI_ACCEPTANCE_NAVIGATION.md](./acceptance/UI_ACCEPTANCE_NAVIGATION.md)

## 1. 文档总述

### 1.1 目标

应用壳层为项目、会话、当前模型和内容页面提供稳定承载边界：

- Windows 和 macOS 可以使用不同的窗口装饰与菜单承载，但核心命令、业务语义和返回路径保持一致。
- “对话 / 文件 / 日志”是互斥的内容级导航，不因页面切换而丢失当前承载状态。
- 标题栏、侧栏、内容区和窗口控制在不同尺寸下保持稳定，不让文本或图标遮挡主入口。
- 入口失败在触发上下文中反馈，临时层关闭后回到合理焦点，不静默重置业务状态。

### 1.2 责任边界

| 本文件负责 | 其他文档负责 |
| --- | --- |
| 标题栏、平台菜单、窗口控制、侧栏容器、内容区顶栏和内容页切换 | 项目、会话、搜索、标题生命周期和删除边界：[UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md) |
| 设置入口的承载、进入前后壳层状态和诊断入口 | 模型配置、连接测试和凭据边界：[UI_DESIGN_SETTINGS.md](./UI_DESIGN_SETTINGS.md) |
| 壳层尺寸、断点、平台安全区和全局焦点路径 | 颜色、字体、间距和控件 Token：[UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) |
| 壳层层面的空态、加载、错误和响应式承载 | 领域状态机和跨域保护：[UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md) |

侧栏是壳层容器，不等于导航业务。`D-SHELL` 的 `W0-SHELL-P` 通过只证明结构、平台入口和承载稳定；项目/会话的 fixture、真实端到端和跨域回归分别由 `D-NAV` 的 `W0-NAV-F`、`W2-NAV-E`、`W4-NAV-R` 判定。

### 1.3 术语

| 术语 | 规范含义 |
| --- | --- |
| 工作区 | 当前授权并打开的本地目录及其文件边界 |
| 内容页 | `chat` 对话页、`file` 文件页、`logs` 日志中心三者之一 |
| 应用设置 | 临时替换内容区的设置页面，不是第四个内容页 |
| 应用诊断日志 | 只读运行事件弹窗，与日志中心中的任务记录不同 |
| 壳层 | 标题栏、侧栏、内容区顶栏、内容页面容器和窗口控制的组合 |

## 2. 竞品证据与设计决策

正式竞品名称和市场准入以[正式竞品名录](../../competitors/COMPETITOR_CATALOG.md)及[竞品术语规范](../../competitors/TERMINOLOGY.md)为准；功能决策台账见[FEATURE_DECISIONS.md](../../competitors/FEATURE_DECISIONS.md)。

| 设计事项 | 证据性质 | Vinkey 决策 | 追踪 |
| --- | --- | --- | --- |
| 本地工作区与 AI/文档共存壳层 | Obsidian、Cursor、Cherry Studio、NoteGen、Typora 等正式名录产品的公开资料 | 左侧稳定导航容器，右侧统一内容工作面；不引入账号、云同步和通用 IDE 入口 | `CF-019`，已参考/组合改造 |
| 项目、会话与文件边界 | CloudCLI、Cherry Studio、NoteGen、Obsidian、Typora；逐项证据见 [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md#21-逐项证据卡) | 全局菜单表达项目和会话；文件编辑回到项目文件页局部入口 | `CF-024`，设计已决策、实现待对齐 |
| 平台窗口与菜单习惯 | Cursor、Obsidian、Typora 等正式名录产品及 Tauri 平台约束 | Windows 自绘标题栏；macOS 原生菜单/Overlay；核心命令语义一致 | `CF-021`/`CF-024`，组合改造 |
| 项目/会话/搜索业务 | 详见导航域，不在本表重复作为壳层证据 | 侧栏只规定位置、宽度和折叠承载；业务行为由 `D-NAV` 决定 | `CF-020`，见 [UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md) |
| Vinkey 原创安全约束 | 无单一竞品可直接证明 | 诊断脱敏、焦点恢复、入口失败保留上下文；危险操作不由壳层静默放行 | `CF-019`/`CF-021` |

竞品存在某项能力只说明观察证据，不构成 Vinkey 必须复制该能力。壳层文档不再使用竞品行为替代导航域的项目、会话或搜索验收。

## 3. 信息结构与 Shell 布局

```text
应用窗口
├─ Windows：36px 自绘标题栏；macOS：Overlay 标题区与系统菜单
└─ 应用工作区
   ├─ 侧栏容器：品牌、折叠、添加/刷新、导航业务承载、设置入口
   └─ 内容区
      ├─ 内容区顶栏：页面标题、工作区/模型摘要、对话/文件/日志切换
      └─ 内容页：对话、文件或日志中心
```

| 项目 | 当前基线 | 设计约束 |
| --- | --- | --- |
| 推荐窗口 | `1440 x 900` | 用于主验收截图和视觉比较 |
| 最小桌面窗口 | `1024 x 680` | 内容区仍可达，不能出现横向遮挡 |
| 应用工作区 | `min-width: 800px` | 桌面端不以窄手机布局替代桌面验收 |
| 侧栏默认宽度 | `288px` | 不挤压主导航；导航业务的文本可截断 |
| 侧栏窄窗口 | `248px`（<=1180px）、`232px`（<=900px） | 内容区优先保持可操作 |
| 折叠侧栏 | `52px` | 保留品牌、展开、添加、刷新、设置等壳层/全局入口承载 |
| 内容区 | `minmax(480px, 1fr)` | 始终是最大、最稳定区域 |
| 内容顶栏 | `56px` | 页面标题、摘要和三项切换保持稳定高度 |
| macOS 安全区 | 侧栏顶部 `42px` | 为 Overlay 交通灯预留空间 |

## 4. 页面预览与流转

以下示意只表达壳层区域关系，不定义颜色；实际 Token 以 [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) 为准。

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td colspan="2"><strong>Windows 自绘标题栏 / macOS Overlay 标题区</strong>　品牌　项目　会话　编辑　查看　窗口　帮助　窗口控制</td></tr>
  <tr>
    <td width="28%" height="230" valign="top"><strong>侧栏容器</strong><br>品牌　主题　折叠<br>导航业务承载区<br>添加/刷新/全局入口承载<br><strong>设置入口</strong></td>
    <td valign="top"><strong>内容区顶栏</strong>　页面标题　工作区 · 模型　　<strong>对话</strong>　|　<strong>文件</strong>　|　<strong>日志</strong><br><br><div align="center"><strong>稳定内容工作面</strong><br>由对话、文件、日志域分别实现</div></td>
  </tr>
</table>

```text
启动
├─ 无工作区 -> 空态 -> 添加/打开工作区 -> 工作台
└─ 已登记项目 -> 恢复承载状态 -> 工作台

工作台
├─ 侧栏导航业务 -> 由 D-NAV 处理项目/会话/搜索
├─ 内容区 -> 对话 / 文件 / 日志（互斥切换）
├─ 设置 -> 临时替换内容区 -> 返回并恢复壳层状态
└─ 帮助/诊断 -> 原生提示或只读弹窗 -> 关闭后回到原页面
```

## 5. 应用外壳模块

### 5.1 标题栏、菜单与窗口控制

Windows 自绘标题栏显示品牌、当前项目/模型、“项目/会话/编辑/查看/窗口/帮助”菜单及窗口控制；空白区域可拖动，双击切换最大化。macOS 使用系统全局菜单、Overlay 标题区和红黄绿交通灯。

应用级命令包括添加/刷新项目、新建/搜索/停止会话、通用编辑命令、对话/项目文件/任务与日志切换、主题、快捷键、窗口诊断、应用诊断日志和关于。新建文档、保存当前文档、关闭文档由项目文件页工具栏、文档标签和 `Ctrl/Cmd+S` 承担；设置由侧栏或平台应用菜单进入。命令的项目/会话业务前置条件以 [UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md) 为准。

编辑菜单按当前焦点对象分派给对话输入框、CodeMirror 文件编辑器、搜索框或设置表单；无有效编辑目标时禁用。Windows 不得用无上下文的 `document.execCommand` 代替焦点命令桥接。完整菜单逐项规范、竞品证据和实现缺口见 [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md)。

菜单一次只展开一个；点击外部区域或按 `Escape` 关闭。按钮、菜单项和窗口控制必须有可读名称，图标不能成为唯一语义来源。详细菜单和快捷键见 [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md)。

### 5.2 侧栏容器

- 展开态提供导航业务的稳定承载区，顶部承载品牌/主题/折叠，中部承载项目、会话和搜索，底部承载设置。
- 折叠态保留品牌、展开、添加、刷新、设置和全局搜索等可达入口；项目/会话列表可隐藏，但壳层不能让用户失去恢复路径。
- 侧栏宽度变化必须同步 macOS Overlay 原生窗口控制，不改变内容区业务状态。
- 项目、会话、搜索的具体操作、标题和删除规则不在壳层重复定义，统一链接到 [UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md)。

### 5.3 内容区导航

内容区顶栏左侧显示当前页面标题或“日志中心”，下方显示工作区与活动模型摘要；右侧为互斥的“对话 / 文件 / 日志”分段控件。`ContentPanel` 通过 `chat | file | logs` 管理当前页：

- 对话：消息流、输入区、模型和上下文入口。
- 文件：文件列表、编辑器和预览。
- 日志：当前工作区后台任务、执行步骤和分析产物。

设置页面是内容区临时替换，不是第四个内容页；返回后恢复之前的内容页和壳层状态。内容页内部业务由对应域文档负责。

### 5.4 诊断与全局反馈

- “窗口诊断信息”用于平台窗口和原生控制核对。
- “应用诊断日志”是只读弹窗，显示路径、平台、版本和最近事件，支持刷新和复制。
- 内容区错误条保留触发前的页面和承载状态；错误可在触发上下文处理时不得升级为全局错误。
- 诊断和错误内容必须脱敏，不显示 API Key、完整作品正文、系统用户名和未脱敏绝对路径。

## 6. 壳层状态与平台规则

| 状态/场景 | 壳层断言 | 业务责任 |
| --- | --- | --- |
| 首次打开/无工作区 | 显示空态和添加工作区入口，失败不覆盖现有承载 | `D-NAV` |
| 内容页切换 | 对话/文件/日志互斥，内容容器不跳动 | 各内容域 |
| 设置打开/返回 | 侧栏按状态规则临时折叠，返回恢复进入前页面 | `D-MODEL`/`D-NAV` |
| 加载/错误/重试 | 有稳定占位、错误位置和返回/重试路径 | 对应功能域 |
| 窄窗口/文本缩放 | 入口不遮挡，尺寸按断点收窄；小于 `700px` 的隐藏行为明确 | 响应式回归 |
| 菜单/弹窗 | `Escape`、外部点击和焦点返回可预测 | 壳层自身 |

### 6.1 平台承载矩阵

| 能力 | Windows | macOS | 共同语义 |
| --- | --- | --- | --- |
| 标题栏 | 自绘 36px 标题栏和窗口控制 | Overlay 标题区和原生交通灯 | 品牌、工作区/模型摘要和核心命令一致 |
| 菜单 | 窗口内项目/会话/编辑/查看/窗口/帮助 | 系统全局菜单（Vinkey/项目/会话/编辑/查看/窗口/帮助） | 命令文字、快捷键和前置条件一致 |
| 侧栏 | 默认展开，可折叠至 52px | 默认展开，Overlay 安全区随宽度同步 | 导航业务承载位置一致 |
| 诊断 | 应用诊断日志弹窗 | 应用诊断日志弹窗和窗口诊断 | 只读、可刷新、可复制，不改业务状态 |

### 6.2 响应式基线

| 条件 | 当前行为 | 验收要求 |
| --- | --- | --- |
| `>1180px` | 侧栏 `288px`，内容区至少 `480px` | 主入口、摘要和内容切换不跳动 |
| `<=1180px` | 侧栏 `248px` | 文本省略但不遮挡按钮 |
| `<=900px` | 侧栏 `232px`；文件域可隐藏文件列表 | 编辑器和返回路径清晰 |
| `<=700px` | 当前 CSS 隐藏侧栏和桌面应用菜单 | 只作为窄屏/浏览器演示，不替代桌面验收；全局入口缺失需记录 |
| macOS Overlay | 侧栏顶部 `42px` 安全区 | 交通灯不遮挡入口 |

### 6.3 全局视觉和 A11y

- 所有尺寸、颜色、字体、圆角、动效、焦点轮廓和图标规则引用 [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)。
- 壳层按钮和菜单有键盘路径；图标按钮提供 `title` 和 `aria-label`，状态不能只依赖颜色。
- 菜单、弹窗、错误条和侧栏切换有明确焦点顺序；`Escape` 关闭后焦点回到触发入口或合理内容位置。
- 长路径、页面标题和模型名使用省略，不改变按钮和内容导航稳定尺寸。

## 7. 壳层组件与实现追踪

| 组件 ID | 类型 | 功能点 / 入口 | 行为或结果 | 实现位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `UI-SHELL-APP-MENUS` | 入口 | `BF-SHELL-*`、`BF-NAV-*`、文档和诊断入口 | 汇集应用级命令；平台承载不同但语义一致 | `src/App.tsx`、`installMacMenu` | 部分实现：旧“文件”菜单存在，目标“项目/会话”菜单待对齐 |
| `UI-SHELL-MENU-TRIGGER` | 操作 | `EP-SHELL-*` | 一次展开一个菜单；外部点击/Escape 关闭 | `src/App.tsx` | 已实现 |
| `UI-SHELL-WINDOW-CONTROLS` | 操作 | `BF-SHELL-003` / `EP-SHELL-003` | 最小化、最大化/还原、关闭和状态同步 | `src/App.tsx`、Tauri bridge | 已实现 |
| `UI-SHELL-CONTENT-SWITCHER` | 入口 | `BF-NAV-001..003` / `EP-NAV-001..003` | 互斥切换三类内容页，不改变承载状态 | `src/App.tsx` `ContentPanel` | 已实现 |
| `UI-SHELL-CONTENT-SUMMARY` | 状态 | `BF-NAV-001..003` / `EP-NAV-001..003` | 显示页面、工作区和活动模型摘要 | `src/App.tsx` | 已实现 |
| `UI-SHELL-RUNTIME-LOG-DIALOG` | 结果 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 只读诊断弹窗；焦点约束和 Escape 仍待补证据 | `src/App.tsx` | 部分实现 |
| `UI-SHELL-RUNTIME-LOG-ACTIONS` | 操作 | `BF-DIAGNOSTICS-001` / `EP-DIAGNOSTICS-001` | 刷新、复制、关闭诊断内容 | `src/App.tsx` | 已实现 |
| `UI-SIDEBAR-THEME` | 操作 | `BF-SHELL-002` / `EP-SHELL-002` | 切换窗口主题，不改变业务状态 | `ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-COLLAPSE` | 操作 | `BF-SHELL-001` / `EP-SHELL-001` | 改变侧栏宽度并同步 `aria-expanded` | `ProjectSessionSidebar.tsx` | 已实现 |
| `UI-SIDEBAR-SETTINGS` | 入口 | `BF-SETTINGS-001` / `EP-SETTINGS-001` | 承载设置入口，按规则临时折叠侧栏 | `ProjectSessionSidebar.tsx` | 已实现 |

导航组件 `UI-SIDEBAR-ADD-PROJECT`、`UI-PROJECT-*`、`UI-CONVERSATION-*`、`UI-SIDEBAR-SEARCH*` 和 `UI-RECORD-DELETE-*` 的详细业务映射见 [UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md)。既有 `UI-*` 编号保持稳定，不因文档归属迁移而复用。

| 层级 | 代码位置 | 壳层责任 |
| --- | --- | --- |
| 页面组装 | [`src/App.tsx`](../../../src/App.tsx) | 内容页、设置替换、错误、诊断和菜单挂载 |
| 应用状态 | [`src/store.ts`](../../../src/store.ts) | 主题、页面承载、设置折叠恢复和运行边界 |
| 桌面桥接 | [`src/lib/desktop.ts`](../../../src/lib/desktop.ts) | 浏览器演示与 Tauri 分流，窗口/菜单/诊断能力统一封装 |
| 原生窗口控制 | [`src/lib/nativeWindowControls.ts`](../../../src/lib/nativeWindowControls.ts)、`src-tauri/src/window_controls.rs` | 侧栏宽度、macOS 交通灯和窗口诊断同步 |
| 样式与断点 | [`src/styles.css`](../../../src/styles.css) | 网格宽度、平台安全区、折叠和断点 |

## 8. 资源交付与设计验收标准

- 图标统一使用已启用的 Lucide 图标库；新增图标必须有业务语义、`title` 和 `aria-label`，不提交重复手绘 SVG。
- 颜色、字体、圆角、间距和焦点样式只能引用 `UI_DESIGN_SYSTEM.md` 的语义 Token。
- 平台实现同时记录 React 入口、桌面桥接和 Rust/Tauri 命令位置，或明确 `N/A`。
- 设计截图使用 `1440x900`、`1280x800`、`1024x680` 命名；原生窗口截图、诊断日志和人工观察归档到验收附件。

`W0-SHELL-P` 必须满足：

1. Windows/macOS 可访问同一组核心命令，平台差异只改变承载方式。
2. 对话、文件、日志切换不造成内容容器跳动或壳层状态丢失。
3. 无工作区、加载、错误、设置替换和诊断弹窗有可理解反馈与返回路径。
4. 推荐窗口尺寸无重叠、遮挡或导航跳动；窄屏隐藏行为有明确限制。
5. 菜单、图标按钮、弹窗和侧栏切换有键盘路径、可见焦点、可读名称和 Escape 关闭路径。

项目/会话/搜索业务不得用 `W0-SHELL-P` 的结构截图代替导航验收；执行结果见 [UI_ACCEPTANCE_SHELL.md](./acceptance/UI_ACCEPTANCE_SHELL.md) 和 [UI_ACCEPTANCE_NAVIGATION.md](./acceptance/UI_ACCEPTANCE_NAVIGATION.md)。

## 附录：相关 ID 与证据入口

| 类型 | 入口 |
| --- | --- |
| 功能入口 | [UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md) |
| 导航设计 | [UI_DESIGN_NAVIGATION.md](./UI_DESIGN_NAVIGATION.md) |
| 竞品与决策 | [COMPETITOR_CATALOG.md](../../competitors/COMPETITOR_CATALOG.md)、[FEATURE_DECISIONS.md](../../competitors/FEATURE_DECISIONS.md)，`CF-019` 至 `CF-024`；标题栏证据卡见 [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md#21-逐项证据卡) |
| 设计系统 | [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) |
| 壳层验收 | [UI_ACCEPTANCE_SHELL.md](./acceptance/UI_ACCEPTANCE_SHELL.md)；标题栏菜单专项：[UI_ACCEPTANCE_TITLE_BAR_PLAN.md](./acceptance/UI_ACCEPTANCE_TITLE_BAR_PLAN.md) |

## 变更记录

| 日期 | 变更 |
| --- | --- |
| `2026-09-15` | 建立应用壳层当前实现基线 |
| `2026-09-22` | 补充竞品决策、页面流转、平台断点和设计验收边界 |
| `2026-09-23` | 收窄为 `D-SHELL`；项目/会话/搜索业务迁移至 `D-NAV`，壳层验收改为 `W0-SHELL-P` |
| `2026-09-24` | 对齐标题栏目标菜单：全局“文件”调整为“项目”，新增“会话”；文档操作局部化，编辑命令按焦点分派，设置移出“查看”；当前旧菜单保留为实现缺口 |
