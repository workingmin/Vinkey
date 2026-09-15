# UI 设计：模型设置

- 状态：当前实现基线
- 日期：2026-09-15
- 业务入口：[UI_ENTRY_POINTS.md](./UI_ENTRY_POINTS.md)

## 目标

设置页用于设置当前模型、管理模型服务和查看本机配置。底层仍会检查模型能否支持应用所需的响应格式，但页面统一使用“检查”“可用”等用户语言，不呈现 Skill、Schema、格式准入等实现术语。

## 页面结构

页面由工具栏、全局反馈、主内容区和右侧信息栏组成：

1. 工具栏显示页面标题“模型设置”、简短用途说明和返回按钮。
2. 全局反馈仅在保存、删除、选择模型或检查产生结果时出现。
3. 主内容区依次显示“当前模型”和“模型服务”。
4. 右侧信息栏显示“本机配置”。

桌面宽度下，主内容区和信息栏按 `minmax(0, 1fr) 260px` 排列。容器宽度小于 `900px` 时信息栏移到主内容下方并分成两列；视口宽度小于 `700px` 时改为单列。

## 区域预览

以下内容使用 Markdown 内嵌 HTML，并只采用当前应用 `rehypeRaw + rehypeSanitize` 可保留的安全标签，可直接在 Markdown Preview 中查看。它只表达区域层级、标签和控件顺序，不承担交互逻辑。

<table width="100%">
  <tr>
    <td colspan="2">
      <strong>模型设置</strong><br>
      <small>设置当前模型并管理模型服务　<kbd>返回工作区</kbd></small>
    </td>
  </tr>
  <tr>
    <td width="72%" valign="top">
      <h3>当前模型</h3>
      <p>对话、续写和改稿等功能均使用此模型。</p>
      <p>
        <kbd>qwen3:8b · 本地 Ollama</kbd>　<strong>可用</strong>
      </p>
      <p><small>本地 Ollama · 16,384 tokens</small></p>
      <hr>
      <p><strong>模型服务</strong>　<kbd>添加服务</kbd></p>
      <table width="100%">
        <tr>
          <td width="32%" valign="top">
            <strong>本地 Ollama</strong><br>
            <small>http://localhost:11434</small><br>
            <small>2/3 个模型可用</small><br><br>
            <strong>远程 AI</strong><br>
            <small>https://api.example.com/v1</small><br>
            <small>无法连接</small>
          </td>
          <td valign="top">
            <h4>服务设置</h4>
            <p>名称　<kbd>本地 Ollama</kbd></p>
            <p>服务类型　<kbd>Ollama</kbd></p>
            <p>服务地址　<kbd>http://localhost:11434</kbd></p>
            <p>API 密钥　<kbd>没有密钥可留空</kbd></p>
            <hr>
            <p>
              <strong>模型列表　3</strong>　
              <kbd>查看模型列表</kbd>　
              <kbd>保存并检查模型</kbd>
            </p>
          </td>
        </tr>
      </table>
    </td>
    <td width="28%" valign="top">
      <h3>本机配置</h3>
      <p><strong>标准配置</strong><br><small>统一内存 32 GB</small></p>
    </td>
  </tr>
</table>

## 当前模型

- 这是应用级唯一活动模型，不是某个会话的默认值；对话区只显示当前模型，不提供会话级切换。
- 选择器的可访问名称为“当前模型”，触发器同时显示模型名和服务名。
- 选项浮层优先向下展开；下方空间不足时根据应用窗口内的可用空间改为向上，并随窗口缩放或滚动更新位置。
- 可选项只来自当前已缓存且检查通过的服务与模型组合。
- 已保存但没有有效检查结果的当前模型仍显示，并标记“需要检查”，避免重开应用后静默替换用户选择。
- 状态只使用“可用”“需要检查”和“未选择”，不暴露底层验证方式。
- 元信息显示服务名称，并告知上下文已由检查结果自动配置；用户不能手动修改该值。
- 检查过程中如果模型不接受初始上下文长度，应用会自动降低配置并重试。

## 模型服务

- 左侧服务列表显示名称、服务地址、检查进度或可用数量。
- 状态点位于列表项右侧并与服务名称水平对齐；删除按钮位于状态点正下方，悬停、选中或键盘聚焦时显示。
- 右侧表单字段为“名称”“服务类型”“服务地址”和“API 密钥”。密钥是否必填由目标服务决定，因此空值提示为“没有密钥可留空”。
- 添加服务只打开未保存表单，不自动获取或检查模型。
- “保存并检查模型”先保存服务，再获取模型列表，最后顺序检查列表中的全部模型；检查结果会自动保存每个模型的上下文长度。
- 一个页面最多展开一个服务的模型列表。折叠按钮使用“查看模型列表/收起模型列表”。
- 刷新按钮重新获取模型列表，并清除该服务的旧检查结果。
- “检查全部模型”不修改服务配置，只重新检查当前列表中的模型。
- 连接身份由规范化后的服务地址和 API 密钥共同决定：相同地址且 API 密钥相同（包括都为空）只能保存一条；相同地址但 API 密钥不同可以共存。名称不参与去重。
- 服务地址去除首尾空白和末尾斜杠，并按服务类型补齐默认协议/路径（Ollama 的 `/v1` 归一为根路径，OpenAI 兼容服务的根路径归一为 `/v1`）。
- API 密钥只保存于桌面系统凭据库；数据库和浏览器演示模式仅保存不可逆 SHA-256 指纹，绝不将密钥写入持久化存储。

## 模型检查

当前自动检查验证以下事实：

1. 连接能够返回模型目录。
2. Ollama 接口接受 `format` Schema，或 OpenAI 兼容接口接受 `response_format: json_schema`。
3. 返回内容能解析为 JSON，并符合探测约定的字段和值。

检查不评测中文创作质量，也不保证模型的理论最大上下文长度。因此页面不使用“中文能力已验证”或“上下文达标”等标签。中文质量与实际上下文容量属于独立的产品测试和运行时验证。

本机 Ollama 的每个候选模型完成探测后都会发送 `keep_alive: 0`，避免探测模型堆积影响后续显存测量。该行为没有用户开关。

## 本机配置

- “最低配置”“标准配置”“推荐配置”只描述本机内存和独立显存档位，不代表当前模型已经适配该设备。
- 无法读取必要硬件信息时显示“硬件未确认”；低于最低门槛时显示“低于最低配置”。
- 硬件不足或无法确认时提供“添加远程服务”入口。

## 组件与业务功能映射

本表是设置页面验收清单，覆盖当前模型、模型服务、检查结果和本机配置。

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

## 数据与状态

- 模型列表、检查结果和自动配置的上下文长度缓存在 `vinkey.modelProbeCache`，按连接 ID、接口协议和 Base URL 校验。
- 数据库通过 `model_connections(base_url, credential_fingerprint)` 唯一索引和保存前校验保证连接复合身份不重复；历史重复连接迁移时保留最近更新的一条并迁移其模型关联。
- API Key 不写入该缓存；桌面端凭据由系统凭据库管理。
- 无匹配缓存的已保存服务在设置页打开时只获取模型列表，不自动运行全部检查。
- 保存服务或用户明确点击重新检查时才执行全部模型检查，并更新上下文配置。
- 删除连接会同时删除模型配置、准入缓存，并由 Store 校正唯一活动模型。
- 初始加载、保存、对话生成或分析运行期间锁定连接和活动模型修改；正在获取模型列表或检查模型的连接不能删除。
- 离开存在未保存修改的表单前需要确认。
- 浏览器模式使用模拟连接和探测结果；真实请求与凭据访问仅由桌面端执行。

## 验收

- 当前模型、服务列表和模型目录的选择、加载、空态、失败及检查结果均可在本页完成核对。
- 相同规范化服务地址和相同 API Key（包括都为空）不能重复保存；同地址不同密钥可以共存。
- API Key 不以明文进入数据库、缓存、日志或 UI 反馈；删除服务有确认，删除密钥必须显式勾选并保存。
- 加载、保存、对话生成、分析运行和连接探测期间的禁用范围与组件表及源码一致。
- 表中每个 `UI-*` 均关联有效的 `BF-*`、`EP-*`，实现状态与源码一致。
