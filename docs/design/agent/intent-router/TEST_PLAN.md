# IntentRouter 候选路由测试计划

- 对应架构：[IntentRouter 三层架构与本地模型补强](ARCHITECTURE.md)
- 当前基线：[IntentRouter 测试与验收](TEST_ACCEPTANCE.md)
- 目标套件：`intent-router-eval-3`（候选合同已接入评测，运行时 resolver 仍分阶段落地）

## 1. 测试目标

测试不只问“模型 top-1 是否猜中”，而要验证完整链路：

1. Layer 0 是否正确提取 targets、workspace、action 和权限事实；
2. Layer 1 是否把相近意图变成可区分的候选和反例；
3. Layer 2 是否能输出合法的 1-3 个候选，而不是 Markdown 或未知枚举；
4. Layer 3 是否只修正可证明的字段，无法判断时是否澄清或拒答；
5. 最终 `TaskPlan` 是否满足 Agent/Skill Registry、正文访问和副作用合同。

模型原始指标、候选召回指标和最终有效路由指标必须分开统计。候选模式下 raw 的 `scope/documentSelection` 是由测试事实推导的合同字段，不应被误读为模型自由分类能力。最终验收不能由单一 `modelScore` 或 top-1 原始输出决定。

## 2. 分层用例矩阵

### 2.1 Layer 0：事实与权限

| 用例 | 输入变化 | 预期 |
| --- | --- | --- |
| 无目标闲聊 | 无 targets，询问标题/灵感 | `none + conversation + documentAccess=none` |
| 单文件分析 | 1 个 document | `single + selected-documents` |
| 多文件分析 | 2 个以上 document | `multiple + selected-documents` |
| 目标去重 | 同一 `kind + id` 重复 mention | 只计一次 |
| 路径误触发 | `@章节拆分-说明.txt`，实际问天气 | 路径词不产生路由证据 |
| 附件闲聊 | 带文件但只要灵感 | 保持 `conversation`，不得读取正文 |
| 显式 action | 自然语言与 `actionId` 冲突 | `actionId` 优先 |
| workspace 元数据 | 无 targets，询问文件清单 | `workspace-overview`，metadata-only |

这些用例必须在没有模型的情况下 100% 通过。

### 2.2 Layer 1：Prompt 与候选边界

| 用例 | 需验证的边界 |
| --- | --- |
| 人物关系 vs 故事主线 | 同时给正例和反例，不能只靠“分析”一词 |
| 人物命运 vs 情节结构 | 复合短语必须进入候选列表，不得强制静默单选 |
| workspace-overview vs workspace-analysis | “有哪些文件”与“分析人物关系”使用不同 Skill |
| general-chat vs document-analysis | 附件存在不等于要求读取附件 |
| continuity-review vs document-analysis | “前后矛盾/时间线冲突”优先连续性检查 |
| revision vs analysis | “改写/润色/重写”不能被“分析”词元覆盖 |

Prompt 合同测试应断言：候选集、反例、targets 数量规则、禁止正文和 `clarify` 分支都被注入，且没有 caseId、expected 或正文泄露。

### 2.3 Layer 2：候选结构化输出

最少覆盖以下输出：

```json
{
  "candidates": [
    {
      "intent": "character-analysis",
      "agent": "StoryDeconstruction",
      "skill": "character-arc-extraction",
      "modelScore": 0.72,
      "reasonCodes": ["character-fate"]
    }
  ],
  "needsClarification": false,
  "missingFacts": []
}
```

| 类别 | 输入输出 | 预期行为 |
| --- | --- | --- |
| 合法单候选 | 1 个候选，分数 0-1 | 解析成功 |
| 合法多候选 | 2-3 个不同的 Intent/Skill 路由组合 | 保留排序和证据 |
| 候选过多 | 4 个以上 | 拒绝或截断前先记诊断；默认拒绝 |
| 重复候选 | 同一 Intent + Skill 路由重复 | 拒绝，不静默合并；同一 Intent 的不同 Skill 允许并存 |
| 未知枚举 | 不存在的 Intent/Skill | `invalid-model` |
| 越界分数 | `-0.1`、`1.1`、NaN 字符串 | `invalid-model` |
| 非 JSON/Markdown | 代码块、解释文本 | `invalid-model` |
| 澄清结果 | `needsClarification=true` 且无强证据 | 不执行正文读取 |
| 缺失事实 | `missingFacts=["target-purpose"]` | 进入澄清，不猜测 |
| 旧单对象 | 旧模型五字段 JSON | 转为一个 `legacy-single` 候选并保留 raw |

`modelScore` 的测试只验证范围和排序，不把它当作已校准概率。候选概率的校准需要独立验证集、可靠性曲线和 Brier/ECE 等指标，不能从一次 Ollama 输出推断。

### 2.4 Layer 3：校正、澄清和拒答

| 用例 | 模型候选 | 词元/事实 | 预期有效路由 |
| --- | --- | --- | --- |
| 高置信词元纠偏 | document-analysis 0.55，character-analysis 0.45 | “人物命运”高信号 | character-analysis；记录 lexicon evidence |
| 结构词元纠偏 | character-analysis 0.55，document-analysis 0.45 | “故事主线”高信号 | document-analysis |
| 目标数量修正 | 任意候选 | 2 个 targets | `documentSelection=multiple` |
| 闲聊 scope 修正 | document-analysis | 附件但只要灵感 | general-chat/conversation；不得读正文 |
| 低 margin | 两个候选分数接近且证据冲突 | 无决定性事实 | `clarify` |
| 复合意图 | 人物命运和情节结构 | 两类证据接近 | 保留 top-2 或询问用户，不静默覆盖 |
| Registry 冲突 | 模型自报错误 Agent/Skill | Intent 合法 | 以 Registry 重算 |
| 非法候选 | 全部未知或越权 | 任意 | `reject`，不执行 Tool |
| 缺少模型 | 本地端点离线 | 确定性规则足够 | 规则路由；否则 `clarify` |

校正测试必须断言 `resolutionSource`、证据 token、margin、最终 `documentAccess` 和 `sourcePolicy`，不能只断言最终 Intent 字符串。

## 3. 版本化评测集

`intent-router-eval-3` 当前保留 12 个真实模型基线用例，并计划按以下四组扩展专项合同用例：

- 6 个最小对立对：人物关系/故事主线、项目文件清单/项目内容分析、附件闲聊/附件分析；
- 6 个候选输出合同用例：合法 top-1、合法 top-2、重复、未知、越界、澄清；
- 6 个后置校正用例：词元纠偏、事实纠偏、Registry 重算、scope 修正、低 margin 澄清、越权拒绝；
- 6 个故障降级用例：空输出、Markdown、服务超时、模型离线、旧单对象、模型与词元冲突。

每个用例都要包含 `instruction`、结构化 `targets`、expected candidate set、expected decision (`route/clarify/reject`) 和是否允许正文访问。小说素材只作为目标元数据和后续 Agent/Skill 集成素材，不把正文内容发送给分类器。

## 4. 指标与准入

### 4.1 指标

- `rawTop1Accuracy`：模型第一候选命中率，只观察模型能力；
- `rawTop2Recall`：期望 Intent 是否出现在前两候选；
- `candidateParseRate`：候选合同解析率；
- `effectiveRouteAccuracy`：校正后的有效路由准确率；
- `autoRouteCoverage`：未进入澄清或拒答、实际签发 route 的比例；
- `autoRouteExactMatchRate`：实际自动 route 中的精确匹配率；
- `rejectRate`：候选合同或安全校验拒答比例；
- `clarificationPrecision/Recall`：需要澄清的请求是否被正确澄清；
- `factContractAccuracy`：targets、scope、documentAccess、sourcePolicy 合同准确率；
- `unsafeExecutionRate`：错误候选是否导致正文或 Tool 越权，必须为 0；
- `correctionGain`：有效准确率减去原始 top-1 准确率，并按 resolution source 分组。

### 4.2 准入门槛

硬门槛：

- 候选合同解析率 100%；
- `factContractAccuracy` 100%；
- `unsafeExecutionRate` 0%；
- 非法输出、低 margin 和缺失事实不能直接执行 Tool。

软指标：

- `rawTop1Accuracy`、`rawTop2Recall` 和 `correctionGain` 用于比较模型和词典版本；
- 业务可接受的最终通过率按版本化套件设定，不用一次模型跑批临时放宽；
- 每次词典、阈值、Prompt 或模型变更都必须保存 raw/effective 双层结果。

## 5. 自动化落地顺序

1. 先把上述用例加入 `src/lib/intentModelEvaluation.test.ts` 和独立候选合同测试，不改变生产输出合同；
2. `IntentCandidate` parser/resolver 已接入本地模型评测；下一步抽取同一 resolver 到生产运行时，再扩展真实候选案例；
3. 通过 mock 测试验证边界，再用 SQLite 当前 profile 运行 macOS/Windows 真实模型验收；
4. 真实验收报告同时打印 raw、candidate、effective 三层结果，并以 effective 结果决定退出码。
