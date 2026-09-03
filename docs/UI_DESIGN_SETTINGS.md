# UI 设计：设置页

## 目标

设置页是独立的配置工作面，不使用多层弹窗。模型配置和本机外观偏好应能被单独理解、测试和恢复。

## 进入与退出

- 入口固定在项目与会话栏底部。
- 打开设置时右侧内容区由设置页替换，侧栏自动折叠以释放横向空间。
- 右上角“返回工作区”关闭设置；`Esc` 是辅助关闭方式。
- 进入前记录侧栏状态；关闭时恢复，设置期间用户手动折叠/展开优先。

## 当前分组

### 模型

- 模型列表支持新增、选择和删除；活动模型用勾选状态标识。
- 提供商：Ollama、OpenAI 兼容。
- 字段：配置名称、Base URL、模型、上下文窗口；OpenAI 兼容增加 API Key。
- “测试连接”显示连接结果和可用模型；“保存并启用”保存后设为活动模型。
- 删除前必须确认；API Key 仅进入系统凭据库，不写入 SQLite、前端存储或日志。

### 外观

- 当前提供深色/浅色主题分段控件。
- 主题偏好保存在本机，并同步 macOS 原生窗口主题。

## 目标分组

后续可增加编辑器（字体、字号、行高、自动换行、自动保存）、数据（会话位置、导出、删除、日志）和权限（已授权工作区、撤销授权）。增加分组时保持左侧导航和独立页面结构，不改造成弹窗堆叠。

## 页面预览（Markdown 预览）

该 HTML 区块用于确认设置入口、分组导航和配置表单的层级。背景采用浅色中性灰阶，仅用于区分区域，不代表产品实际配色或状态语义：

<table border="1" cellpadding="8" cellspacing="0" width="100%">
  <tr><td colspan="2" bgcolor="#F1F3F5"><strong>设置</strong>　　　　　　　　　　　　　　　　　　　　　　　　　<strong>返回工作区</strong></td></tr>
  <tr>
    <td width="24%" height="190" valign="top" bgcolor="#F8F9FA"><strong>设置导航</strong><br><strong>模型</strong><br><strong>外观</strong><br><small>后续：编辑器　数据　权限</small></td>
    <td valign="top" bgcolor="#FFFFFF">
      <strong>模型配置</strong><br>
      配置名称　 Base URL　 模型　 上下文窗口　 API Key<br><br>
      <strong>测试连接</strong>　连接结果　　　　　　　　　<strong>保存并启用</strong><br><br>
      <hr>
      <strong>外观</strong>　 <strong>深色</strong>　|　浅色
    </td>
  </tr>
</table>

## 状态

- 初始空模型列表：新增配置表单应仍可用。
- 测试中/保存中：按钮固定尺寸并禁用重复操作。
- 连接成功/失败：结果显示在表单内，失败提供可重试路径。
- 删除配置：确认文案必须说明凭据库中的 API Key 也会删除。
