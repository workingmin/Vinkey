# GitHub 同类项目调研与功能取舍

- 调研日期：2026-08-27
- 目的：为 Vinkey 的本地 AI 创作工作台补全真实可用闭环
- 原则：只参考公开架构与交互模式，不复制 GPL/AGPL 项目源码

## 参考项目

| 项目 | 定位与许可证 | 对 Vinkey 的启发 |
| --- | --- | --- |
| [NoteGen](https://github.com/codexu/note-gen) | Tauri、本地优先 Markdown + AI，GPL-3.0 | 对话上下文需要独立预算；知识内容、会话和模型配置应分层 |
| [SoloMD](https://github.com/zhitongblog/solomd) | Tauri、本地 Markdown + BYOK，MIT | 本地 Ollama 与 OpenAI 兼容接口应并列；API Key 进入系统凭据库；地址需规范化并支持模型探测 |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | 多模型 AI 工作台，AGPL-3.0 | “提供商配置”与“当前模型选择”应分离，连接测试必须是设置页中的一等状态 |
| [Knote](https://github.com/1661169091kiwi/Knote) | 本地优先、可审改 AI 编辑器，MIT | AI 改稿不能直接覆盖正文，应先形成可接受/拒绝的修改提案 |
| [MarkText](https://github.com/marktext/marktext) | 跨平台 Markdown 编辑器，MIT | 原子保存、外部文件变化、全文搜索、主题和标签状态属于编辑器底座能力 |

调研时的规模与活跃度仅用于判断实现是否经过真实用户验证，不作为选型依据。Vinkey 保持自身的 Tauri 2 + React + Rust 边界，不引入上述项目的框架层。

## 本轮落地

1. Ollama 与 OpenAI 兼容模型配置、模型发现、连接测试和流式对话。
2. API Key 仅由 Rust 写入 macOS Keychain / Windows Credential Manager，不进入 SQLite、前端持久化或日志。
3. SQLite 会话和消息持久化，支持新建、列表和恢复历史会话。
4. 显式上下文文档注入及发送前预算估算，超限时阻止请求。
5. 授权工作区内的 Markdown/TXT 全文搜索。
6. 深色/浅色主题设置并在本机保存。

## 后续阶段

- AI 修改提案数据模型、逐块 diff 审核与接受/拒绝。
- 文件系统监听、外部修改冲突对比和重新加载/另存为。
- 多工作区授权记录与撤销、会话导出和数据清理。
- 长会话摘要、精确 tokenizer 和模型上下文容量注册表。

## 人物资产提取专项调研（2026-09-04）

| 项目/产品 | 可复用的处理方式 | 对 Vinkey 的取舍 |
| --- | --- | --- |
| [StorySphere](https://github.com/willim9313/storysphere) | 段落级实体抽取 → 实体链接/去重 → 章节级关系与事件抽取；NetworkX 默认、Neo4j 可选；SQLite 任务/缓存 | 采用其分阶段 ETL 和 SQLite + 内存图思路，不把 Neo4j 设为首版依赖 |
| [graphify-novel](https://github.com/Anshler/graphify-novel) / [graphify](https://github.com/safishamsi/graphify) | 章节批处理、SHA 缓存、review 提案、update 写回；本地 JSON 图，可导出 Neo4j | 采用缓存、审核提案和增量更新；Vinkey 使用规范化 SQLite 代替单一 JSON blob |
| [NLP-Characters-Relationships](https://github.com/isthatyoung/NLP-Characters-Relationships) | NER、主客体分析、词向量共现 | 仅作为无模型/轻模型候选生成参考，不用于最终关系语义确认 |
| [Novelcrafter Codex](https://www.novelcrafter.com/features) | 人物/地点/lore 独立卡片、别名/昵称、正文 mentions、可排除 AI 的内容范围 | 采用“资产卡 + 提及索引 + 可控上下文”交互原则 |
| [Sudowrite Story Bible](https://www.sudowrite.com/) | 模型驱动的创意、人物和大纲协作 | 只借鉴模型辅助创作，不让模型绕过证据和人工确认写入 canon |

专项结论：人物资产业务应将“发现候选”“链接实体”“判断关系”“确认事实”“查询图谱”作为不同状态和不同任务；共现不等于关系，模型校验不等于事实确认，所有资产都要保留来源证据和文档版本。

### 推荐业务链路

```text
规则/词典初筛（高召回）
  → 候选与提及证据入库
  → 规范化、别名聚类与冲突分桶
  → 仅对冲突/低置信窗口调用模型
  → 用户确认人物实体与别名
  → 场景共现生成关系候选
  → 模型判断关系语义、方向、极性和时间
  → 用户确认高影响关系
  → 生成已确认图谱与统计
  → 文件指纹变化后局部失效、重算、合并
```

该链路同时满足三类目标：初筛成本可控，模型调用集中在规则最容易出错的地方，最终人物资产可解释、可审核、可增量更新。模型不可用时仍能完成候选提取和共现统计；模型恢复后从待校验状态继续，不需要重新扫描整本书。
