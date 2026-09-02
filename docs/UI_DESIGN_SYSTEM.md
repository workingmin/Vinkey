# UI 设计：视觉与组件系统

## 色彩 Token

### 深色主题（默认）

| Token | 值 | 用途 |
| --- | --- | --- |
| `bg-app` | `#111315` | 根背景 |
| `bg-rail` | `#17191C` | 标题栏 |
| `bg-sidebar` | `#1C1F22` | 会话栏、文件列表、内容面板 |
| `bg-editor` | `#151719` | 对话区、编辑器 |
| `bg-elevated` | `#23272B` | 菜单、输入框、diff 头部 |
| `bg-selected` | `#293036` | 选中行 |
| `border` / `border-strong` | `#30353A` / `#41484F` | 分隔线、焦点边界 |
| `text-primary` / `text-secondary` / `text-muted` | `#E8EAED` / `#A7ADB4` / `#7E858D` | 文字层级 |
| `accent` / `accent-hover` | `#36B8C4` / `#51C8D2` | 主操作、当前状态 |
| `success` / `warning` / `danger` / `info` | `#55B88A` / `#D5A64A` / `#DC7078` / `#72A7D8` | 状态语义 |

### 浅色主题

`bg-app #F4F5F6`、`bg-rail #ECEEF0`、`bg-sidebar #F8F9FA`、`bg-editor #FFFFFF`、`bg-selected #E5ECEE`、`border #D8DCE0`、`text-primary #202428`、`text-secondary #5F676F`、`text-muted #687078`、`accent #087F8C`、`accent-foreground #FFFFFF`。

## 字体和尺寸

- UI：`system-ui`、`-apple-system`、Segoe UI、PingFang SC、Microsoft YaHei、sans-serif。
- 编辑/代码：`ui-monospace`、SFMono-Regular、Consolas、monospace。
- UI 常规 13px，辅助 12px，编辑正文默认 16px、行高 1.8；字距为 0。
- 4px 间距网格；常用 4/8/12/16/24px。
- 图标按钮 28px 或 32px，图标 16px；输入框 32px。
- 菜单、输入框、消息弱底色块 6px；对话框和真正浮层 8px；常驻面板不用卡片阴影。

## 控件规则

- 熟悉命令（保存、刷新、收起、撤销等）使用 Lucide 图标按钮并提供 tooltip。
- 明确主操作（打开文件夹、接受全部、另存为）使用图标加文字；同一操作区只有一个主按钮。
- 危险操作不用主强调色；删除、放弃未保存、覆盖冲突才使用阻断确认。
- 标签高度固定 24px，长文件名截断并通过 tooltip 展示完整路径。
- 状态不能只依赖颜色：连接状态、diff、未保存都要有文字或图标。

## 动效、焦点和无障碍

- 微交互 120–180ms，面板展开收起 180–220ms；流式文字不逐 token 动画。
- 遵循系统减少动态效果偏好。
- 所有控件可键盘访问，焦点轮廓 2px 强调色；文字对比度达到 WCAG AA。
- 支持中文 IME；文本缩放后工具栏、标签和状态栏不重叠。
- 拖动行为必须有菜单或按钮等价路径。
