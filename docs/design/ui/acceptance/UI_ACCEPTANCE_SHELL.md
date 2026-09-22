# 应用壳层与入口专项验收报告

- 功能域：应用壳层与入口（W0-A）
- 验收对象：[UI_DESIGN_SHELL.md](../UI_DESIGN_SHELL.md)、[TITLE_BAR_DESIGN.md](../TITLE_BAR_DESIGN.md)、[UI_ENTRY_POINTS.md](../UI_ENTRY_POINTS.md)
- 代码基线：`main`，版本 `0.1.0`
- 报告建立日期：2026-09-22
- 结论：**条件通过（前端自动化、构建与浏览器演示层；Rust/Tauri 与 Windows/macOS 桌面证据待补）**

本报告只判定壳层、导航、工作区/会话入口、设置入口和窗口承载的 W0-A 子范围。它不等同于模型设置、对话、文件编辑器或日志中心的完整业务通过。设置页保存/返回、模型状态保持和运行中任务的跨域复核，在 W1/W2 联调后重新执行。

## 1. 统一生命周期定位

本域按当前版本统一流程留存证据：

`功能域 → 竞品证据 → 设计决策 → 前后端实现 → 自动化测试 → 本地桌面验收 → 测试人员回传 → 验收报告 → 遗留项复审`

其中本轮完成了前端代码追踪、自动化测试和构建核对；Rust/Tauri 测试受当前 Linux 图形依赖阻断。本地桌面验收必须由测试人员在 macOS/Windows 执行并上传原始输出、截图/录屏和人工观察。任何 `<待回填>` 均不能计为通过。

## 2. 功能范围、入口和依赖

| 功能点 | 入口 | 本轮目标 | 前置/后续依赖 |
| --- | --- | --- | --- |
| `BF-WORKSPACE-001` | `EP-WORKSPACE-001` | 添加或打开工作区；空态可达；失败保留当前状态 | 无；桌面目录选择器需实机确认 |
| `BF-WORKSPACE-002` | `EP-WORKSPACE-002` | 切换登记项目；检查任务和未保存文档 | 无；完整任务阻断需 W2/W4 联调 |
| `BF-WORKSPACE-003` | `EP-WORKSPACE-003` | 刷新项目、会话和文件树，保持页面 | 已打开工作区；文件域回归 |
| `BF-WORKSPACE-004` | `EP-WORKSPACE-004` | 搜索项目、会话和当前项目文档，显示无结果 | 当前项目正文搜索依赖工作区 |
| `BF-WORKSPACE-005` | `EP-WORKSPACE-005` | 二次确认删除项目记录，不删除目录 | 无运行任务、无未保存文档 |
| `BF-CONVERSATION-001` | `EP-CONVERSATION-001` | 新建会话并进入对话页 | 可无模型启动；发送消息依赖 W1 |
| `BF-CONVERSATION-002` | `EP-CONVERSATION-002` | 恢复会话、标题和消息；跨项目加载不串写 | 会话记录存在；真实生成依赖 W1/W2 |
| `BF-CONVERSATION-003` | `EP-CONVERSATION-003` | 删除会话记录；运行中会话禁用 | 无运行任务 |
| `BF-SHELL-001` | `EP-SHELL-001` | 折叠/展开侧栏，保持页面与业务状态 | 无；macOS Overlay 需实机确认 |
| `BF-SHELL-002` | `EP-SHELL-002` | 切换浅色/深色主题，保持业务状态 | 无；原生窗口主题需桌面复核 |
| `BF-SHELL-003` | `EP-SHELL-003` | 最小化、最大化/还原、关闭 | Tauri 桌面运行时 |
| `BF-SHELL-004` | `EP-SHELL-004` | 撤销、重做、复制、粘贴、全选等通用编辑命令 | 编辑器存在时验证；浏览器仅证明调用路径 |
| `BF-NAV-001..003` | `EP-NAV-001..003` | 对话/文件/日志互斥切换，保留工作区和会话 | 页面域各自实现；日志完整链路在 W4 |
| `BF-SETTINGS-001` | `EP-SETTINGS-001` | 从侧栏、标题栏进入设置并可返回 | 壳层可先验；保存和模型状态在 W1 复核 |
| `BF-DIAGNOSTICS-001` | `EP-DIAGNOSTICS-001` | 查看快捷键、窗口诊断和应用日志 | 桌面日志路径需实机确认 |

## 3. 竞品证据与设计决策

正式名称、类别和市场准入以[正式竞品名录](../../../competitors/COMPETITOR_CATALOG.md)及[术语规范](../../../competitors/TERMINOLOGY.md)为准。竞品存在某功能只说明观察证据，不构成 Vinkey 必须实现该功能。

| 设计事项 | 正式竞品证据 | 证据等级 | Vinkey 决策 | 不采用内容 | 追踪 |
| --- | --- | --- | --- | --- | --- |
| 本地工作区作为一级边界 | Obsidian；MarkText；NoteGen | A：长期产品/公开文档和社区可复核 | 项目记录绑定本地目录；文件和应用记录分开；工作区切换检查未保存与运行任务 | 不采用云同步、账号/成员和全盘隐式访问 | `CF-019`/`CF-020` |
| AI 与文档共存的桌面壳层 | Cursor；Cherry Studio | A/B：产品长期使用与公开界面/文档 | 左侧项目/会话，右侧统一内容区；当前工作区和活动模型始终可见 | 不采用代码终端、调试、知识库市场等非文学入口 | `CF-019` |
| 低干扰文件/编辑菜单和快捷键 | Typora；Scrivener | A：成熟桌面写作产品与公开帮助 | 文件、编辑、查看、窗口、帮助分层；快捷键与菜单同一业务语义 | 不照搬编译出版、复杂元数据和单文档优先结构 | `CF-019` |
| macOS 原生菜单/窗口习惯 | Ulysses；Cursor；ChatGPT Desktop | A/B：平台产品行为和公开资料 | macOS 使用原生系统菜单和 Overlay；Windows 使用自绘标题栏但保留窗口控制习惯 | 不采用平台专属账号、全局悬浮和语音增长入口 | `CF-021` |
| 中文菜单和轻量桌面入口 | 豆包桌面端；WorkBuddy | B：商业产品公开可观察体验 | 应用级命令统一中文，设置、诊断和任务状态可发现 | 不采用消费内容、企业协作或不可审计的常驻助手入口 | `CF-021` |
| 多项目/会话统一控制面 | CloudCLI（仓库名 `claudecodeui`，原 Claude Code UI）；Opcode | B：正式生态参考的公开产品/仓库行为 | 仅借鉴项目、会话和任务的入口分层；本地权限和工作区边界由 Vinkey 自己控制 | 不接管外部 CLI，不实现远程终端或多 CLI 代理 | `CF-020`；见 `COMPETITOR_CATALOG.md` 第 3 组 |
| 搜索与工作区切换位置 | Notion Desktop；Obsidian | A/B：成熟工作区产品可观察行为 | 搜索放在侧栏，结果明确区分项目、会话和当前项目文档，不改变选择 | 不采用云空间、分享、成员和账号入口 | `CF-020` |
| Vinkey 原创安全/状态约束 | 无单一竞品可直接证明 | C：产品安全和本地数据边界决策 | 删除只删除应用记录；运行中/未保存禁止静默切换；异步结果校验 workspace ID；图标入口含可访问名称 | 不以竞品“有此功能”为理由放宽权限或丢弃状态 | `CF-019`/`CF-020`/`CF-021` |

## 4. 决策到设计映射

| 决策 | 设计落点 | 验收断言 |
| --- | --- | --- |
| `CF-019` | `UI-SHELL-APP-MENUS`、`UI-SHELL-CONTENT-SWITCHER`、`UI-SHELL-CONTENT-SUMMARY` | Windows/macOS 有同义核心命令；页面切换不清空工作区、会话和草稿 |
| `CF-020` | `UI-SIDEBAR-ADD-PROJECT`、`UI-SIDEBAR-SEARCH`、`UI-PROJECT-SELECT`、`UI-CONVERSATION-*` | 项目/会话/文档搜索结果可解释；切换、删除和异步加载不串项目 |
| `CF-021` | `UI-SHELL-WINDOW-CONTROLS`、`UI-SIDEBAR-COLLAPSE`、`UI-SIDEBAR-THEME`、`UI-SHELL-RUNTIME-LOG-*` | 窗口、主题、折叠、快捷键和诊断入口有键盘路径、焦点和错误反馈 |

## 5. 实现追踪

| 层级 | 代码位置 | 当前核对结果 |
| --- | --- | --- |
| 应用组装与页面路由 | [`src/App.tsx`](../../../src/App.tsx) | `ContentPage` 管理对话/文件/日志；`settingsOpen` 管理设置；工作区切换前检查任务和未保存文档；异步打开文档校验 workspace ID |
| Windows 标题栏/菜单 | [`src/App.tsx`](../../../src/App.tsx) `TitleBar` | 自绘 36px 标题栏、文件/编辑/查看/窗口/帮助菜单、窗口控制、Escape 关闭和双击最大化路径已实现 |
| macOS 菜单/主题 | [`src/App.tsx`](../../../src/App.tsx) `installMacMenu`；[`src/lib/desktop.ts`](../../../src/lib/desktop.ts) | 原生菜单安装、主题同步、菜单失败进入全局错误；需 macOS 实机确认承载和交通灯布局 |
| 项目/会话侧栏 | [`src/components/ProjectSessionSidebar.tsx`](../../../src/components/ProjectSessionSidebar.tsx) | 添加/刷新/搜索/展开/切换/删除/新建/恢复/设置入口，加载失败原位重试，图标含 `title`/`aria-label` |
| 删除确认 | [`src/components/RecordDeletionDialog.tsx`](../../../src/components/RecordDeletionDialog.tsx) | 项目名称二次确认，会话运行中禁用，错误留在对话框并可重试 |
| 应用状态 | [`src/store.ts`](../../../src/store.ts) | `settingsOpen` 临时折叠并恢复侧栏；主题、页面承载状态、活动会话和运行锁定集中管理 |
| 桌面桥接 | [`src/lib/desktop.ts`](../../../src/lib/desktop.ts) | 浏览器演示与 Tauri 分流；工作区、项目、会话、窗口主题/控制和诊断入口统一封装 |
| Rust/Tauri 工作区边界 | `src-tauri/src/lib.rs`、`projects.rs`、`database.rs` | 授权工作区、路径守卫、项目记录、运行任务阻断和窗口诊断命令已登记；目标平台编译/运行需人工验证 |
| 原生窗口控制 | `src-tauri/src/window_controls.rs`、`src/lib/nativeWindowControls.ts` | macOS 侧栏宽度变化同步原生交通灯布局；ResizeObserver 单元测试已有 |
| 布局与响应式 | [`src/styles.css`](../../../src/styles.css) | 设计稿定义 1440×900、1280×800、1024×680、288/248/52px 侧栏约束；本轮尚未取得实机截图 |

## 6. 自动化测试矩阵

### 6.1 已有证据

| 测试文件 | 覆盖内容 | 结果 |
| --- | --- | --- |
| [`src/store.test.ts`](../../../src/store.test.ts) | 活动模型、会话运行状态、切换会话、删除记录、设置打开/关闭时侧栏恢复和用户覆盖 | 已有断言；命令结果见 6.2 |
| [`src/components/RecordDeletionDialog.test.tsx`](../../../src/components/RecordDeletionDialog.test.tsx) | 项目二次确认、精确名称、取消、错误留在对话框和重试 | 已有断言 |
| [`src/components/SettingsPage.test.tsx`](../../../src/components/SettingsPage.test.tsx) | 设置入口承载的模型状态、连接失败、活动模型删除后的校正 | W1 依赖证据，不替代壳层桌面验收 |
| [`src/lib/nativeWindowControls.test.ts`](../../../src/lib/nativeWindowControls.test.ts) | 侧栏展开/折叠宽度、合并 ResizeObserver 更新、失败回调和清理 | 已有断言 |
| [`src/lib/desktop.test.ts`](../../../src/lib/desktop.test.ts) | 浏览器演示数据、会话历史和桥接侧行为 | 已有断言 |

### 6.2 本轮执行记录

| 命令 | 结果 |
| --- | --- |
| `NODE_ENV=test npm test` | 通过：37 个测试文件、249 个测试通过（退出码 0；2026-09-22） |
| `npm run build` | 通过：`tsc -b && vite build` 完成（退出码 0；Vite 产物生成，存在既有 bundle 体积提示） |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 阻断：当前 Linux 主机 `glib/gobject 2.68.4`，依赖要求 `>= 2.70`；同时未发现 `gdk-3.0.pc`。未进入 Rust 测试阶段，不能替代 Windows/macOS Tauri 验收。 |

当前仓库没有针对 `App`/`TitleBar`/`ProjectSessionSidebar` 的直接渲染测试，因此以下行为不能仅凭现有单元测试判定通过：菜单打开/外部点击/Escape、页面 tab 切换、Tauri 最小化/最大化/关闭、macOS 原生菜单、窗口真实尺寸和浏览器/桌面差异。

## 7. 业务链路验收矩阵

| 用例 | 操作链路 | 自动化现状 | 桌面人工证据 | 当前结论 |
| --- | --- | --- | --- | --- |
| `SHELL-001` 首次空态 | 启动 → 无工作区 → 添加项目/打开文件夹 | 演示桥接和状态逻辑已有 | Windows/macOS 截图、目录选择结果 | 条件通过 |
| `SHELL-002` 项目切换 | 侧栏项目 → 运行/未保存检查 → 切换 → 恢复页面 | store/项目逻辑有覆盖；跨平台 UI 未覆盖 | 两项目截图、未保存确认、任务阻断 | 条件通过 |
| `SHELL-003` 搜索 | 输入项目/会话/文档关键词 → 查看结果/无结果 → 清除 | 搜索逻辑在组件实现；无直接组件测试 | 结果范围、行号、中文路径截图 | 待人工 |
| `SHELL-004` 会话 | 新建 → 切换项目 → 恢复 → 删除确认 | store/删除对话框覆盖 | 实机完整链路和刷新后持久化 | 条件通过 |
| `SHELL-005` 页面导航 | 对话 ↔ 文件 ↔ 日志 → 返回对话 | 页面回调在 `App.tsx` | 各窗口尺寸截图，确认状态不丢失 | 待人工 |
| `SHELL-006` 设置入口 | 侧栏/菜单进入设置 → 关闭/返回 | store 已覆盖侧栏恢复 | 设置页入口、返回、未保存和 W1 模型状态 | 条件通过，W1 复核 |
| `SHELL-007` Windows 菜单 | 文件/编辑/查看/窗口/帮助 → 点击外部/Escape | 无直接 `TitleBar` 渲染测试 | 菜单截图、快捷键和实际动作 | 待人工 |
| `SHELL-008` macOS 菜单与交通灯 | 原生菜单 → Overlay 交通灯 → 折叠/展开侧栏 | 原生宽度同步单测 | macOS 截图、窗口诊断和菜单动作 | 待人工 |
| `SHELL-009` 窗口控制 | 最小化 → 最大化/还原 → 关闭 | 无桌面窗口集成测试 | 三平台/尺寸动作和诊断日志 | 待人工 |
| `SHELL-010` 主题/键盘 | 主题切换 → Ctrl/Cmd+S → Escape → Tab 焦点 | store/桥接部分覆盖 | 焦点可见、主题截图、快捷键结果 | 待人工 |
| `SHELL-011` 删除保护 | 运行任务/未保存 → 删除或切换 | store、Rust guard、对话框覆盖 | 实机阻断提示和恢复路径 | 条件通过，W2/W4 复核 |
| `SHELL-012` 错误/诊断 | 工作区失败、菜单失败、日志入口 → 重试/关闭 | 错误状态代码已有 | 脱敏日志、错误位置和重试截图 | 待人工 |

## 8. 测试人员人工材料（必须回传）

### 8.1 环境元数据

- 操作系统及版本：`<macOS VERSION / Windows VERSION>`
- CPU/架构、显示缩放/DPI：`<ARCH>`、`<DPI>`
- Vinkey 版本/Git SHA：`<VERSION> / <GIT_SHA>`
- Node.js/Rust/Tauri/Ollama：`<VERSIONS>`；本域无模型时标注 `N/A`，若进入设置/W1 则填写 profile/model
- 执行人、日期、实际窗口尺寸：`<TESTER>`、`<DATE>`、`<SIZE>`
- 命令、退出码、stdout/stderr、结果 JSON（若已编写脚本）：`<...>`

### 8.2 截图/录屏最低集合

每个平台至少保存 `1440×900`、`1280×800`、`1024×680` 三种窗口尺寸中的可执行集合，并使用脱敏文件名：

1. Windows 自绘标题栏、菜单和窗口按钮；macOS Overlay 标题区、原生菜单和红黄绿交通灯。
2. 侧栏展开/折叠、设置入口打开/关闭后的宽度和状态。
3. 对话/文件/日志切换；工作区添加、切换、刷新和无工作区空态。
4. 会话新建、恢复、删除确认；搜索结果、无结果和中文路径。
5. 菜单展开、Escape/外部点击关闭、快捷键执行；最大化/还原/关闭。
6. 主题切换、键盘焦点、无会话/无文件/错误/加载/任务运行中状态。

### 8.3 每个场景的人工记录

| 字段 | 必填内容 |
| --- | --- |
| 用例与步骤 | `SHELL-*`、实际点击/键盘步骤和前置状态 |
| 预期/实际 | 按设计断言填写，不写“看起来正常” |
| 证据 | 截图/录屏文件名、stdout/stderr 或诊断日志路径 |
| 结论 | `PASS / FAIL / BLOCKED`；未执行不得填 `PASS` |
| 问题 | 问题编号、复现步骤、影响等级和临时规避方式 |

### 8.4 证据归档

建议目录：

```text
shell-<YYYYMMDD>-<platform>/
├── ui-observations.md
├── screenshots/
├── recordings/
├── stdout.txt
├── stderr.txt
├── diagnostics.txt
└── SHA256SUMS
```

不得提交 API Key、完整作品正文、系统用户名或未脱敏绝对路径。报告只保留摘要和 SHA-256，原始材料由测试人员通过受控附件或约定归档位置提供。

## 9. 当前缺口、复核与判定

1. 需要新增或补齐 `scripts/shell/` 的跨平台窗口/菜单诊断入口、`--json` 结果和脚本合同测试；在此之前人工截图仍是主证据。
2. 需要为 `App`、`TitleBar`、`ContentPanel` 和 `ProjectSessionSidebar` 增加可隔离的渲染测试或明确其不可自动化部分，至少覆盖页面切换、Escape 菜单关闭、设置入口和无工作区空态。
3. macOS 原生菜单、Overlay 交通灯、Windows 自绘窗口按钮、真实窗口尺寸和 DPI 必须在目标系统执行；Linux/浏览器不能替代。
4. 设置页返回后的侧栏和页面状态在 W1 复核；运行任务/未保存状态在 W2/W4 复核；对话、文件、日志域完成后做跨域回归。

判定规则：自动化和源码只能支持“代码层通过”；平台材料未回传时为“条件通过”；关键入口不可达、状态丢失或权限边界失效为“不通过”；环境使结论不可得为“阻断”。

## 10. 测试人员回填区

- 自动化层：`<PASS/FAIL/BLOCKED + COMMAND_AND_RESULT>`
- Windows 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- macOS 桌面层：`<PASS/FAIL/BLOCKED/待回填>`
- 人工 UI 观察：`<PASS/FAIL/BLOCKED/待回填>`
- 结果 JSON/日志/截图 SHA-256：`<ARTIFACTS>`
- 问题列表：`<ISSUES>`
- 综合结论：`<通过/条件通过/不通过/阻断>`
- 下一次复审版本/日期：`<NEXT_REVIEW>`
