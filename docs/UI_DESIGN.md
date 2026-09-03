# Vinkey UI 设计文档

- 状态：首版 UI 基线，按域拆分维护
- 日期：2026-09-02
- 适用端：Windows、macOS 桌面应用
- 当前实现盘点：[UI_INVENTORY.md](./UI_INVENTORY.md)

## 文档结构

| 文档 | 负责的问题 | 下一步适合调整的范围 |
| --- | --- | --- |
| [UI_DESIGN_SHELL.md](./UI_DESIGN_SHELL.md) | 窗口、平台差异、会话栏、内容区信息架构 | 主窗口布局、导航、窗口级命令 |
| [TITLE_BAR_DESIGN.md](./TITLE_BAR_DESIGN.md) | 标题栏、平台菜单、快捷键和窗口诊断的实现基线 | 标题栏/菜单专项调整 |
| [UI_DESIGN_CHAT.md](./UI_DESIGN_CHAT.md) | 对话页、消息、输入区、上下文和流式生成 | 对话效率、消息审核、输入体验 |
| [UI_DESIGN_EDITOR.md](./UI_DESIGN_EDITOR.md) | 文件列表、文档标签、编辑器、预览和保存 | 文档编辑、预览、审核工作流 |
| [UI_DESIGN_SETTINGS.md](./UI_DESIGN_SETTINGS.md) | 设置页、模型配置、外观偏好 | 配置表单、连接状态、设置导航 |
| [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) | 色彩、字体、尺寸、控件和无障碍 | 视觉精调、组件一致性、键盘操作 |
| [UI_DESIGN_STATES.md](./UI_DESIGN_STATES.md) | 首次打开、空态、错误、响应式和验收 | 边界状态、跨平台验收、发布门槛 |

## 设计结论

Vinkey 是深色、安静、AI 对话优先的本地文学创作工作台。主窗口由左侧项目/会话栏和右侧统一内容区组成；右侧默认进入“对话”，需要查看或编辑文稿时切换到“文件”。不引入通用 IDE 的 Shell、Git、Tasks、Browser 或插件入口。

设计目标是让本地状态始终可见，让 AI 产出可审核，并让工具栏、输入区和状态栏保持稳定尺寸。平台菜单和标题栏可以不同，但命令能力、内容区布局和状态语义保持一致。

## 页面总览（Markdown 预览）

下面的 HTML 区块会在 Markdown 预览中直接渲染，用于快速确认页面区域和主要功能入口的分布。背景采用浅色中性灰阶，仅用于区分区域，不代表产品实际配色或状态语义：

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr>
    <td colspan="2" bgcolor="#F1F3F5"><strong>标题栏</strong>　品牌 / 工作区 / 当前模型　　文件　编辑　查看　窗口　帮助　　窗口控制</td>
  </tr>
  <tr>
    <td width="28%" bgcolor="#F8F9FA" valign="top">
      <strong>项目与会话栏</strong><br>
      切换工作区　刷新　折叠<br>
      <strong>统一搜索</strong><br>
      项目名称 / 路径 / 新建会话<br>
      会话历史列表<br>
      <strong>设置</strong>
    </td>
    <td bgcolor="#FFFFFF" valign="top">
      <strong>内容区顶栏</strong>　会话标题　工作区 · 模型　　<strong>对话</strong>　|　<strong>文件</strong><br><br>
      <table border="1" cellpadding="6" cellspacing="0" width="100%">
        <tr><td bgcolor="#F4F5F6"><strong>对话页（默认）</strong>　消息流　输入区　引用文件　模型　上下文　发送</td></tr>
        <tr><td bgcolor="#F4F5F6"><strong>文件页</strong>　文件列表　文档标签　编辑 / 分栏 / 预览　保存</td></tr>
      </table>
    </td>
  </tr>
</table>

## 使用规则

1. 先读 [UI_INVENTORY.md](./UI_INVENTORY.md) 判断需求针对的是现状、目标态还是两者之间的缺口。
2. 交互改动写入对应域文档；跨域规则才写回本文件或 `UI_DESIGN_SYSTEM.md`。
3. 每条目标态规则标记实现状态：`已实现`、`部分实现` 或 `待实现`。
4. 视觉细节必须引用设计 token，不在域文档中重复定义色值。
5. 新增界面先更新盘点，再补充对应域的流程、状态和验收条件。

## 首版范围

- 工作区选择、刷新、文件树、新建文档/文件夹
- 会话新建、历史恢复、统一搜索和流式 AI 对话
- Markdown、TXT、代码和配置文本编辑；Markdown 分栏预览；图片/PDF/音视频预览；二进制下载
- Ollama/OpenAI 兼容模型配置、连接测试和本机主题切换
- Windows 自绘菜单/窗口控制与 macOS 原生菜单/Overlay 标题栏

diff 审核、外部文件冲突、`@` 文件引用、更多设置分组（编辑器、数据、权限等）属于目标态，详见盘点和状态文档。
