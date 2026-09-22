# 单个竞品报告模板

复制本文件后，将文件名改为稳定的英文产品名；详细报告放在 `docs/competitors/`，不要把一次体验直接写入架构结论。

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 产品/项目 | `产品名` |
| 类型 | 开源项目 / 商业产品 / Agent Runtime / 编辑器 / 写作工具 |
| 官方入口 | URL |
| 代码仓库 | URL 或“不适用” |
| 许可证/商业条款 | SPDX、官方条款或“待确认” |
| 观察版本/日期 | 版本、套餐、地区、日期 |
| 观察方式 | 源码 / 官方文档 / 可运行产品 / 截图或演示 |
| 相关 Vinkey 功能 | `CF-*` 编号 |

## 一句话判断

用一段话说明它解决什么问题、对 Vinkey 最有价值的观察是什么，以及它不适合直接迁移的边界。

## 功能观察

| 功能域 | 可观察做法 | 证据 | Vinkey 状态 | 取舍与差异 |
| --- | --- | --- | --- | --- |
| 工作区/项目 |  | URL、截图、源码路径或测试记录 | 已参考 / 部分参考 / 待参考 / 观察 / 不采用 |  |
| 上下文/检索 |  |  |  |  |
| Agent/Workflow |  |  |  |  |
| 编辑/改稿 |  |  |  |  |
| 资产/记忆 |  |  |  |  |
| 审批/隐私 |  |  |  |  |
| 结果/Artifact |  |  |  |  |

## 已参考功能

逐条写清：

- 采用的用户价值和具体交互。
- Vinkey 对应的业务对象、代码或设计文档。
- 与原产品不同的权限、数据、模型或平台边界。
- 当前测试或验收是否覆盖。

## 待参考功能

每项必须包括：

1. 真实用户场景和不做它的成本。
2. 隐私、许可证、性能和维护风险。
3. 最小可行实现，不引入不必要的 SDK 或平台依赖。
4. 验收指标、测试素材和退出条件。

## 明确不采用

记录被否决的能力、否决日期、原因和可能重新评估的触发条件。常见原因包括：

- 需要新增商用付费 API、账号或云端数据面。
- 与本地正文隐私、离线模型或 Tauri 跨平台边界冲突。
- 会绕过 Proposal、canon、记忆或正式写入审批。
- 展示成本高但没有改善任务完成率、来源准确率或人工修正时间。

## 验证记录

```yaml
comparison_run:
  scenario_id: string
  product: string
  product_version_or_date: string
  prompt: string
  attachments: string[]
  observed_steps: string[]
  approval_points: string[]
  final_artifacts: string[]
  elapsed_ms: number | null
  interruptions: number
  retries: number
  source_traceability: none | partial | complete
  output_accepted_without_edit: boolean
  manual_correction_minutes: number
  notes: string
```

## 结论

用不超过五条结论结束报告，并分别标注：进入 Vinkey 的设计文档、实现任务、评测任务或“不再跟进”。

